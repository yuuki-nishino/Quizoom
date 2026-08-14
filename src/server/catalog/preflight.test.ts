import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import type { PreflightReport } from "./schema";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

async function createEventAs(cookie: string, body: Record<string, unknown> = { title: "My Event" }) {
  const res = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(body),
  });
  return res.json<{ id: string }>();
}

describe("GET /api/events/:id/preflight", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/events/e1/preflight");
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner with 403", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const otherCookie = await hostCookie("owner-2");
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/preflight`, { headers: { Cookie: otherCookie } });
    expect(res.status).toBe(403);
  });

  it("reports fail for questionsReady and stageUrlReachable before publishing, but a reachable session", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/preflight`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const report = await res.json<PreflightReport>();

    expect(typeof report.checkedAt).toBe("number");
    expect(report.overall).toBe("fail");

    const byId = Object.fromEntries(report.checks.map((c) => [c.id, c]));
    expect(byId.authValid?.status).toBe("ok");
    expect(byId.questionsReady).toMatchObject({ status: "fail", questionCount: 0 });
    expect(byId.stageUrlReachable?.status).toBe("fail");
    expect(byId.sessionReachable?.status).toBe("ok");
    expect(byId.roundTripMs).toMatchObject({ status: "ok" });
    expect(typeof (byId.roundTripMs as { measuredMs: number }).measuredMs).toBe("number");
  });

  it("reports ok across the board once the event is published with a question", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "2+2?",
        timeLimitSec: 30,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
        ],
      }),
    });
    await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, { method: "POST", headers: { Cookie: cookie } });

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/preflight`, { headers: { Cookie: cookie } });
    const report = await res.json<PreflightReport>();

    expect(report.overall).toBe("ok");
    for (const check of report.checks) expect(check.status).toBe("ok");
  });
});
