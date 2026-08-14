import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import { createParticipantTokenService } from "../session/participant-token";
import type { EventId, ParticipantId } from "../../shared/domain-types";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

async function createEventAs(cookie: string): Promise<{ id: string }> {
  const res = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "My Event" }),
  });
  return res.json<{ id: string }>();
}

function pngFile(bytes = 16): File {
  return new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" });
}

describe("POST /api/events/:id/media", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const form = new FormData();
    form.set("file", pngFile());
    const res = await SELF.fetch("https://example.com/api/events/e1/media", { method: "POST", body: form });
    expect(res.status).toBe(401);
  });

  it("rejects a non-owner with 403", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const otherCookie = await hostCookie("owner-2");

    const form = new FormData();
    form.set("file", pngFile());
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: otherCookie },
      body: form,
    });
    expect(res.status).toBe(403);
  });

  it("rejects a missing file with 400", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: new FormData(),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unsupported format with 413", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const form = new FormData();
    form.set("file", new File([new Uint8Array(16)], "doc.gif", { type: "image/gif" }));
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    expect(res.status).toBe(413);
  });

  it("rejects an oversized file with 413", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const form = new FormData();
    form.set("file", pngFile(6 * 1024 * 1024));
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    expect(res.status).toBe(413);
  });

  it("stores a valid image and returns an assetId", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const form = new FormData();
    form.set("file", pngFile());
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    expect(res.status).toBe(201);
    const body = await res.json<{ assetId: string }>();
    expect(typeof body.assetId).toBe("string");
  });
});

describe("GET /api/events/:id/media/:assetId", () => {
  async function uploadAsset(cookie: string, eventId: string): Promise<string> {
    const form = new FormData();
    form.set("file", pngFile());
    const res = await SELF.fetch(`https://example.com/api/events/${eventId}/media`, {
      method: "POST",
      headers: { Cookie: cookie },
      body: form,
    });
    const body = await res.json<{ assetId: string }>();
    return body.assetId;
  }

  it("rejects a request with no credentials at all with 401", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}`);
    expect(res.status).toBe(401);
  });

  it("rejects an unauthorized third party as 403", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);

    const otherCookie = await hostCookie("owner-2");
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}`, {
      headers: { Cookie: otherCookie },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing asset", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/missing-asset`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(404);
  });

  it("serves the image to the owning host with the correct content type", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}`, {
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=3600");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toHaveLength(16);
  });

  it("serves the image to a valid participant token for that event", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);

    const token = await createParticipantTokenService(env).issue({
      eventId: created.id as EventId,
      participantId: "p1" as ParticipantId,
      issuedAt: Date.now(),
    });

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}?token=${token}`);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
  });

  it("rejects a participant token scoped to a different event with 403", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);

    const token = await createParticipantTokenService(env).issue({
      eventId: "other-event" as EventId,
      participantId: "p1" as ParticipantId,
      issuedAt: Date.now(),
    });

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}?token=${token}`);
    expect(res.status).toBe(403);
  });

  async function publishEvent(cookie: string, eventId: string): Promise<string> {
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
    const publishRes = await SELF.fetch(`https://example.com/api/events/${eventId}/publish`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    const { stageToken } = await publishRes.json<{ stageToken: string }>();
    return stageToken;
  }

  it("serves the image to a valid stage token for that event", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);
    const stageToken = await publishEvent(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}?token=${stageToken}`);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
  });

  it("rejects an incorrect stage token with 403", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);
    await publishEvent(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}?token=wrong-stage-token`);
    expect(res.status).toBe(403);
  });
});
