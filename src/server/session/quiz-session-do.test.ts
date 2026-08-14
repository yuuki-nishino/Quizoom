import { describe, it, expect } from "vitest";
import { env, runInDurableObject } from "cloudflare:test";
import type { EventId, EventMeta, ParticipantId } from "../../shared/domain-types";
import { createParticipantTokenService } from "./participant-token";
import { createLiveStore } from "./live-store";
import { getSessionStub } from "./quiz-session-do";
import type { QuizSessionDO } from "./quiz-session-do";

const meta: EventMeta = {
  capacity: 2,
  status: "live",
  theme: {
    primaryColor: "#111111",
    accentColor: "#222222",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    logoAssetId: null,
    backgroundAssetId: null,
  },
};

function newStub(): DurableObjectStub<QuizSessionDO> {
  const id = env.QUIZ_SESSION.newUniqueId();
  return env.QUIZ_SESSION.get(id);
}

async function seedEvent(eventId: string, opts: { ownerId?: string; stageToken?: string } = {}): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, subtitle, status, stage_token, created_at) VALUES (?, ?, 'T', '', 'live', ?, 1)",
  )
    .bind(eventId, opts.ownerId ?? "owner-1", opts.stageToken ?? null)
    .run();
}

async function publish(stub: DurableObjectStub<QuizSessionDO>, eventMeta: EventMeta): Promise<void> {
  const res = await stub.fetch("https://do/internal/publish", { method: "POST", body: JSON.stringify(eventMeta) });
  await res.text();
  expect(res.status).toBe(204);
}

/** WebSocket アップグレード以外の応答本文は、isolated storage のクリーンアップのため必ず読み切る */
async function connectExpecting(stub: DurableObjectStub<QuizSessionDO>, params: Record<string, string>, status: number): Promise<Response> {
  const url = new URL("https://do/connect");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await stub.fetch(url.toString(), { headers: { Upgrade: "websocket" } });
  if (!res.webSocket) await res.text();
  expect(res.status).toBe(status);
  return res;
}

describe("QuizSessionDO connect", () => {
  it("rejects a non-websocket request to /connect as 426", async () => {
    const stub = newStub();
    const res = await stub.fetch("https://do/connect?eventId=event-1&role=host");
    await res.text();
    expect(res.status).toBe(426);
  });

  it("rejects a connect request missing eventId or role as 400", async () => {
    const stub = newStub();
    await connectExpecting(stub, {}, 400);
  });

  it("rejects a host connection without an authenticated session as 401", async () => {
    const stub = newStub();
    await connectExpecting(stub, { eventId: "event-1", role: "host" }, 401);
  });

  it("rejects a stage connection with the wrong token as 401", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "correct-token" });
    await connectExpecting(stub, { eventId: "event-1", role: "stage", token: "wrong-token" }, 401);
  });

  it("rejects a participant connection with an invalid token as 401", async () => {
    const stub = newStub();
    await connectExpecting(stub, { eventId: "event-1", role: "participant", token: "garbage" }, 401);
  });

  it("accepts a stage connection with the correct token, keyed off the D1 stage_token", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "correct-token" });
    await publish(stub, meta);

    await connectExpecting(stub, { eventId: "event-1", role: "stage", token: "correct-token" }, 101);
  });

  it("accepts a participant connection with a valid token", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const token = await createParticipantTokenService(env).issue({
      eventId: "event-1" as EventId,
      participantId: "participant-1" as ParticipantId,
      issuedAt: Date.now(),
    });

    await connectExpecting(stub, { eventId: "event-1", role: "participant", token }, 101);
  });
});

describe("QuizSessionDO webSocketMessage", () => {
  function fakeWebSocket(attachment: unknown): { ws: WebSocket; sent: string[] } {
    const sent: string[] = [];
    const ws = {
      deserializeAttachment: () => attachment,
      send: (message: string) => sent.push(message),
      close: () => {},
    } as unknown as WebSocket;
    return { ws, sent };
  }

  it("rejects a host command (openQuestion) received on a stage connection", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "stage" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify({ type: "openQuestion" })));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a host command (startSession) received on a participant connection", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "participant", participantId: "p1" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify({ type: "startSession" })));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a malformed message as INVALID_COMMAND", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "host" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, "not json"));

    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "INVALID_COMMAND", message: expect.any(String) },
    });
  });
});

describe("QuizSessionDO publish", () => {
  it("initializes the event meta and the lobby phase in the live store", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const loaded = await runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
    expect(loaded).toEqual({ phase: { kind: "lobby" }, eventMeta: meta, questions: null, startedAt: null });
  });
});

describe("QuizSessionDO join", () => {
  async function join(
    stub: DurableObjectStub<QuizSessionDO>,
    nickname: string,
  ): Promise<{ ok: boolean; value?: unknown; error?: { code: string } }> {
    const res = await stub.fetch("https://do/internal/join", { method: "POST", body: JSON.stringify({ nickname }) });
    return res.json();
  }

  it("registers a participant and rejects a duplicate nickname", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const first = await join(stub, "alice");
    const second = await join(stub, "alice");

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: { code: "NICKNAME_TAKEN" } });
  });

  it("rejects a join once capacity is reached", async () => {
    const stub = newStub();
    await publish(stub, { ...meta, capacity: 1 });

    const first = await join(stub, "alice");
    const second = await join(stub, "bob");

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: { code: "CAPACITY_REACHED" } });
  });

  it("rejects a join once the event has finished", async () => {
    const stub = newStub();
    await publish(stub, { ...meta, status: "finished" });

    const result = await join(stub, "alice");
    expect(result).toEqual({ ok: false, error: { code: "EVENT_FINISHED" } });
  });

  it("registers only one participant when the same nickname joins concurrently", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const results = await Promise.all([join(stub, "alice"), join(stub, "alice")]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });
});

describe("getSessionStub", () => {
  it("resolves the same DO instance for the same eventId, honoring an optional location hint", async () => {
    const stubA = getSessionStub(env, "event-x" as EventId, "wnam");
    await publish(stubA, meta);

    const stubB = getSessionStub(env, "event-x" as EventId);
    const loaded = await runInDurableObject(stubB, (_instance, state) => createLiveStore(state.storage.sql).load());

    expect(loaded?.eventMeta).toEqual(meta);
  });
});
