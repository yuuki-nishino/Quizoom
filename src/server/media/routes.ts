import { Hono } from "hono";
import type { Env } from "../env";
import { requireHost, checkEventOwnership } from "../auth/guard";
import { createParticipantTokenService } from "../session/participant-token";
import { findEventByStageToken } from "../catalog/repository";
import type { EventId } from "../../shared/domain-types";

export const mediaRoutes = new Hono<{ Bindings: Env }>();

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

function mediaKey(eventId: string, assetId: string): string {
  return `${eventId}/${assetId}`;
}

mediaRoutes.post("/api/events/:id/media", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, auth.error.code === "UNAUTHENTICATED" ? 401 : 403);

  const ownership = await checkEventOwnership(c.env, eventId, auth.value.userId);
  if (!ownership.ok) return c.json({ error: ownership.error.code }, 403);

  let formData: FormData;
  try {
    formData = await c.req.raw.formData();
  } catch {
    return c.json({ error: "VALIDATION" }, 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return c.json({ error: "VALIDATION" }, 400);
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) return c.json({ error: "UNSUPPORTED_MEDIA_TYPE" }, 413);
  if (file.size > MAX_MEDIA_BYTES) return c.json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  const assetId = crypto.randomUUID();
  await c.env.MEDIA.put(mediaKey(eventId, assetId), await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  return c.json({ assetId }, 201);
});

mediaRoutes.get("/api/events/:id/media/:assetId", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const assetId = c.req.param("assetId");

  const hostAuth = await requireHost(c.req.raw, c.env);
  let authorized = false;
  if (hostAuth.ok) {
    const ownership = await checkEventOwnership(c.env, eventId, hostAuth.value.userId);
    authorized = ownership.ok;
  }

  const token = c.req.query("token");
  if (!authorized && token) {
    const verified = await createParticipantTokenService(c.env).verify(token, eventId);
    authorized = verified.ok;
  }
  // 投影画面は参加者トークンを持たないため、stage_token の一致も許可の根拠とする（要件6.2, 10.6）
  if (!authorized && token) {
    const stageAuth = await findEventByStageToken(c.env, eventId, token);
    authorized = stageAuth.ok;
  }

  if (!authorized) {
    // 主催者セッションも参加者トークンも一切提示されていない場合のみ未認証として扱う。
    // どちらかが提示された上で拒否された場合は、対象への権限がないことを意味する
    if (!hostAuth.ok && hostAuth.error.code === "UNAUTHENTICATED" && !token) {
      return c.json({ error: "UNAUTHENTICATED" }, 401);
    }
    return c.json({ error: "FORBIDDEN" }, 403);
  }

  const object = await c.env.MEDIA.get(mediaKey(eventId, assetId));
  if (!object) return c.json({ error: "NOT_FOUND" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
});
