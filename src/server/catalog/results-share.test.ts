import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, runInDurableObject } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import type { QuizSessionDO } from "../session/quiz-session-do";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

/** イベント作成→設問登録→公開→開始→出題→回答→締切→正解発表→確定 までを1本のヘルパーで完走させる */
async function createFinalizedEvent(cookie: string): Promise<{ id: string }> {
  const createRes = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "Quiz Night" }),
  });
  const created = await createRes.json<{ id: string }>();

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

  const stub = env.QUIZ_SESSION.getByName(created.id) as DurableObjectStub<QuizSessionDO>;
  const sent: string[] = [];
  const ws = { deserializeAttachment: () => ({ role: "host", eventId: created.id }), send: (m: string) => sent.push(m), close: () => {} } as unknown as WebSocket;

  for (const command of [{ type: "startSession" }, { type: "openQuestion" }, { type: "closeQuestion" }, { type: "revealAnswer" }, { type: "finalize" }]) {
    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify(command)));
  }
  const rejected = sent.map((m) => JSON.parse(m)).filter((m) => m.type === "commandRejected");
  if (rejected.length > 0) throw new Error(`setup failed: ${JSON.stringify(rejected)}`);

  return created;
}

describe("GET /api/events/:id/results", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/events/e1/results");
    expect(res.status).toBe(401);
  });

  it("returns 404 for an event without a finalized result", async () => {
    const cookie = await hostCookie();
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Not finalized" }),
    });
    const created = await createRes.json<{ id: string }>();

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/results`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("returns ranking with per-question answers once finalized", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/results`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ entries: { nickname: string; answers: unknown[] }[] }>();
    expect(Array.isArray(body.entries)).toBe(true);
  });
});

describe("DELETE /api/events/:id/participant-data", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/events/e1/participant-data", { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner with 403", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);
    const otherCookie = await hostCookie("owner-2");

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/participant-data`, {
      method: "DELETE",
      headers: { Cookie: otherCookie },
    });
    expect(res.status).toBe(403);
  });

  it("deletes participant data and results, and disables sharing at the same time", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);

    await SELF.fetch(`https://example.com/api/events/${created.id}/share`, { method: "POST", headers: { Cookie: cookie } });

    const deleteRes = await SELF.fetch(`https://example.com/api/events/${created.id}/participant-data`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(deleteRes.status).toBe(204);

    const resultsRes = await SELF.fetch(`https://example.com/api/events/${created.id}/results`, { headers: { Cookie: cookie } });
    expect(resultsRes.status).toBe(404);
  });
});

describe("POST/DELETE /api/events/:id/share and GET /api/share/:shareCode", () => {
  it("enables sharing and serves the public result without auth", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);

    const shareRes = await SELF.fetch(`https://example.com/api/events/${created.id}/share`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(shareRes.status).toBe(200);
    const shareBody = await shareRes.json<{ shareCode: string; shareUrl: string }>();
    expect(shareBody.shareUrl).toContain(shareBody.shareCode);

    const publicRes = await SELF.fetch(`https://example.com/api/share/${shareBody.shareCode}`);
    expect(publicRes.status).toBe(200);
    const publicBody = await publicRes.json<{ eventTitle: string; entries: unknown[] }>();
    expect(publicBody.eventTitle).toBe("Quiz Night");
    expect(JSON.stringify(publicBody)).not.toContain("q1");
  });

  it("returns 410 for the share URL after disabling sharing", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);

    const shareRes = await SELF.fetch(`https://example.com/api/events/${created.id}/share`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const { shareCode } = await shareRes.json<{ shareCode: string }>();

    const disableRes = await SELF.fetch(`https://example.com/api/events/${created.id}/share`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(disableRes.status).toBe(204);

    const publicRes = await SELF.fetch(`https://example.com/api/share/${shareCode}`);
    expect(publicRes.status).toBe(410);
  });

  it("returns 404 for an unknown share code", async () => {
    const res = await SELF.fetch("https://example.com/api/share/unknown-code");
    expect(res.status).toBe(404);
  });

  it("rejects POST /share from a non-owner with 403", async () => {
    const cookie = await hostCookie();
    const created = await createFinalizedEvent(cookie);
    const otherCookie = await hostCookie("owner-2");

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/share`, {
      method: "POST",
      headers: { Cookie: otherCookie },
    });
    expect(res.status).toBe(403);
  });
});
