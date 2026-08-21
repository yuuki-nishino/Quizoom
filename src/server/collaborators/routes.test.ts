import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM event_collaborator; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId: string): Promise<string> {
  return createHostCookie(env, userId);
}

async function createEventAs(cookie: string): Promise<{ id: string }> {
  const res = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "Quiz Night" }),
  });
  return res.json<{ id: string }>();
}

async function inviteAs(cookie: string, eventId: string, email: string) {
  return SELF.fetch(`https://example.com/api/events/${eventId}/collaborators/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ email }),
  });
}

function tokenFromInviteUrl(inviteUrl: string): string {
  return inviteUrl.split("/").pop()!;
}

describe("POST /api/events/:id/collaborators/invite", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/events/e1/collaborators/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "friend@example.com" }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner with 403", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);

    const otherCookie = await hostCookie("other-1");
    const res = await inviteAs(otherCookie, event.id, "friend@example.com");
    expect(res.status).toBe(403);
  });

  it("issues an invite URL for the owner", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);

    const res = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    expect(res.status).toBe(201);
    const body = await res.json<{ inviteUrl: string }>();
    expect(body.inviteUrl).toContain("/host/invite/");
  });

  it("rejects a duplicate unresolved invite with 409", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    await inviteAs(ownerCookie, event.id, "friend-1@example.com");

    const res = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "ALREADY_COLLABORATOR" });
  });

  it("rejects inviting the owner's own email with 400", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);

    const res = await inviteAs(ownerCookie, event.id, "owner-1@example.com");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "SELF_INVITE" });
  });
});

describe("GET /api/events/:id/collaborators", () => {
  it("rejects a non-owner with 403", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);

    const otherCookie = await hostCookie("other-1");
    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators`, { headers: { Cookie: otherCookie } });
    expect(res.status).toBe(403);
  });

  it("lists invites for the owner", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    await inviteAs(ownerCookie, event.id, "friend-1@example.com");

    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators`, { headers: { Cookie: ownerCookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ collaborators: readonly { status: string; invitedEmail: string }[] }>();
    expect(body.collaborators).toEqual([{ id: expect.any(String), status: "pending", invitedEmail: "friend-1@example.com", acceptedAt: null }]);
  });
});

describe("DELETE /api/events/:id/collaborators/invites/:inviteId and /collaborators/:collaboratorId", () => {
  it("lets the owner cancel a pending invite", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const list = await (await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators`, { headers: { Cookie: ownerCookie } })).json<{
      collaborators: readonly { id: string }[];
    }>();

    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/invites/${list.collaborators[0]!.id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    expect(res.status).toBe(204);
  });

  it("rejects a non-owner attempting to revoke a collaborator with 403", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const otherCookie = await hostCookie("other-1");

    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/anything`, {
      method: "DELETE",
      headers: { Cookie: otherCookie },
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /api/collaborators/invites/:token", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/collaborators/invites/some-token");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown token", async () => {
    const cookie = await hostCookie("friend-1");
    const res = await SELF.fetch("https://example.com/api/collaborators/invites/does-not-exist", { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("does not include the raw invited email address, only emailMatches", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const inviteRes = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
    const token = tokenFromInviteUrl(inviteUrl);

    const friendCookie = await hostCookie("friend-1");
    const res = await SELF.fetch(`https://example.com/api/collaborators/invites/${token}`, { headers: { Cookie: friendCookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ eventTitle: string; emailMatches: boolean }>();
    expect(body).toEqual({ eventTitle: "Quiz Night", emailMatches: true });
    expect(JSON.stringify(body)).not.toContain("friend-1@example.com");
  });

  it("reports emailMatches false when logged in as a different account", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const inviteRes = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
    const token = tokenFromInviteUrl(inviteUrl);

    const strangerCookie = await hostCookie("stranger-1");
    const res = await SELF.fetch(`https://example.com/api/collaborators/invites/${token}`, { headers: { Cookie: strangerCookie } });
    const body = await res.json<{ emailMatches: boolean }>();
    expect(body.emailMatches).toBe(false);
  });
});

describe("POST /api/collaborators/invites/:token/accept", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/collaborators/invites/some-token/accept", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("rejects acceptance from a mismatched account with 403", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const inviteRes = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
    const token = tokenFromInviteUrl(inviteUrl);

    const strangerCookie = await hostCookie("stranger-1");
    const res = await SELF.fetch(`https://example.com/api/collaborators/invites/${token}/accept`, {
      method: "POST",
      headers: { Cookie: strangerCookie },
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "EMAIL_MISMATCH" });
  });

  it("accepts and returns the eventId for a matching account", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const inviteRes = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
    const token = tokenFromInviteUrl(inviteUrl);

    const friendCookie = await hostCookie("friend-1");
    const res = await SELF.fetch(`https://example.com/api/collaborators/invites/${token}/accept`, {
      method: "POST",
      headers: { Cookie: friendCookie },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ eventId: event.id });
  });
});

describe("POST /api/events/:id/collaborators/leave", () => {
  it("rejects the owner attempting to leave their own event with 403", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);

    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/leave`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    expect(res.status).toBe(403);
  });

  it("lets an accepted collaborator leave", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const inviteRes = await inviteAs(ownerCookie, event.id, "friend-1@example.com");
    const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
    const token = tokenFromInviteUrl(inviteUrl);

    const friendCookie = await hostCookie("friend-1");
    await SELF.fetch(`https://example.com/api/collaborators/invites/${token}/accept`, { method: "POST", headers: { Cookie: friendCookie } });

    const res = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/leave`, {
      method: "POST",
      headers: { Cookie: friendCookie },
    });
    expect(res.status).toBe(204);

    const list = await (await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators`, { headers: { Cookie: ownerCookie } })).json<{
      collaborators: readonly unknown[];
    }>();
    expect(list.collaborators).toEqual([]);
  });
});
