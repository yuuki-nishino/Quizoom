import { err, ok } from "../../shared/domain-types";
import type { EventId, Result } from "../../shared/domain-types";
import type { Env } from "../env";

export type CollaboratorError =
  | { readonly code: "NOT_FOUND" }
  | { readonly code: "FORBIDDEN" }
  | { readonly code: "ALREADY_COLLABORATOR" }
  | { readonly code: "SELF_INVITE" }
  | { readonly code: "INVITE_INVALID" }
  | { readonly code: "EMAIL_MISMATCH" }
  | { readonly code: "VALIDATION" };

export interface CollaboratorEntry {
  readonly id: string;
  readonly status: "pending" | "accepted";
  readonly invitedEmail: string;
  readonly acceptedAt: number | null;
}

export interface InviteInfo {
  readonly eventId: EventId;
  readonly eventTitle: string;
  readonly invitedEmail: string;
}

function newId(): string {
  return crypto.randomUUID();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createInvite(
  env: Env,
  eventId: EventId,
  rawInvitedEmail: string,
): Promise<Result<{ inviteToken: string }, CollaboratorError>> {
  const invitedEmail = normalizeEmail(rawInvitedEmail);
  if (invitedEmail.length === 0) return err({ code: "VALIDATION" });

  const eventRow = await env.DB.prepare(
    "SELECT u.email as owner_email FROM event e JOIN user u ON u.id = e.owner_id WHERE e.id = ?",
  )
    .bind(eventId)
    .first<{ owner_email: string }>();
  if (!eventRow) return err({ code: "NOT_FOUND" });
  if (normalizeEmail(eventRow.owner_email) === invitedEmail) return err({ code: "SELF_INVITE" });

  const existing = await env.DB.prepare(
    "SELECT id FROM event_collaborator WHERE event_id = ? AND invited_email = ?",
  )
    .bind(eventId, invitedEmail)
    .first<{ id: string }>();
  if (existing) return err({ code: "ALREADY_COLLABORATOR" });

  const id = newId();
  const inviteToken = newId();
  await env.DB.prepare(
    "INSERT INTO event_collaborator (id, event_id, invited_email, invite_token, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
  )
    .bind(id, eventId, invitedEmail, inviteToken, Date.now())
    .run();

  return ok({ inviteToken });
}

export async function listCollaborators(env: Env, eventId: EventId): Promise<readonly CollaboratorEntry[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, status, invited_email, accepted_at FROM event_collaborator WHERE event_id = ? ORDER BY created_at ASC",
  )
    .bind(eventId)
    .all<{ id: string; status: "pending" | "accepted"; invited_email: string; accepted_at: number | null }>();

  return results.map((row) => ({
    id: row.id,
    status: row.status,
    invitedEmail: row.invited_email,
    acceptedAt: row.accepted_at,
  }));
}

export async function getInviteByToken(env: Env, token: string): Promise<Result<InviteInfo, CollaboratorError>> {
  const row = await env.DB.prepare(
    `SELECT ec.event_id, ec.invited_email, e.title as event_title
     FROM event_collaborator ec
     JOIN event e ON e.id = ec.event_id
     WHERE ec.invite_token = ? AND ec.status = 'pending'`,
  )
    .bind(token)
    .first<{ event_id: string; invited_email: string; event_title: string }>();
  if (!row) return err({ code: "INVITE_INVALID" });

  return ok({ eventId: row.event_id as EventId, eventTitle: row.event_title, invitedEmail: row.invited_email });
}

export async function acceptInvite(
  env: Env,
  token: string,
  userId: string,
  userEmail: string,
): Promise<Result<{ eventId: EventId }, CollaboratorError>> {
  const invite = await getInviteByToken(env, token);
  if (!invite.ok) return invite;

  if (normalizeEmail(userEmail) !== normalizeEmail(invite.value.invitedEmail)) return err({ code: "EMAIL_MISMATCH" });

  await env.DB.prepare(
    "UPDATE event_collaborator SET status = 'accepted', user_id = ?, accepted_at = ? WHERE invite_token = ? AND status = 'pending'",
  )
    .bind(userId, Date.now(), token)
    .run();

  return ok({ eventId: invite.value.eventId });
}

export async function revokeCollaborator(env: Env, eventId: EventId, collaboratorId: string): Promise<Result<void, CollaboratorError>> {
  const result = await env.DB.prepare(
    "DELETE FROM event_collaborator WHERE id = ? AND event_id = ? AND status = 'accepted'",
  )
    .bind(collaboratorId, eventId)
    .run();
  if (result.meta.changes === 0) return err({ code: "NOT_FOUND" });
  return ok(undefined);
}

export async function cancelInvite(env: Env, eventId: EventId, inviteId: string): Promise<Result<void, CollaboratorError>> {
  const result = await env.DB.prepare(
    "DELETE FROM event_collaborator WHERE id = ? AND event_id = ? AND status = 'pending'",
  )
    .bind(inviteId, eventId)
    .run();
  if (result.meta.changes === 0) return err({ code: "NOT_FOUND" });
  return ok(undefined);
}

export async function leaveCollaboration(env: Env, eventId: EventId, userId: string): Promise<Result<void, CollaboratorError>> {
  const result = await env.DB.prepare(
    "DELETE FROM event_collaborator WHERE event_id = ? AND user_id = ? AND status = 'accepted'",
  )
    .bind(eventId, userId)
    .run();
  if (result.meta.changes === 0) return err({ code: "NOT_FOUND" });
  return ok(undefined);
}

export async function listAccessibleEventIds(env: Env, userId: string): Promise<readonly EventId[]> {
  const { results } = await env.DB.prepare(
    "SELECT event_id FROM event_collaborator WHERE user_id = ? AND status = 'accepted'",
  )
    .bind(userId)
    .all<{ event_id: string }>();
  return results.map((row) => row.event_id as EventId);
}

/** Auth Guard 専用の窓口。event_collaborator テーブルへアクセスする唯一の経路とする */
export async function isAcceptedCollaborator(env: Env, eventId: EventId, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT 1 FROM event_collaborator WHERE event_id = ? AND user_id = ? AND status = 'accepted'",
  )
    .bind(eventId, userId)
    .first();
  return row !== null;
}
