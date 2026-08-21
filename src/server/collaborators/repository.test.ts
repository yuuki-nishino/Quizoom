import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { EventId } from "../../shared/domain-types";
import {
  createInvite,
  listCollaborators,
  getInviteByToken,
  acceptInvite,
  revokeCollaborator,
  cancelInvite,
  leaveCollaboration,
  listAccessibleEventIds,
  isAcceptedCollaborator,
} from "./repository";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM event_collaborator; DELETE FROM event; DELETE FROM user;");
});

async function seedUser(id: string, email: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)',
  )
    .bind(id, id, email)
    .run();
}

async function seedEvent(eventId: string, ownerId: string): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, status, created_at) VALUES (?, ?, 'Test Event', 'draft', 1000)",
  )
    .bind(eventId, ownerId)
    .run();
}

describe("createInvite", () => {
  it("issues an invite with a random token for a new email", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");

    const result = await createInvite(env, "event-1" as EventId, "Friend@Example.com ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.inviteToken.length).toBeGreaterThan(0);

    const collaborators = await listCollaborators(env, "event-1" as EventId);
    expect(collaborators).toEqual([
      { id: expect.any(String), status: "pending", invitedEmail: "friend@example.com", acceptedAt: null },
    ]);
  });

  it("rejects a second invite to the same email while one is unresolved", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    await createInvite(env, "event-1" as EventId, "friend@example.com");

    const second = await createInvite(env, "event-1" as EventId, "friend@example.com");
    expect(second).toEqual({ ok: false, error: { code: "ALREADY_COLLABORATOR" } });
  });

  it("rejects inviting the owner's own email address", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");

    const result = await createInvite(env, "event-1" as EventId, "owner@example.com");
    expect(result).toEqual({ ok: false, error: { code: "SELF_INVITE" } });
  });
});

describe("getInviteByToken / acceptInvite", () => {
  async function setup() {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    const invite = await createInvite(env, "event-1" as EventId, "friend@example.com");
    if (!invite.ok) throw new Error("setup failed");
    return invite.value.inviteToken;
  }

  it("returns invite info for a pending token", async () => {
    const token = await setup();
    const info = await getInviteByToken(env, token);
    expect(info).toEqual({
      ok: true,
      value: { eventId: "event-1", eventTitle: "Test Event", invitedEmail: "friend@example.com" },
    });
  });

  it("returns INVITE_INVALID for an unknown token", async () => {
    const info = await getInviteByToken(env, "does-not-exist");
    expect(info).toEqual({ ok: false, error: { code: "INVITE_INVALID" } });
  });

  it("rejects acceptance when the logged-in email does not match the invited email", async () => {
    const token = await setup();
    const result = await acceptInvite(env, token, "user-2", "someone-else@example.com");
    expect(result).toEqual({ ok: false, error: { code: "EMAIL_MISMATCH" } });

    // 対象行が更新されていないことを確認する
    const info = await getInviteByToken(env, token);
    expect(info.ok).toBe(true);
  });

  it("accepts when the logged-in email matches, and rejects re-acceptance of the same token", async () => {
    const token = await setup();
    await seedUser("user-2", "friend@example.com");
    const result = await acceptInvite(env, token, "user-2", "Friend@Example.com");
    expect(result).toEqual({ ok: true, value: { eventId: "event-1" } });

    expect(await isAcceptedCollaborator(env, "event-1" as EventId, "user-2")).toBe(true);

    const second = await acceptInvite(env, token, "user-2", "friend@example.com");
    expect(second).toEqual({ ok: false, error: { code: "INVITE_INVALID" } });
  });
});

describe("listCollaborators / revokeCollaborator / cancelInvite / leaveCollaboration", () => {
  it("distinguishes pending invites from accepted collaborators", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    await createInvite(env, "event-1" as EventId, "pending@example.com");
    const accepted = await createInvite(env, "event-1" as EventId, "accepted@example.com");
    if (!accepted.ok) throw new Error("setup failed");
    await seedUser("user-2", "accepted@example.com");
    await acceptInvite(env, accepted.value.inviteToken, "user-2", "accepted@example.com");

    const list = await listCollaborators(env, "event-1" as EventId);
    expect(list.map((c) => ({ status: c.status, invitedEmail: c.invitedEmail }))).toEqual(
      expect.arrayContaining([
        { status: "pending", invitedEmail: "pending@example.com" },
        { status: "accepted", invitedEmail: "accepted@example.com" },
      ]),
    );
  });

  it("revokes an accepted collaborator, immediately revoking access", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    const invite = await createInvite(env, "event-1" as EventId, "friend@example.com");
    if (!invite.ok) throw new Error("setup failed");
    await seedUser("user-2", "friend@example.com");
    await acceptInvite(env, invite.value.inviteToken, "user-2", "friend@example.com");
    const collaborators = await listCollaborators(env, "event-1" as EventId);

    const result = await revokeCollaborator(env, "event-1" as EventId, collaborators[0]!.id);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await isAcceptedCollaborator(env, "event-1" as EventId, "user-2")).toBe(false);
  });

  it("cancels a pending invite", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    await createInvite(env, "event-1" as EventId, "friend@example.com");
    const collaborators = await listCollaborators(env, "event-1" as EventId);

    const result = await cancelInvite(env, "event-1" as EventId, collaborators[0]!.id);
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await listCollaborators(env, "event-1" as EventId)).toEqual([]);
  });

  it("returns NOT_FOUND when revoking/cancelling a non-existent id", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    expect(await revokeCollaborator(env, "event-1" as EventId, "nope")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await cancelInvite(env, "event-1" as EventId, "nope")).toEqual({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("leaveCollaboration removes only the calling user's own row", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    const inviteA = await createInvite(env, "event-1" as EventId, "a@example.com");
    const inviteB = await createInvite(env, "event-1" as EventId, "b@example.com");
    if (!inviteA.ok || !inviteB.ok) throw new Error("setup failed");
    await seedUser("user-a", "a@example.com");
    await seedUser("user-b", "b@example.com");
    await acceptInvite(env, inviteA.value.inviteToken, "user-a", "a@example.com");
    await acceptInvite(env, inviteB.value.inviteToken, "user-b", "b@example.com");

    const result = await leaveCollaboration(env, "event-1" as EventId, "user-a");
    expect(result).toEqual({ ok: true, value: undefined });
    expect(await isAcceptedCollaborator(env, "event-1" as EventId, "user-a")).toBe(false);
    expect(await isAcceptedCollaborator(env, "event-1" as EventId, "user-b")).toBe(true);
  });
});

describe("listAccessibleEventIds / isAcceptedCollaborator", () => {
  it("lists only events where the user is an accepted collaborator", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    await seedEvent("event-2", "owner-1");
    const invite1 = await createInvite(env, "event-1" as EventId, "friend@example.com");
    await createInvite(env, "event-2" as EventId, "friend@example.com");
    if (!invite1.ok) throw new Error("setup failed");
    await seedUser("user-2", "friend@example.com");
    await acceptInvite(env, invite1.value.inviteToken, "user-2", "friend@example.com");

    const ids = await listAccessibleEventIds(env, "user-2");
    expect(ids).toEqual(["event-1"]);
  });

  it("returns false for a user who was never invited", async () => {
    await seedUser("owner-1", "owner@example.com");
    await seedEvent("event-1", "owner-1");
    expect(await isAcceptedCollaborator(env, "event-1" as EventId, "stranger")).toBe(false);
  });
});
