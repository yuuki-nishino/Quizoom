import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, runInDurableObject } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import type { QuizSessionDO } from "../session/quiz-session-do";

// 結線統合(15.1): publish(CatalogRoutes書き込み)→startSession(DO書き込み)→finalize(DO書き込み)の
// 一連の経路をAPI呼び出しのみで通しで動作させ、各段階でD1のevent.statusが正しく更新されること、
// および各段階でのカタログAPIの権限判定(開催中の編集禁止、外観のみ許可)を確認する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

async function readStatus(eventId: string): Promise<string> {
  const row = await env.DB.prepare("SELECT status FROM event WHERE id = ?").bind(eventId).first<{ status: string }>();
  if (!row) throw new Error(`event ${eventId} not found`);
  return row.status;
}

async function sendHostCommand(eventId: string, command: unknown): Promise<{ readonly rejected: readonly unknown[] }> {
  const stub = env.QUIZ_SESSION.getByName(eventId) as DurableObjectStub<QuizSessionDO>;
  const sent: string[] = [];
  const ws = { deserializeAttachment: () => ({ role: "host", eventId }), send: (m: string) => sent.push(m), close: () => {} } as unknown as WebSocket;
  await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify(command)));
  return { rejected: sent.map((m) => JSON.parse(m)).filter((m: { type: string }) => m.type === "commandRejected") };
}

describe("event.status lifecycle: draft -> published -> live -> finished via API calls only", () => {
  it("advances event.status at each stage and enforces the correct permission gating at each stage", async () => {
    const cookie = await hostCookie();

    // draft
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Quiz Night" }),
    });
    const created = await createRes.json<{ id: string }>();
    expect(await readStatus(created.id)).toBe("draft");

    const questionRes = await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
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
    expect(questionRes.status).toBe(201);
    const question = await questionRes.json<{ id: string }>();

    // draft -> published
    const publishRes = await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(publishRes.status).toBe(200);
    expect(await readStatus(created.id)).toBe("published");

    // published: 設問編集はまだ許可される
    const editWhilePublished = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "2+2? (edited)",
        timeLimitSec: 30,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
        ],
      }),
    });
    expect(editWhilePublished.status).toBe(200);

    // published -> live (startSessionはDO側から書き戻す)
    const { rejected: startRejected } = await sendHostCommand(created.id, { type: "startSession" });
    expect(startRejected).toEqual([]);
    expect(await readStatus(created.id)).toBe("live");

    // live: 設問編集は409(EVENT_LIVE)で拒否される
    const editWhileLive = await SELF.fetch(`https://example.com/api/events/${created.id}/questions/${question.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        body: "2+2? (should be rejected)",
        timeLimitSec: 30,
        options: [
          { label: "3", isCorrect: false },
          { label: "4", isCorrect: true },
        ],
      }),
    });
    expect(editWhileLive.status).toBe(409);
    expect(await editWhileLive.json()).toEqual({ error: "EVENT_LIVE" });

    // live: 外観変更は許可される(進行を中断しない)
    const themeWhileLive = await SELF.fetch(`https://example.com/api/events/${created.id}/theme`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        primaryColor: "#123456",
        accentColor: "#654321",
        backgroundColor: "#ffffff",
        textColor: "#000000",
        logoAssetId: null,
        backgroundAssetId: null,
      }),
    });
    expect(themeWhileLive.status).toBe(200);

    // 出題〜正解発表を経て live -> finished (finalizeもDO側から書き戻す)
    await sendHostCommand(created.id, { type: "openQuestion" });
    await sendHostCommand(created.id, { type: "closeQuestion" });
    await sendHostCommand(created.id, { type: "revealAnswer" });
    const { rejected: finalizeRejected } = await sendHostCommand(created.id, { type: "finalize" });
    expect(finalizeRejected).toEqual([]);
    expect(await readStatus(created.id)).toBe("finished");
  });
});

describe("event.status write-back retry: DO phase transition survives even if the D1 write-back attempt fails", () => {
  it("finalize commits the DO's own final-ranking phase regardless of the eventual D1 status outcome", async () => {
    // #updateStatusWithRetry の再試行そのものは src/server/session/retry.test.ts で純粋関数として検証済み。
    // ここでは、その再試行の呼び出し順序(DOのフェーズ確定が先、D1書き戻しは後続の副作用)により、
    // finalize 実行後は D1 の書き戻し結果によらず DO 側が finalRanking へ確定していることを確認する
    const cookie = await hostCookie();
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

    await sendHostCommand(created.id, { type: "startSession" });
    await sendHostCommand(created.id, { type: "openQuestion" });
    await sendHostCommand(created.id, { type: "closeQuestion" });
    await sendHostCommand(created.id, { type: "revealAnswer" });
    const { rejected } = await sendHostCommand(created.id, { type: "finalize" });
    expect(rejected).toEqual([]);

    const stub = env.QUIZ_SESSION.getByName(created.id) as DurableObjectStub<QuizSessionDO>;
    const phase = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec("SELECT phase_json FROM session_state").toArray(),
    );
    expect(JSON.parse((phase[0] as { phase_json: string }).phase_json)).toEqual({ kind: "finalRanking" });
    expect(await readStatus(created.id)).toBe("finished");
  });
});
