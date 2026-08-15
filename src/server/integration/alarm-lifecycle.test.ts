import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF, runInDurableObject } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";
import type { QuizSessionDO } from "../session/quiz-session-do";

// 結線統合(15.3): 出題中以外の全フェーズでDOアラームが設定されていないこと、
// アラームが設定される回数が出題回数と一致することを、イベント全体を通しで確認する。
// アラームの設定箇所そのものは quiz-session-do.ts の #applyAlarm 一箇所のみであり
// (grep で確認済み: setAlarm/deleteAlarm の呼び出しは #applyAlarm 内のみに存在し、
// 締切以外の用途に拡張されていない)、ここではその適用結果を実行時に検証する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

async function hostCookie(userId = "owner-1"): Promise<string> {
  return createHostCookie(env, userId);
}

async function sendHostCommand(eventId: string, command: unknown): Promise<{ readonly rejected: readonly unknown[] }> {
  const stub = env.QUIZ_SESSION.getByName(eventId) as DurableObjectStub<QuizSessionDO>;
  const sent: string[] = [];
  const ws = { deserializeAttachment: () => ({ role: "host", eventId }), send: (m: string) => sent.push(m), close: () => {} } as unknown as WebSocket;
  await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify(command)));
  return { rejected: sent.map((m) => JSON.parse(m)).filter((m: { type: string }) => m.type === "commandRejected") };
}

/** 現在アラームが設定されているかを、発火させずに非破壊で確認する */
async function hasPendingAlarm(eventId: string): Promise<boolean> {
  const stub = env.QUIZ_SESSION.getByName(eventId) as DurableObjectStub<QuizSessionDO>;
  const alarm = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
  return alarm !== null;
}

async function currentPhaseKind(eventId: string): Promise<string> {
  const stub = env.QUIZ_SESSION.getByName(eventId) as DurableObjectStub<QuizSessionDO>;
  const rows = await runInDurableObject(stub, (_instance, state) => state.storage.sql.exec("SELECT phase_json FROM session_state").toArray());
  return (JSON.parse((rows[0] as { phase_json: string }).phase_json) as { kind: string }).kind;
}

describe("DO alarm lifecycle across a full 2-question event run", () => {
  it("has an alarm set only while a question is open, across every phase of the run", async () => {
    const cookie = await hostCookie();
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Two Question Quiz" }),
    });
    const created = await createRes.json<{ id: string }>();

    for (const body of ["2+2?", "3+3?"]) {
      await SELF.fetch(`https://example.com/api/events/${created.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          body,
          timeLimitSec: 30,
          options: [
            { label: "wrong", isCorrect: false },
            { label: "right", isCorrect: true },
          ],
        }),
      });
    }
    await SELF.fetch(`https://example.com/api/events/${created.id}/publish`, { method: "POST", headers: { Cookie: cookie } });

    // lobby: アラームなし
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "startSession" });
    expect(await currentPhaseKind(created.id)).toBe("ready");
    expect(await hasPendingAlarm(created.id)).toBe(false); // ready: アラームなし

    // --- 設問1 ---
    await sendHostCommand(created.id, { type: "openQuestion" });
    expect(await currentPhaseKind(created.id)).toBe("questionOpen");
    expect(await hasPendingAlarm(created.id)).toBe(true); // 出題中: アラームあり(1回目)

    await sendHostCommand(created.id, { type: "closeQuestion" });
    expect(await currentPhaseKind(created.id)).toBe("questionClosed");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "revealAnswer" });
    expect(await currentPhaseKind(created.id)).toBe("revealed");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "showRanking" });
    expect(await currentPhaseKind(created.id)).toBe("interimRanking");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "nextQuestion" });
    expect(await currentPhaseKind(created.id)).toBe("ready");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    // --- 設問2(最終問) ---
    await sendHostCommand(created.id, { type: "openQuestion" });
    expect(await currentPhaseKind(created.id)).toBe("questionOpen");
    expect(await hasPendingAlarm(created.id)).toBe(true); // 出題中: アラームあり(2回目)

    await sendHostCommand(created.id, { type: "closeQuestion" });
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "revealAnswer" });
    expect(await currentPhaseKind(created.id)).toBe("revealed");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    const { rejected } = await sendHostCommand(created.id, { type: "finalize" });
    expect(rejected).toEqual([]);
    expect(await currentPhaseKind(created.id)).toBe("finalRanking");
    expect(await hasPendingAlarm(created.id)).toBe(false); // finalize: 防御的に解除済み
  });

  it("clears the alarm while paused, so the original deadline never fires it", async () => {
    const cookie = await hostCookie();
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Pause Test" }),
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
    expect(await hasPendingAlarm(created.id)).toBe(true);

    await sendHostCommand(created.id, { type: "pause" });
    expect(await currentPhaseKind(created.id)).toBe("paused");
    expect(await hasPendingAlarm(created.id)).toBe(false);

    await sendHostCommand(created.id, { type: "resume" });
    expect(await currentPhaseKind(created.id)).toBe("questionOpen");
    expect(await hasPendingAlarm(created.id)).toBe(true);
  });
});
