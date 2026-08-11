import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import type { EventId } from "../../shared/domain-types";
import { requireHost, requireEventOwner, checkEventOwnership } from "./guard";

beforeEach(async () => {
  await env.DB.exec("DELETE FROM event;");
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
