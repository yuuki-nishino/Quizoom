import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

// 検証(task 17.4 / Issue #6): 開始前に複数人が参加登録した際、進行画面・投影画面の
// 双方に正しい参加者数がリアルタイムに反映されることを、実HTTP・実WebSocket接続で確認する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
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

describe("participant count reflects on host console and presentation screen before the quiz starts", () => {
  it("shows an accurate, live-updating participant count on both screens", async () => {
    const ownerCookie = await createHostCookie(env, "owner-1");

    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ title: "Trivia Night" }),
    });
    const event = await createRes.json<{ id: string }>();

    await SELF.fetch(`https://example.com/api/events/${event.id}/questions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({
        body: "2+2?",
        timeLimitSec: 30,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
        ],
      }),
    });

    const publishRes = await SELF.fetch(`https://example.com/api/events/${event.id}/publish`, {
      method: "POST",
      headers: { Cookie: ownerCookie },
    });
    const published = await publishRes.json<{ joinCode: string; stageToken: string }>();

    async function joinAs(nickname: string): Promise<void> {
      const res = await SELF.fetch(`https://example.com/api/join/${published.joinCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      expect(res.status).toBe(200);
    }

    // 主催者・投影画面が接続する前に1名参加登録しておく
    await joinAs("alice");

    const { ws: hostWs, snapshot: hostSnapshot } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=host`,
      { Cookie: ownerCookie },
    );
    const { ws: stageWs, snapshot: stageSnapshot } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=stage&token=${published.stageToken}`,
    );

    // 接続前に参加していた分も、接続直後のstateSnapshotに反映されている（要件5.1, 6.9）
    expect(hostSnapshot.payload.participantCount).toBe(1);
    expect(stageSnapshot.payload.participantCount).toBe(1);

    // 接続後に参加した分も、両画面へリアルタイムに配信される
    const hostMsg = nextMessage(hostWs);
    const stageMsg = nextMessage(stageWs);
    await joinAs("bob");
    expect((await hostMsg).payload.participantCount).toBe(2);
    expect((await stageMsg).payload.participantCount).toBe(2);

    hostWs.close();
    stageWs.close();
  });
});
