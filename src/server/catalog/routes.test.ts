import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import { DEFAULT_THEME } from "./repository";

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
  expect(res.status).toBe(201);
  return res.json<{ id: string }>();
}

describe("GET /api/events", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/events");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
  });

  it("lists only the caller's events", async () => {
    const cookie = await hostCookie();
    await createEventAs(cookie, { title: "Mine" });

    const otherCookie = await hostCookie("owner-2");
    await createEventAs(otherCookie, { title: "Not mine" });

    const res = await SELF.fetch("https://example.com/api/events", { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const events = await res.json<{ title: string }[]>();
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe("Mine");
  });
});

describe("POST /api/events", () => {
  it("creates a draft event owned by the caller", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie, { title: "Wedding Quiz" });
    expect(created).toMatchObject({ title: "Wedding Quiz", status: "draft" });
  });

  it("rejects a missing title with 400", async () => {
    const cookie = await hostCookie();
    const res = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET/PATCH/DELETE /api/events/:id", () => {
  it("returns 404 for a missing event", async () => {
    const cookie = await hostCookie();
    const res = await SELF.fetch("https://example.com/api/events/missing", { headers: { Cookie: cookie } });
    expect(res.status).toBe(404);
  });

  it("returns 403 when a different owner reads the event", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const otherCookie = await hostCookie("owner-2");
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}`, { headers: { Cookie: otherCookie } });
    expect(res.status).toBe(403);
  });

  it("updates fields via PATCH", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie, { title: "Old" });

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "New" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json<{ title: string }>()).title).toBe("New");
  });

  it("deletes the event, returning 204", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(204);

    const getRes = await SELF.fetch(`https://example.com/api/events/${created.id}`, { headers: { Cookie: cookie } });
    expect(getRes.status).toBe(404);
  });
});

describe("POST /api/events/:id/duplicate", () => {
  it("creates a new draft event carrying over questions but not results", async () => {
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

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/duplicate`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(201);
    const duplicated = await res.json<{ id: string; questions: unknown[] }>();
    expect(duplicated.id).not.toBe(created.id);
    expect(duplicated.questions).toHaveLength(1);
  });
});

describe("questions endpoints", () => {
  async function setupLiveEvent(cookie: string) {
    const created = await createEventAs(cookie);
    await env.DB.prepare("UPDATE event SET status = 'live' WHERE id = ?").bind(created.id).run();
    return created;
  }

  it("creates a question with options", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
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
    expect(res.status).toBe(201);
    const question = await res.json<{ options: unknown[] }>();
    expect(question.options).toHaveLength(2);
  });

  it("rejects a question with no correct option as 400 with fields", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "2+2?",
        timeLimitSec: 30,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: false },
        ],
      }),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "VALIDATION", fields: ["correctOption"] });
  });

  it("rejects question creation with 409 while the event is live", async () => {
    const cookie = await hostCookie();
    const created = await setupLiveEvent(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
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
    expect(res.status).toBe(409);
  });

  it("updates and deletes a question, and reorders questions", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const q1res = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "Q1",
        timeLimitSec: 30,
        options: [
          { label: "a", isCorrect: true },
          { label: "b", isCorrect: false },
        ],
      }),
    });
    const q1 = await q1res.json<{ id: string }>();

    const q2res = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "Q2",
        timeLimitSec: 30,
        options: [
          { label: "a", isCorrect: true },
          { label: "b", isCorrect: false },
        ],
      }),
    });
    const q2 = await q2res.json<{ id: string }>();

    const patchRes = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/${q1.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "Q1 edited",
        timeLimitSec: 45,
        options: [
          { label: "x", isCorrect: true },
          { label: "y", isCorrect: false },
        ],
      }),
    });
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json<{ body: string }>()).body).toBe("Q1 edited");

    const orderRes = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/order`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ questionIds: [q2.id, q1.id] }),
    });
    expect(orderRes.status).toBe(200);
    const ordered = await orderRes.json<{ id: string }[]>();
    expect(ordered.map((q) => q.id)).toEqual([q2.id, q1.id]);

    const deleteRes = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/${q1.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(deleteRes.status).toBe(204);
  });
});

describe("POST /api/events/:id/publish", () => {
  async function addQuestion(cookie: string, eventId: string) {
    await SELF.fetch(`https://example.com/api/events/${eventId}/questions`, {
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
  }

  it("rejects publishing an event with no questions with 422", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(422);
  });

  it("publishes an event with questions, returning join/stage URLs and initializing the live session", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    await addQuestion(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ joinCode: string; joinUrl: string; stageToken: string; stageUrl: string }>();
    expect(body.joinCode).toHaveLength(10);
    expect(body.joinUrl).toContain(body.joinCode);
    expect(body.stageUrl).toContain(body.stageToken);

    const statusRow = await env.DB.prepare("SELECT status FROM event WHERE id = ?").bind(created.id).first<{ status: string }>();
    expect(statusRow?.status).toBe("published");

    // DO が publish 時点で Lobby フェーズとして待機し、参加登録を裁けることを確認する（要件5.1 の前提）
    const joinRes = await env.QUIZ_SESSION.getByName(created.id).fetch("https://do/internal/join", {
      method: "POST",
      body: JSON.stringify({ nickname: "alice" }),
    });
    expect(await joinRes.json()).toMatchObject({ ok: true });
  });

  it("is idempotent when called twice, returning the same codes", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    await addQuestion(cookie, created.id);

    const first = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
    const firstBody = await first.json<{ joinCode: string }>();
    const second = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
    const secondBody = await second.json<{ joinCode: string }>();

    expect(secondBody.joinCode).toBe(firstBody.joinCode);
  });
});

describe("GET /api/events/:id/stage-token", () => {
  it("returns 409 before the event is published", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/stage-token`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(409);
  });

  it("returns the stage token and URL once published", async () => {
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
    const publishRes = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, { method: "POST", headers: { Cookie: cookie } });
    const published = await publishRes.json<{ stageToken: string }>();

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/stage-token`, { headers: { Cookie: cookie } });
    expect(res.status).toBe(200);
    const body = await res.json<{ stageToken: string; stageUrl: string }>();
    expect(body.stageToken).toBe(published.stageToken);
  });
});

describe("PUT /api/events/:id/theme", () => {
  it("saves the theme and round-trips it", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const theme = { ...DEFAULT_THEME, primaryColor: "#ff0000" };
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(theme),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(theme);
  });

  it("is allowed while the event is live", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    await env.DB.prepare("UPDATE event SET status = 'live' WHERE id = ?").bind(created.id).run();

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ ...DEFAULT_THEME, primaryColor: "#00ff00" }),
    });
    expect(res.status).toBe(200);
  });
});
