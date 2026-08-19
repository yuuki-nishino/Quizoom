import { err, ok, type EventId, type Result } from "../../shared/domain-types";
import type { Env } from "../env";
import { createAuth } from "./factory";
import { isAcceptedCollaborator } from "../collaborators/repository";

export type AuthError = { readonly code: "UNAUTHENTICATED" } | { readonly code: "FORBIDDEN" };

export type AccessLevel = "owner" | "collaborator";

export interface HostSession {
  readonly userId: string;
}

export async function requireHost(request: Request, env: Env): Promise<Result<HostSession, AuthError>> {
  const auth = createAuth(env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return err({ code: "UNAUTHENTICATED" });
  return ok({ userId: session.user.id });
}

/** イベント所有権の判定のみを担う。requireHost が返した userId を対象に検証する */
export async function checkEventOwnership(env: Env, eventId: EventId, userId: string): Promise<Result<true, AuthError>> {
  const row = await env.DB.prepare("SELECT owner_id FROM event WHERE id = ?").bind(eventId).first<{ owner_id: string }>();
  if (!row || row.owner_id !== userId) return err({ code: "FORBIDDEN" });
  return ok(true);
}

export async function requireEventOwner(
  request: Request,
  env: Env,
  eventId: EventId,
): Promise<Result<HostSession, AuthError>> {
  const hostResult = await requireHost(request, env);
  if (!hostResult.ok) return hostResult;

  const ownership = await checkEventOwnership(env, eventId, hostResult.value.userId);
  if (!ownership.ok) return ownership;

  return hostResult;
}

/**
 * 所有者または受諾済み共同運営者を許可する。event_collaborator テーブルへは直接クエリせず、
 * collaborators ドメインが公開する isAcceptedCollaborator を経由することで、
 * そのテーブルへのアクセスを collaborators ドメイン内に閉じる。
 */
export async function checkEventAccess(env: Env, eventId: EventId, userId: string): Promise<Result<AccessLevel, AuthError>> {
  const row = await env.DB.prepare("SELECT owner_id FROM event WHERE id = ?").bind(eventId).first<{ owner_id: string }>();
  if (!row) return err({ code: "FORBIDDEN" });
  if (row.owner_id === userId) return ok("owner");

  const collaborator = await isAcceptedCollaborator(env, eventId, userId);
  if (collaborator) return ok("collaborator");

  return err({ code: "FORBIDDEN" });
}

export async function requireEventAccess(
  request: Request,
  env: Env,
  eventId: EventId,
): Promise<Result<HostSession & { readonly accessLevel: AccessLevel }, AuthError>> {
  const hostResult = await requireHost(request, env);
  if (!hostResult.ok) return hostResult;

  const access = await checkEventAccess(env, eventId, hostResult.value.userId);
  if (!access.ok) return access;

  return ok({ ...hostResult.value, accessLevel: access.value });
}
