import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { EventId } from "../../shared/domain-types";
import { requireHost, requireEventOwner, checkEventOwnership, checkEventAccess, requireEventAccess } from "./guard";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM event_collaborator; DELETE FROM event; DELETE FROM user;");
});

describe("requireHost", () => {
  it("rejects a request without a session as UNAUTHENTICATED", async () => {
    const request = new Request("https://example.com/api/events");
    const result = await requireHost(request, env);
    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});

describe("checkEventOwnership", () => {
  it("succeeds when the given user owns the event", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();

    const result = await checkEventOwnership(env, "e1" as EventId, "u1");
    expect(result.ok).toBe(true);
  });

  it("rejects as FORBIDDEN when a different user owns the event", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();

    const result = await checkEventOwnership(env, "e1" as EventId, "u2");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects as FORBIDDEN when the event does not exist", async () => {
    const result = await checkEventOwnership(env, "missing" as EventId, "u1");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });
});

describe("requireEventOwner", () => {
  it("short-circuits to UNAUTHENTICATED before checking ownership", async () => {
    const request = new Request("https://example.com/api/events/e1");
    const result = await requireEventOwner(request, env, "e1" as EventId);
    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});

async function seedUser(id: string, email: string): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1, 1)',
  )
    .bind(id, id, email)
    .run();
}

describe("checkEventAccess", () => {
  it("returns owner for the event's owner", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();

    const result = await checkEventAccess(env, "e1" as EventId, "u1");
    expect(result).toEqual({ ok: true, value: "owner" });
  });

  it("returns collaborator for an accepted collaborator", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();
    await seedUser("u2", "collab@example.com");
    await env.DB.prepare(
      "INSERT INTO event_collaborator (id, event_id, invited_email, user_id, status, created_at, accepted_at) VALUES ('c1','e1','collab@example.com','u2','accepted',1,1)",
    ).run();

    const result = await checkEventAccess(env, "e1" as EventId, "u2");
    expect(result).toEqual({ ok: true, value: "collaborator" });
  });

  it("rejects as FORBIDDEN for an unrelated user", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();

    const result = await checkEventAccess(env, "e1" as EventId, "stranger");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects a pending (not yet accepted) invitee as FORBIDDEN", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();
    await env.DB.prepare(
      "INSERT INTO event_collaborator (id, event_id, invited_email, status, created_at) VALUES ('c1','e1','pending@example.com','pending',1)",
    ).run();

    const result = await checkEventAccess(env, "e1" as EventId, "u2");
    expect(result).toEqual({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("upholds the invariant that every checkEventOwnership success is also an owner-level checkEventAccess success", async () => {
    await env.DB.prepare(
      "INSERT INTO event (id, owner_id, title, status, created_at) VALUES ('e1','u1','T','draft',1)",
    ).run();

    const ownership = await checkEventOwnership(env, "e1" as EventId, "u1");
    const access = await checkEventAccess(env, "e1" as EventId, "u1");
    expect(ownership.ok).toBe(true);
    expect(access).toEqual({ ok: true, value: "owner" });
  });
});

describe("requireEventAccess", () => {
  it("short-circuits to UNAUTHENTICATED before checking access", async () => {
    const request = new Request("https://example.com/api/events/e1");
    const result = await requireEventAccess(request, env, "e1" as EventId);
    expect(result).toEqual({ ok: false, error: { code: "UNAUTHENTICATED" } });
  });
});
