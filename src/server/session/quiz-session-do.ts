import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { createLiveStore, type LiveStore } from "./live-store";
import { createParticipantTokenService } from "./participant-token";
import { requireEventOwner } from "../auth/guard";
import { clientCommandSchema, type ClientCommand, type ServerEvent } from "../../shared/protocol";
import type { EventId, EventMeta, ParticipantId, Result } from "../../shared/domain-types";
import { err, ok } from "../../shared/domain-types";

type ConnectionRole =
  | { readonly role: "host" }
  | { readonly role: "stage" }
  | { readonly role: "participant"; readonly participantId: ParticipantId };

function isHostCommand(command: ClientCommand): boolean {
  return command.type !== "submitAnswer" && command.type !== "resync";
}

export class QuizSessionDO extends DurableObject<Env> {
  readonly #store: LiveStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = createLiveStore(ctx.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/internal/publish") {
      return this.#handlePublish(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/join") {
      return this.#handleJoin(request);
    }
    if (url.pathname === "/connect") {
      return this.#handleConnect(request, url);
    }

    return new Response("Not Found", { status: 404 });
  }

  async #handlePublish(request: Request): Promise<Response> {
    const meta = (await request.json()) as EventMeta;
    this.#store.initialize(meta);
    return new Response(null, { status: 204 });
  }

  async #handleJoin(request: Request): Promise<Response> {
    const { nickname } = (await request.json()) as { nickname: string };
    const state = this.#store.load();

    if (!state || state.eventMeta.status === "finished") {
      return Response.json({ ok: false, error: { code: "EVENT_FINISHED" } });
    }
    if (this.#store.listParticipants().length >= state.eventMeta.capacity) {
      return Response.json({ ok: false, error: { code: "CAPACITY_REACHED" } });
    }

    return Response.json(this.#store.addParticipant(nickname, Date.now()));
  }

  async #handleConnect(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const eventId = url.searchParams.get("eventId");
    const role = url.searchParams.get("role");
    if (!eventId || !role) {
      return new Response("Bad Request", { status: 400 });
    }

    const verified = await this.#verifyRole(request, eventId as EventId, role, url);
    if (!verified.ok) {
      return new Response("Unauthorized", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(verified.value);

    return new Response(null, { status: 101, webSocket: client });
  }

  async #verifyRole(
    request: Request,
    eventId: EventId,
    role: string,
    url: URL,
  ): Promise<Result<ConnectionRole, { readonly code: string }>> {
    if (role === "host") {
      const auth = await requireEventOwner(request, this.env, eventId);
      return auth.ok ? ok({ role: "host" }) : err({ code: auth.error.code });
    }

    if (role === "stage") {
      const token = url.searchParams.get("token");
      if (!token) return err({ code: "UNAUTHORIZED" });
      const row = await this.env.DB.prepare("SELECT id FROM event WHERE id = ? AND stage_token = ?")
        .bind(eventId, token)
        .first();
      return row ? ok({ role: "stage" }) : err({ code: "UNAUTHORIZED" });
    }

    if (role === "participant") {
      const token = url.searchParams.get("token");
      if (!token) return err({ code: "UNAUTHORIZED" });
      const verified = await createParticipantTokenService(this.env).verify(token, eventId);
      return verified.ok
        ? ok({ role: "participant", participantId: verified.value.participantId })
        : err({ code: verified.error.code });
    }

    return err({ code: "UNKNOWN_ROLE" });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const role = ws.deserializeAttachment() as ConnectionRole | null;
    if (!role) {
      ws.close(1011, "missing role");
      return;
    }

    let parsedJson: unknown;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      parsedJson = JSON.parse(raw);
    } catch {
      this.#sendRejection(ws, "INVALID_COMMAND", "message is not valid JSON");
      return;
    }

    const parsed = clientCommandSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.#sendRejection(ws, "INVALID_COMMAND", "message does not match the client command schema");
      return;
    }

    const command = parsed.data;
    if (role.role !== "host" && isHostCommand(command)) {
      this.#sendRejection(ws, "FORBIDDEN", "host commands are rejected on non-host connections");
      return;
    }

    // 進行コマンドの実際の処理（PhaseMachine連携・回答受付・同報）はタスク7で実装する。
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {}

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {}

  async alarm(): Promise<void> {}

  #sendRejection(ws: WebSocket, code: string, message: string): void {
    const event: ServerEvent = { type: "commandRejected", payload: { code, message } };
    ws.send(JSON.stringify(event));
  }
}

export function getSessionStub(
  env: Env,
  eventId: EventId,
  locationHint?: DurableObjectLocationHint,
): DurableObjectStub<QuizSessionDO> {
  return env.QUIZ_SESSION.getByName(eventId, locationHint ? { locationHint } : undefined);
}
