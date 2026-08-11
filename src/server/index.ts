import { Hono } from "hono";
import type { Env } from "./env";
import { createAuth } from "./auth/factory";
import { requireHost } from "./auth/guard";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ status: "ok" }));

app.on(["GET", "POST"], "/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));

app.get("/api/host/me", async (c) => {
  const result = await requireHost(c.req.raw, c.env);
  if (!result.ok) return c.json({ error: result.error.code }, 401);
  return c.json({ userId: result.value.userId });
});

export default app;
export { QuizSessionDO } from "./session/quiz-session-do";
