import { Hono } from "hono";
import type { Env } from "../env";
import { requireHost, requireEventOwner, requireEventAccess, type AuthError } from "../auth/guard";
import {
  createInvite,
  listCollaborators,
  getInviteByToken,
  acceptInvite,
  revokeCollaborator,
  cancelInvite,
  leaveCollaboration,
  type CollaboratorError,
} from "./repository";
import { inviteRequestSchema } from "./schema";
import type { EventId } from "../../shared/domain-types";

export const collaboratorRoutes = new Hono<{ Bindings: Env }>();

function authStatus(code: AuthError["code"]): 401 | 403 {
  return code === "UNAUTHENTICATED" ? 401 : 403;
}

function collaboratorErrorStatus(code: CollaboratorError["code"]): 400 | 403 | 404 | 409 {
  switch (code) {
    case "NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "ALREADY_COLLABORATOR":
      return 409;
    case "SELF_INVITE":
      return 400;
    case "INVITE_INVALID":
      return 404;
    case "EMAIL_MISMATCH":
      return 403;
    case "VALIDATION":
      return 400;
  }
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// --- 所有者向け: 招待発行・一覧・解除・招待取消・離脱 ---

collaboratorRoutes.post("/api/events/:id/collaborators/invite", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireEventOwner(c.req.raw, c.env, eventId);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const parsed = inviteRequestSchema.safeParse(await readJsonBody(c.req.raw));
  if (!parsed.success) return c.json({ error: "VALIDATION" }, 400);

  const result = await createInvite(c.env, eventId, parsed.data.email);
  if (!result.ok) return c.json({ error: result.error.code }, collaboratorErrorStatus(result.error.code));

  const origin = new URL(c.req.url).origin;
  return c.json({ inviteUrl: `${origin}/host/invite/${result.value.inviteToken}` }, 201);
});

collaboratorRoutes.get("/api/events/:id/collaborators", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireEventOwner(c.req.raw, c.env, eventId);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const collaborators = await listCollaborators(c.env, eventId);
  return c.json({ collaborators });
});

collaboratorRoutes.delete("/api/events/:id/collaborators/:collaboratorId", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireEventOwner(c.req.raw, c.env, eventId);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await revokeCollaborator(c.env, eventId, c.req.param("collaboratorId"));
  if (!result.ok) return c.json({ error: result.error.code }, collaboratorErrorStatus(result.error.code));
  return c.body(null, 204);
});

collaboratorRoutes.delete("/api/events/:id/collaborators/invites/:inviteId", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireEventOwner(c.req.raw, c.env, eventId);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await cancelInvite(c.env, eventId, c.req.param("inviteId"));
  if (!result.ok) return c.json({ error: result.error.code }, collaboratorErrorStatus(result.error.code));
  return c.body(null, 204);
});

// 離脱は所有者ではなく共同運営者自身のみに許可する（要件5.4）。
// requireEventAccess は所有者も許可してしまうため、accessLevel を明示的に確認して所有者を拒否する
collaboratorRoutes.post("/api/events/:id/collaborators/leave", async (c) => {
  const eventId = c.req.param("id") as EventId;
  const auth = await requireEventAccess(c.req.raw, c.env, eventId);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));
  if (auth.value.accessLevel === "owner") return c.json({ error: "FORBIDDEN" }, 403);

  const result = await leaveCollaboration(c.env, eventId, auth.value.userId);
  if (!result.ok) return c.json({ error: result.error.code }, collaboratorErrorStatus(result.error.code));
  return c.body(null, 204);
});

// --- 招待受諾用: 認証は必要だが所有者判定はしない ---

collaboratorRoutes.get("/api/collaborators/invites/:token", async (c) => {
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const invite = await getInviteByToken(c.env, c.req.param("token"));
  if (!invite.ok) return c.json({ error: invite.error.code }, collaboratorErrorStatus(invite.error.code));

  // 招待先メールアドレスの生値はここでは返さない（要件6.4）。一致可否のみを伝える
  const emailMatches = normalizeEmail(invite.value.invitedEmail) === normalizeEmail(auth.value.email);
  return c.json({ eventTitle: invite.value.eventTitle, emailMatches });
});

collaboratorRoutes.post("/api/collaborators/invites/:token/accept", async (c) => {
  const auth = await requireHost(c.req.raw, c.env);
  if (!auth.ok) return c.json({ error: auth.error.code }, authStatus(auth.error.code));

  const result = await acceptInvite(c.env, c.req.param("token"), auth.value.userId, auth.value.email);
  if (!result.ok) return c.json({ error: result.error.code }, collaboratorErrorStatus(result.error.code));
  return c.json({ eventId: result.value.eventId });
});
