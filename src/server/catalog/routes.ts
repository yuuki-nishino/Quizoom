import { Hono } from "hono";
import type { Env } from "../env";
import { requireHost, type AuthError } from "../auth/guard";
import {
  listEvents,
  findEvent,
  createEvent,
  updateEvent,
  duplicateEvent,
  deleteEvent,
  upsertQuestion,
  deleteQuestion,
  reorderQuestions,
  putTheme,
  publish,
  findPublishInfo,
  DEFAULT_CAPACITY,
  type CatalogError,
} from "./repository";
import {
  createEventRequestSchema,
  updateEventRequestSchema,
  questionRequestSchema,
  reorderQuestionsRequestSchema,
  themeSettingsRequestSchema,
  classifyRoundTrip,
  type PreflightCheck,
  type PreflightReport,
  type PreflightStatus,
} from "./schema";
import type { CreateEventInput, QuestionInput, UpdateEventInput } from "./repository";
import {
  findForOwner,
  enableSharing,
  disableSharing,
  findPublicByShareCode,
  deleteParticipantData,
  type ArchiveError,
} from "../results/archive";
import type { EventId, EventMeta, QuestionId } from "../../shared/domain-types";
import { getSessionStub } from "../session/quiz-session-do";

export const catalogRoutes = new Hono<{ Bindings: Env }>();

function authStatus(code: AuthError["code"]): 401 | 403 {
  return code === "UNAUTHENTICATED" ? 401 : 403;
}

function catalogErrorStatus(code: CatalogError["code"]): 400 | 403 | 404 | 409 | 422 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "EVENT_LIVE":
    case "STATUS_CONFLICT":
      return 409;
    case "VALIDATION":
      return 400;
    case "NO_QUESTIONS":
      return 422;
  }
}

function catalogErrorBody(error: CatalogError): Record<string, unknown> {
  if (error.code === "VALIDATION") return { error: error.code, fields: error.fields };
  return { error: error.code };
}

/** 不正な JSON ボディを Zod のパース失敗として一様に扱うためのラッパー */
async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

catalogRoutes.get("/api/events", async (c) => {
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  return c.json(await listEvents(c.env, auth.value.userId));
});

catalogRoutes.post("/api/events", async (c) => {
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = createEventRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: [] }, 400);

  const created = await createEvent(c.env, auth.value.userId, parsed.data as CreateEventInput);
  return c.json(created, 201);
});

catalogRoutes.get("/api/events/:id", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await findEvent(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value);
});

catalogRoutes.patch("/api/events/:id", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = updateEventRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: [] }, 400);

  const result = await updateEvent(c.env, eventId, auth.value.userId, parsed.data as UpdateEventInput);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value);
});

catalogRoutes.post("/api/events/:id/duplicate", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await duplicateEvent(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value, 201);
});

catalogRoutes.delete("/api/events/:id", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await deleteEvent(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.body(null, 204);
});

catalogRoutes.post("/api/events/:id/questions", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = questionRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: [] }, 400);

  const result = await upsertQuestion(c.env, eventId, auth.value.userId, parsed.data as QuestionInput);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value, 201);
});

catalogRoutes.patch("/api/events/:id/questions/:qid", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const questionId = c.req.param("qid") as QuestionId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = questionRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: [] }, 400);

  const result = await upsertQuestion(c.env, eventId, auth.value.userId, { ...parsed.data, id: questionId } as QuestionInput);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value);
});

catalogRoutes.delete("/api/events/:id/questions/:qid", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const questionId = c.req.param("qid") as QuestionId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await deleteQuestion(c.env, eventId, auth.value.userId, questionId);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.body(null, 204);
});

catalogRoutes.put("/api/events/:id/questions/order", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = reorderQuestionsRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: ["questionIds"] }, 400);

  const result = await reorderQuestions(c.env, eventId, auth.value.userId, parsed.data.questionIds as QuestionId[]);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));
  return c.json(result.value);
});

catalogRoutes.put("/api/events/:id/theme", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = themeSettingsRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION", fields: [] }, 400);

  const result = await putTheme(c.env, eventId, auth.value.userId, parsed.data);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));

  // 開催中の場合に限り DO へ反映を通知する（要件3.7）。未開催時の通知は不要な DO 起動を招く
  const eventRow = await c.env.DB.prepare("SELECT status FROM event WHERE id = ?").bind(eventId).first<{ status: string }>();
  if (eventRow?.status === "live") {
    const stub = getSessionStub(c.env, eventId);
    const themeRes = await stub.fetch("https://do/internal/theme", { method: "POST", body: JSON.stringify(result.value) });
    await themeRes.text();
  }

  return c.json(result.value);
});

catalogRoutes.post("/api/events/:id/publish", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const before = await findPublishInfo(c.env, eventId, auth.value.userId);
  if (!before.ok) return c.json(catalogErrorBody(before.error), catalogErrorStatus(before.error.code));

  const result = await publish(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json(catalogErrorBody(result.error), catalogErrorStatus(result.error.code));

  // 初めて draft から公開された場合のみ DO を生成する。再実行時は開催中の可能性があり、
  // #handlePublish は無条件で Lobby へ巻き戻すため、既に公開済みなら DO には触れない
  if (before.value.status === "draft") {
    const eventDetail = await findEvent(c.env, eventId, auth.value.userId);
    if (eventDetail.ok) {
      const meta: EventMeta = {
        capacity: eventDetail.value.capacity ?? DEFAULT_CAPACITY,
        status: "published",
        theme: eventDetail.value.theme,
      };
      const stub = getSessionStub(c.env, eventId);
      const publishRes = await stub.fetch("https://do/internal/publish", { method: "POST", body: JSON.stringify(meta) });
      await publishRes.text();
    }
  }

  const origin = new URL(c.req.url).origin;
  return c.json({
    joinCode: result.value.joinCode,
    joinUrl: `${origin}/join/${result.value.joinCode}`,
    stageToken: result.value.stageToken,
    stageUrl: `${origin}/stage/${eventId}?token=${result.value.stageToken}`,
  });
});

catalogRoutes.get("/api/events/:id/stage-token", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const info = await findPublishInfo(c.env, eventId, auth.value.userId);
  if (!info.ok) return c.json(catalogErrorBody(info.error), catalogErrorStatus(info.error.code));
  if (!info.value.stageToken) return c.json({ error: "NOT_PUBLISHED" }, 409);

  const origin = new URL(c.req.url).origin;
  return c.json({ stageToken: info.value.stageToken, stageUrl: `${origin}/stage/${eventId}?token=${info.value.stageToken}` });
});

const PREFLIGHT_SEVERITY: Record<PreflightStatus, number> = { ok: 0, warn: 1, fail: 2 };

catalogRoutes.get("/api/events/:id/preflight", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const eventResult = await findEvent(c.env, eventId, auth.value.userId);
  if (!eventResult.ok) return c.json(catalogErrorBody(eventResult.error), catalogErrorStatus(eventResult.error.code));

  const checks: PreflightCheck[] = [];

  // requireHost が既に成功しているため、この経路に到達した時点で認証は有効
  checks.push({ id: "authValid", status: "ok", detail: "session is valid" });

  const questionCount = eventResult.value.questions.length;
  checks.push({
    id: "questionsReady",
    status: questionCount > 0 ? "ok" : "fail",
    questionCount,
  });

  const isPublished = eventResult.value.status !== "draft";
  checks.push({
    id: "stageUrlReachable",
    status: isPublished ? "ok" : "fail",
    detail: isPublished ? "stage URL is available" : "the event has not been published yet",
  });

  // DO への往復遅延を実測する。preflight の呼び出し自体が休眠状態の DO を起動させる導線にもなる
  const stub = getSessionStub(c.env, eventId);
  const startedAt = Date.now();
  let sessionStatus: PreflightStatus = "ok";
  let sessionDetail = "session is reachable";
  try {
    const pingRes = await stub.fetch("https://do/internal/ping");
    await pingRes.text();
    if (pingRes.status !== 204) {
      sessionStatus = "fail";
      sessionDetail = `unexpected response status: ${pingRes.status}`;
    }
  } catch {
    sessionStatus = "fail";
    sessionDetail = "failed to reach the session";
  }
  const measuredMs = Date.now() - startedAt;
  checks.push({ id: "sessionReachable", status: sessionStatus, detail: sessionDetail });
  checks.push({ id: "roundTripMs", status: classifyRoundTrip(measuredMs, sessionStatus === "ok"), measuredMs });

  const overall = checks.reduce<PreflightStatus>(
    (worst, check) => (PREFLIGHT_SEVERITY[check.status] > PREFLIGHT_SEVERITY[worst] ? check.status : worst),
    "ok",
  );

  const report: PreflightReport = { overall, checkedAt: Date.now(), checks };
  return c.json(report);
});

function archiveErrorStatus(code: ArchiveError["code"]): 403 | 404 | 410 {
  switch (code) {
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
    // 未確定の結果は「まだ存在しない」として扱う（要件8.12）
    case "NOT_FINALIZED":
      return 404;
    case "SHARING_DISABLED":
      return 410;
  }
}

catalogRoutes.get("/api/events/:id/results", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await findForOwner(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json({ error: result.error.code }, archiveErrorStatus(result.error.code));
  return c.json(result.value);
});

catalogRoutes.delete("/api/events/:id/participant-data", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await deleteParticipantData(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json({ error: result.error.code }, archiveErrorStatus(result.error.code));
  return c.body(null, 204);
});

catalogRoutes.post("/api/events/:id/share", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await enableSharing(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json({ error: result.error.code }, archiveErrorStatus(result.error.code));

  const origin = new URL(c.req.url).origin;
  return c.json({ shareCode: result.value.shareCode, shareUrl: `${origin}/share/${result.value.shareCode}` });
});

catalogRoutes.delete("/api/events/:id/share", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await disableSharing(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json({ error: result.error.code }, archiveErrorStatus(result.error.code));
  return c.body(null, 204);
});

// 本APIの中で唯一認証を要求しないエンドポイント（要件8.12, 8.14）
catalogRoutes.get("/api/share/:shareCode", async (c) => {
  const shareCode = c.req.param("shareCode");
  const result = await findPublicByShareCode(c.env, shareCode);
  if (!result.ok) return c.json({ error: result.error.code }, archiveErrorStatus(result.error.code));
  return c.json(result.value);
});
