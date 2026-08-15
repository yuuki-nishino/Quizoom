import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

async function createAndPublish(
  cookie: string,
  opts: { capacity?: number } = {},
): Promise<{ id: string; joinCode: string; stageToken: string }> {
  const createRes = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "My Event", capacity: opts.capacity }),
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

  const publishRes = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  const published = await publishRes.json<{ joinCode: string; stageToken: string }>();

  return { id: created.id, joinCode: published.joinCode, stageToken: published.stageToken };
}

describe("GET /api/join/:joinCode", () => {
  it("returns 404 for an unknown join code", async () => {
    const res = await SELF.fetch("https://example.com/api/join/unknown-code");
    expect(res.status).toBe(404);
  });

  it("returns the eventId, event title, theme, and accepting status for a published event", async () => {
    const cookie = await hostCookie();
    const { id, joinCode } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`);
    expect(res.status).toBe(200);
    const body = await res.json<{ eventId: string; eventTitle: string; accepting: boolean; theme: { primaryColor: string } }>();
    expect(body.eventId).toBe(id);
    expect(body.eventTitle).toBe("My Event");
    expect(body.accepting).toBe(true);
    expect(typeof body.theme.primaryColor).toBe("string");
  });

  it("returns 410 once the event has finished", async () => {
    const cookie = await hostCookie();
    const { id, joinCode } = await createAndPublish(cookie);
    await env.DB.prepare("UPDATE event SET status = 'finished' WHERE id = ?").bind(id).run();

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`);
    expect(res.status).toBe(410);
  });
});

describe("POST /api/join/:joinCode", () => {
  it("returns 404 for an unknown join code", async () => {
    const res = await SELF.fetch("https://example.com/api/join/unknown-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    expect(res.status).toBe(404);
  });

  it("registers a participant and returns a token, participantId, and eventId", async () => {
    const cookie = await hostCookie();
    const { id, joinCode } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json<{ token: string; participantId: string; eventId: string }>();
    expect(typeof body.token).toBe("string");
    expect(typeof body.participantId).toBe("string");
    expect(body.eventId).toBe(id);
  });

  it("rejects a duplicate nickname with 409", async () => {
    const cookie = await hostCookie();
    const { joinCode } = await createAndPublish(cookie);

    await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "NICKNAME_TAKEN" });
  });

  it("rejects once capacity is reached with 423", async () => {
    const cookie = await hostCookie();
    const { joinCode } = await createAndPublish(cookie, { capacity: 1 });

    await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "bob" }),
    });
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "CAPACITY_REACHED" });
  });

  it("rejects a finished event with 410", async () => {
    const cookie = await hostCookie();
    const { id, joinCode } = await createAndPublish(cookie);
    await env.DB.prepare("UPDATE event SET status = 'finished' WHERE id = ?").bind(id).run();

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    expect(res.status).toBe(410);
  });

  it("rejects an empty nickname with 400", async () => {
    const cookie = await hostCookie();
    const { joinCode } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a nickname containing control characters with 400", async () => {
    const cookie = await hostCookie();
    const { joinCode } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/join/${joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice\nbob" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/stage/:eventId", () => {
  it("returns the event title, theme, and join code for a valid stage token (no auth required)", async () => {
    const cookie = await hostCookie();
    const { id, joinCode, stageToken } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/stage/${id}?token=${stageToken}`);
    expect(res.status).toBe(200);
    const body = await res.json<{ eventTitle: string; joinCode: string; theme: { primaryColor: string } }>();
    expect(body.eventTitle).toBe("My Event");
    expect(body.joinCode).toBe(joinCode);
    expect(typeof body.theme.primaryColor).toBe("string");
  });

  it("returns 401 when the token is missing", async () => {
    const cookie = await hostCookie();
    const { id } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/stage/${id}`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for an incorrect stage token", async () => {
    const cookie = await hostCookie();
    const { id } = await createAndPublish(cookie);

    const res = await SELF.fetch(`https://example.com/api/stage/${id}?token=wrong-token`);
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown event id", async () => {
    const res = await SELF.fetch("https://example.com/api/stage/unknown-id?token=whatever");
    expect(res.status).toBe(404);
  });
});
