import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

// 検証(task 7): 招待〜受諾〜進行操作の一気通貫、所有者専用操作の網羅的拒否、
// 解除・離脱後の即時失効を、SELF.fetch + 実WebSocket接続で通しで確認する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event_collaborator; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

async function connectPublic(url: string, headers: Record<string, string> = {}): Promise<{ ws: WebSocket; snapshot: any }> {
  const res = await SELF.fetch(url, { headers: { Upgrade: "websocket", ...headers } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const snapshot = await nextMessage(ws);
  expect(snapshot.type).toBe("stateSnapshot");
  return { ws, snapshot };
}

async function hostCookie(userId: string): Promise<string> {
  return createHostCookie(env, userId);
}

async function createEventAs(cookie: string): Promise<{ id: string }> {
  const res = await SELF.fetch("https://example.com/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ title: "Wedding Quiz" }),
  });
  expect(res.status).toBe(201);
  return res.json<{ id: string }>();
}

async function addQuestion(cookie: string, eventId: string): Promise<{ id: string }> {
  const res = await SELF.fetch(`https://example.com/api/events/${eventId}/questions`, {
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
  return res.json<{ id: string }>();
}

/** 所有者のCookieでイベントに招待を発行し、collaboratorId(userId)でログインして受諾する。受諾者のCookieを返す */
async function inviteAndAccept(ownerCookie: string, eventId: string, collaboratorId: string): Promise<string> {
  const inviteRes = await SELF.fetch(`https://example.com/api/events/${eventId}/collaborators/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: ownerCookie },
    body: JSON.stringify({ email: `${collaboratorId}@example.com` }),
  });
  expect(inviteRes.status).toBe(201);
  const { inviteUrl } = await inviteRes.json<{ inviteUrl: string }>();
  const token = inviteUrl.split("/").pop()!;

  const collaboratorCookie = await hostCookie(collaboratorId);
  const acceptRes = await SELF.fetch(`https://example.com/api/collaborators/invites/${token}/accept`, {
    method: "POST",
    headers: { Cookie: collaboratorCookie },
  });
  expect(acceptRes.status).toBe(200);
  return collaboratorCookie;
}

describe("collaborator: invite -> accept -> host operation, end to end", () => {
  it("lets an invited collaborator run the host console and broadcast to participants", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const question = await addQuestion(ownerCookie, event.id);
    const publishRes = await SELF.fetch(`https://example.com/api/events/${event.id}/publish`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    const published = await publishRes.json<{ joinCode: string }>();

    const collaboratorCookie = await inviteAndAccept(ownerCookie, event.id, "friend-1");

    const joinRes = await SELF.fetch(`https://example.com/api/join/${published.joinCode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname: "alice" }),
    });
    const alice = await joinRes.json<{ token: string }>();

    const { ws: hostWs } = await connectPublic(`https://example.com/connect?eventId=${event.id}&role=host`, {
      Cookie: collaboratorCookie,
    });
    const { ws: aliceWs } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=participant&token=${alice.token}`,
    );

    const readyMsgs = Promise.all([nextMessage(hostWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "startSession" }));
    for (const msg of await readyMsgs) {
      expect(msg.payload.phase).toEqual({ kind: "ready", nextQuestionId: question.id });
    }

    const openedMsgs = Promise.all([nextMessage(hostWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "openQuestion" }));
    const [, aliceOpened] = await openedMsgs;
    expect(aliceOpened.type).toBe("questionOpened");
    expect(aliceOpened.payload.question.id).toBe(question.id);

    hostWs.close();
    aliceWs.close();
  });
});

describe("collaborator: exhaustive owner-only rejection", () => {
  it("rejects every owner-only operation when attempted by an accepted collaborator", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    await addQuestion(ownerCookie, event.id);
    const collaboratorCookie = await inviteAndAccept(ownerCookie, event.id, "friend-1");

    const deleteEventRes = await SELF.fetch(`https://example.com/api/events/${event.id}`, {
      method: "DELETE",
      headers: { Cookie: collaboratorCookie },
    });
    expect(deleteEventRes.status).toBe(403);

    const duplicateRes = await SELF.fetch(`https://example.com/api/events/${event.id}/duplicate`, {
      method: "POST",
      headers: { Cookie: collaboratorCookie },
    });
    expect(duplicateRes.status).toBe(403);

    const deleteParticipantDataRes = await SELF.fetch(`https://example.com/api/events/${event.id}/participant-data`, {
      method: "DELETE",
      headers: { Cookie: collaboratorCookie },
    });
    expect(deleteParticipantDataRes.status).toBe(403);

    const enableSharingRes = await SELF.fetch(`https://example.com/api/events/${event.id}/share`, {
      method: "POST",
      headers: { Cookie: collaboratorCookie },
    });
    expect(enableSharingRes.status).toBe(403);

    const disableSharingRes = await SELF.fetch(`https://example.com/api/events/${event.id}/share`, {
      method: "DELETE",
      headers: { Cookie: collaboratorCookie },
    });
    expect(disableSharingRes.status).toBe(403);

    const inviteRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: collaboratorCookie },
      body: JSON.stringify({ email: "someone-else@example.com" }),
    });
    expect(inviteRes.status).toBe(403);

    const listRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators`, {
      headers: { Cookie: collaboratorCookie },
    });
    expect(listRes.status).toBe(403);

    const revokeRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/anything`, {
      method: "DELETE",
      headers: { Cookie: collaboratorCookie },
    });
    expect(revokeRes.status).toBe(403);

    const cancelInviteRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/invites/anything`, {
      method: "DELETE",
      headers: { Cookie: collaboratorCookie },
    });
    expect(cancelInviteRes.status).toBe(403);
  });
});

describe("collaborator: immediate invalidation after revoke/leave", () => {
  async function collaboratorRowId(ownerCookie: string, eventId: string): Promise<string> {
    const res = await SELF.fetch(`https://example.com/api/events/${eventId}/collaborators`, { headers: { Cookie: ownerCookie } });
    const { collaborators } = await res.json<{ collaborators: readonly { id: string }[] }>();
    return collaborators[0]!.id;
  }

  it("rejects catalog API calls and host WebSocket connects immediately after the owner revokes access", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const collaboratorCookie = await inviteAndAccept(ownerCookie, event.id, "friend-1");

    const updateBefore = await SELF.fetch(`https://example.com/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: collaboratorCookie },
      body: JSON.stringify({ title: "Still allowed" }),
    });
    expect(updateBefore.status).toBe(200);

    const collaboratorId = await collaboratorRowId(ownerCookie, event.id);
    const revokeRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/${collaboratorId}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });
    expect(revokeRes.status).toBe(204);

    const updateAfter = await SELF.fetch(`https://example.com/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: collaboratorCookie },
      body: JSON.stringify({ title: "No longer allowed" }),
    });
    expect(updateAfter.status).toBe(403);

    const wsRes = await SELF.fetch(`https://example.com/connect?eventId=${event.id}&role=host`, {
      headers: { Upgrade: "websocket", Cookie: collaboratorCookie },
    });
    await wsRes.text();
    expect(wsRes.status).toBe(401);
  });

  it("rejects catalog API calls and host WebSocket connects immediately after the collaborator leaves", async () => {
    const ownerCookie = await hostCookie("owner-1");
    const event = await createEventAs(ownerCookie);
    const collaboratorCookie = await inviteAndAccept(ownerCookie, event.id, "friend-1");

    const leaveRes = await SELF.fetch(`https://example.com/api/events/${event.id}/collaborators/leave`, {
      method: "POST",
      headers: { Cookie: collaboratorCookie },
    });
    expect(leaveRes.status).toBe(204);

    const updateAfter = await SELF.fetch(`https://example.com/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: collaboratorCookie },
      body: JSON.stringify({ title: "No longer allowed" }),
    });
    expect(updateAfter.status).toBe(403);

    const wsRes = await SELF.fetch(`https://example.com/connect?eventId=${event.id}&role=host`, {
      headers: { Upgrade: "websocket", Cookie: collaboratorCookie },
    });
    await wsRes.text();
    expect(wsRes.status).toBe(401);
  });
});
