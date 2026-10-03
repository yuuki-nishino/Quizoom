import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import { createParticipantTokenService } from "../session/participant-token";
import type { EventId, ParticipantId } from "../../shared/domain-types";

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event_collaborator; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
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

/** イベントに受諾済みの共同運営者を1名招待し、そのCookieを返す */
async function addAcceptedCollaboratorCookie(ownerCookie: string, eventId: string): Promise<string> {
  const inviteRes = await SELF.fetch(`https://example.com/api/events/${eventId}/collaborators/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ email: "collaborator@example.com" }),
  });
  const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
  const token = inviteUrl.split("/").pop()!;

  const collaboratorCookie = await hostCookie("collaborator");
  await SELF.fetch(`https://example.com/api/collaborators/invites/${token}/accept`, {
    method: "POST",
    headers: { Cookie: collaboratorCookie },
  });
  return collaboratorCookie;
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

  it("lets an accepted collaborator upload media", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const collaboratorCookie = await addAcceptedCollaboratorCookie(cookie, created.id);

    const form = new FormData();
    form.set("file", pngFile());
    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media`, {
      method: "POST",
      headers: { Cookie: collaboratorCookie },
      body: form,
    });
    expect(res.status).toBe(201);
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

  it("serves the image to an accepted collaborator", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const assetId = await uploadAsset(cookie, created.id);
    const collaboratorCookie = await addAcceptedCollaboratorCookie(cookie, created.id);

    const res = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${assetId}`, {
      headers: { Cookie: collaboratorCookie },
    });
    expect(res.status).toBe(200);
    await res.arrayBuffer();
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

describe("option image delivery (Issue #36)", () => {
  function jpegFile(bytes = 2048): File {
    return new File([new Uint8Array(bytes)], "option.jpg", { type: "image/jpeg" });
  }

  async function upload(cookie: string, eventId: string, file: File): Promise<Response> {
    const form = new FormData();
    form.set("file", file);
    return SELF.fetch(`https://example.com/api/events/${eventId}/media`, { method: "POST", headers: { Cookie: cookie }, body: form });
  }

  async function saveQuestionWithOptionImages(cookie: string, eventId: string, imageIds: readonly (string | null)[]) {
    const res = await SELF.fetch(`https://example.com/api/events/${eventId}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "どれ？",
        timeLimitSec: 30,
        options: imageIds.map((imageAssetId, i) => ({ label: `選択肢${i + 1}`, isCorrect: i === 0, imageAssetId })),
      }),
    });
    expect(res.status).toBe(201);
    return res.json<{ id: string; options: { imageAssetId: string | null }[] }>();
  }

  async function publish(cookie: string, eventId: string): Promise<string> {
    const res = await SELF.fetch(`https://example.com/api/events/${eventId}/publish`, { method: "POST", headers: { Cookie: cookie } });
    return (await res.json<{ stageToken: string }>()).stageToken;
  }

  it("accepts a processed JPEG option image through the existing upload validation", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const res = await upload(cookie, created.id, jpegFile());
    expect(res.status).toBe(201);
  });

  it("rejects an option image over the existing size limit with 413 and an unsupported type with 413", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    expect((await upload(cookie, created.id, jpegFile(6 * 1024 * 1024))).status).toBe(413);
    const gif = new File([new Uint8Array(16)], "a.gif", { type: "image/gif" });
    expect((await upload(cookie, created.id, gif)).status).toBe(413);
  });

  it("serves a saved option image to the owning host, the stage token and a participant token, and denies others", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const a = (await (await upload(cookie, created.id, jpegFile())).json<{ assetId: string }>()).assetId;
    const b = (await (await upload(cookie, created.id, jpegFile())).json<{ assetId: string }>()).assetId;
    const question = await saveQuestionWithOptionImages(cookie, created.id, [a, b]);
    expect(question.options.map((o) => o.imageAssetId)).toEqual([a, b]);
    const stageToken = await publish(cookie, created.id);

    const hostRes = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${a}`, { headers: { Cookie: cookie } });
    expect(hostRes.status).toBe(200);
    expect(hostRes.headers.get("Content-Type")).toBe("image/jpeg");
    await hostRes.arrayBuffer();

    const stageRes = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${b}?token=${stageToken}`);
    expect(stageRes.status).toBe(200);
    await stageRes.arrayBuffer();

    const participantToken = await createParticipantTokenService(env).issue({
      eventId: created.id as EventId,
      participantId: "p1" as ParticipantId,
      issuedAt: Date.now(),
    });
    const participantRes = await SELF.fetch(`https://example.com/api/events/${created.id}/media/${a}?token=${participantToken}`);
    expect(participantRes.status).toBe(200);
    await participantRes.arrayBuffer();

    expect((await SELF.fetch(`https://example.com/api/events/${created.id}/media/${a}`)).status).toBe(401);
    expect((await SELF.fetch(`https://example.com/api/events/${created.id}/media/${a}?token=wrong`)).status).toBe(403);
  });

  it("does not serve an option image of one event to another event's stage token", async () => {
    const cookie = await hostCookie();
    const first = await createEventAs(cookie);
    const second = await createEventAs(cookie);
    const assetId = (await (await upload(cookie, first.id, jpegFile())).json<{ assetId: string }>()).assetId;
    await saveQuestionWithOptionImages(cookie, first.id, [assetId, null]);
    await saveQuestionWithOptionImages(cookie, second.id, [null, null]);
    const secondStageToken = await publish(cookie, second.id);

    const res = await SELF.fetch(`https://example.com/api/events/${second.id}/media/${assetId}?token=${secondStageToken}`);
    expect(res.status).toBe(404);
    await res.arrayBuffer();
    const crossRes = await SELF.fetch(`https://example.com/api/events/${first.id}/media/${assetId}?token=${secondStageToken}`);
    expect(crossRes.status).toBe(403);
  });

  it("stops referencing a replaced or removed option image after the question is re-saved", async () => {
    const cookie = await hostCookie();
    const created = await createEventAs(cookie);
    const a = (await (await upload(cookie, created.id, jpegFile())).json<{ assetId: string }>()).assetId;
    const b = (await (await upload(cookie, created.id, jpegFile())).json<{ assetId: string }>()).assetId;
    const question = await saveQuestionWithOptionImages(cookie, created.id, [a, b]);

    const put = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "どれ？",
        timeLimitSec: 30,
        options: [
          { label: "選択肢1", isCorrect: true, imageAssetId: b },
          { label: "選択肢2", isCorrect: false, imageAssetId: null },
        ],
      }),
    });
    expect(put.status).toBe(200);
    const updated = await put.json<{ options: { imageAssetId: string | null }[] }>();
    expect(updated.options.map((o) => o.imageAssetId)).toEqual([b, null]);
    expect(updated.options.some((o) => o.imageAssetId === a)).toBe(false);
  });
});
