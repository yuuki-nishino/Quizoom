import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env";
import { findEventByJoinCode, findEventByStageToken, findThemeSettings } from "../catalog/repository";
import { getSessionStub } from "./quiz-session-do";
import { createParticipantTokenService } from "./participant-token";
import type { EventId, JoinRejection, ParticipantId } from "../../shared/domain-types";

export const joinRoutes = new Hono<{ Bindings: Env }>();

function containsControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

// 表示崩れを防ぐため、制御文字を含まない1〜20文字に制限する（要件4.4）
const nicknameRequestSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .refine((v) => !containsControlCharacter(v), "nickname must not contain control characters"),
});

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function joinRejectionStatus(code: JoinRejection["code"]): 409 | 410 | 423 {
  switch (code) {
    case "NICKNAME_TAKEN":
      return 409;
    case "CAPACITY_REACHED":
      return 423;
    case "EVENT_FINISHED":
      return 410;
  }
}

joinRoutes.get("/api/join/:joinCode", async (c) => {
  const joinCode = c.req.param("joinCode");
  const event = await findEventByJoinCode(c.env, joinCode);
  if (!event) return c.json({ error: "NOT_FOUND" }, 404);
  if (event.status === "finished") return c.json({ error: "EVENT_FINISHED" }, 410);

  const theme = await findThemeSettings(c.env, event.id);
  return c.json({ eventId: event.id, eventTitle: event.title, theme, accepting: event.status !== "draft" });
});

joinRoutes.post("/api/join/:joinCode", async (c) => {
  const joinCode = c.req.param("joinCode");
  const event = await findEventByJoinCode(c.env, joinCode);
  if (!event) return c.json({ error: "NOT_FOUND" }, 404);
  if (event.status === "finished") return c.json({ error: "EVENT_FINISHED" }, 410);

  const parsed = nicknameRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION" }, 400);

  const stub = getSessionStub(c.env, event.id);
  const joinRes = await stub.fetch("https://do/internal/join", {
    method: "POST",
    body: JSON.stringify({ nickname: parsed.data.nickname }),
  });
  const result = await joinRes.json<
    { readonly ok: true; readonly value: { readonly id: string } } | { readonly ok: false; readonly error: JoinRejection }
  >();

  if (!result.ok) return c.json({ error: result.error.code }, joinRejectionStatus(result.error.code));

  const participantId = result.value.id as ParticipantId;
  const token = await createParticipantTokenService(c.env).issue({
    eventId: event.id as EventId,
    participantId,
    issuedAt: Date.now(),
  });

  return c.json({ token, participantId, eventId: event.id });
});

// 投影画面の待機状態表示専用。認証不要・stage_token の一致のみを根拠とする（要件6.1）
joinRoutes.get("/api/stage/:eventId", async (c) => {
  const eventId = c.req.param("eventId") as EventId;
  const token = c.req.query("token");
  if (!token) return c.json({ error: "UNAUTHORIZED" }, 401);

  const result = await findEventByStageToken(c.env, eventId, token);
  if (!result.ok) return c.json({ error: result.error.code }, result.error.code === "NOT_FOUND" ? 404 : 403);

  const theme = await findThemeSettings(c.env, eventId);
  return c.json({ eventTitle: result.value.title, joinCode: result.value.joinCode, theme });
});
