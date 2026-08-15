import { Hono } from "hono";
import type { Env } from "./env";
import type { EventId } from "../shared/domain-types";
import { createAuth } from "./auth/factory";
import { requireHost } from "./auth/guard";
import { catalogRoutes } from "./catalog/routes";
import { joinRoutes } from "./session/join-routes";
import { mediaRoutes } from "./media/routes";
import { getSessionStub } from "./session/quiz-session-do";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.route("/", catalogRoutes);
app.route("/", joinRoutes);
app.route("/", mediaRoutes);

app.get("/api/host/me", async (c) => {
  const result = await requireHost(c.req.raw, c.env);
  if (!result.ok) return c.json({ error: result.error.code }, 401);
  return c.json({ userId: result.value.userId });
});

// host/stage/participant の各クライアントはこの単一の WebSocket エンドポイントに接続する。
// 役割ごとの認証(セッションCookie／投影トークン／参加者トークン)は QuizSessionDO 側で検証する
app.get("/connect", async (c) => {
  const eventId = c.req.query("eventId");
  if (!eventId) return c.text("Bad Request", 400);

  const stub = getSessionStub(c.env, eventId as EventId);
  return stub.fetch(c.req.raw);
});

// API に一致しない全ての GET は SPA へ委譲する。ASSETS の not_found_handling
// ("single-page-application") により、/host/events/:id のような深いリンクも index.html に解決される
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
export { QuizSessionDO } from "./session/quiz-session-do";
