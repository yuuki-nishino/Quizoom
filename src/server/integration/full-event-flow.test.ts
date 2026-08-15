import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

// 検証(16.3): 主催者ログイン(相当)→イベント作成→設問登録→公開→QR取得(joinCode/stageToken)、
// 参加者のQRのURL相当(join code)からの参加→回答→結果表示、そして host/stage/participant の
// 3画面が公開APIの単一の "/connect" エンドポイントを通じて同一の進行状態を同期して受け取ること、
// 途中参加者が未出題の設問のみ回答できランキングに含まれること、回答画面のリロード相当
// (トークンでの再接続)後に送信済み回答が保持されたまま復帰することを、
// SELF.fetch + 実WebSocket接続のみで(内部APIをバイパスせず)通しで確認する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

interface CreatedQuestion {
  readonly id: string;
  readonly options: readonly { readonly id: string; readonly label: string; readonly isCorrect: boolean }[];
}

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

/**
 * 接続直後に必ず届く stateSnapshot は、複数ソケットを先に開いてから後でまとめて読むと
 * 先着のメッセージが listener 未登録のまま失われる(WebSocket の message イベントはバッファされない)。
 * そのため接続の都度、初回スナップショットをここで読み切って返す。
 */
async function connectPublic(url: string, headers: Record<string, string> = {}): Promise<{ ws: WebSocket; snapshot: any }> {
  const res = await SELF.fetch(url, { headers: { Upgrade: "websocket", ...headers } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  const snapshot = await nextMessage(ws);
  expect(snapshot.type).toBe("stateSnapshot");
  return { ws, snapshot };
}

describe("full event flow via the public HTTP + WebSocket API", () => {
  it("takes a two-question event from creation through finalized results, keeping host/stage/participant screens in sync", async () => {
    const cookie = await createHostCookie(env, "owner-1");

    // 1. 主催者: イベント作成 → 設問登録 → 公開(参加コード・投影トークンの取得= QR取得相当)
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Trivia Night" }),
    });
    expect(createRes.status).toBe(201);
    const event = await createRes.json<{ id: string }>();

    async function addQuestion(body: string, correctLabel: "A" | "B"): Promise<CreatedQuestion> {
      const res = await SELF.fetch(`https://example.com/api/events/${event.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({
          body,
          timeLimitSec: 30,
          options: [
            { label: "A", isCorrect: correctLabel === "A" },
            { label: "B", isCorrect: correctLabel === "B" },
          ],
        }),
      });
      expect(res.status).toBe(201);
      return res.json<CreatedQuestion>();
    }
    const q1 = await addQuestion("2+2?", "B");
    const q2 = await addQuestion("3+3?", "A");

    const publishRes = await SELF.fetch(`https://example.com/api/events/${event.id}/publish`, {
      method: "POST",
      headers: { Cookie: cookie },
    });
    expect(publishRes.status).toBe(200);
    const published = await publishRes.json<{ joinCode: string; stageToken: string }>();

    // 2. 参加者: 参加用コード(QRのURL相当)からイベント情報を確認し、ニックネームで参加登録する
    const joinInfoRes = await SELF.fetch(`https://example.com/api/join/${published.joinCode}`);
    expect(joinInfoRes.status).toBe(200);
    expect((await joinInfoRes.json<{ accepting: boolean }>()).accepting).toBe(true);

    async function joinAs(nickname: string): Promise<{ token: string; participantId: string }> {
      const res = await SELF.fetch(`https://example.com/api/join/${published.joinCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      expect(res.status).toBe(200);
      return res.json<{ token: string; participantId: string }>();
    }
    const alice = await joinAs("alice");

    // 3. 3画面すべてが公開の /connect エンドポイントを通じて接続する
    //    (主催者はセッションCookie、投影は投影トークン、参加者は参加者トークンでそれぞれ認証される)
    const { ws: hostWs } = await connectPublic(`https://example.com/connect?eventId=${event.id}&role=host`, { Cookie: cookie });
    const { ws: stageWs } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=stage&token=${published.stageToken}`,
    );
    const { ws: aliceWs } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=participant&token=${alice.token}`,
    );

    // 4. startSession: 3画面すべてが同一の ready フェーズを受け取る
    const readyMsgs = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "startSession" }));
    for (const msg of await readyMsgs) {
      expect(msg.type).toBe("stateSnapshot");
      expect(msg.payload.phase).toEqual({ kind: "ready", nextQuestionId: q1.id });
    }

    // 5. openQuestion: 3画面すべてが同一の設問を同時に受け取る
    const openedMsgs = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "openQuestion" }));
    for (const msg of await openedMsgs) {
      expect(msg.type).toBe("questionOpened");
      expect(msg.payload.question.id).toBe(q1.id);
    }
    // openQuestion 後は host/stage へ progressUpdated も届く
    const hostProgressAfterOpen = await nextMessage(hostWs);
    expect(hostProgressAfterOpen).toEqual({ type: "progressUpdated", payload: { answeredCount: 0, totalCount: 1 } });

    // 6. alice が正解を回答する
    const q1CorrectOptionId = q1.options.find((o) => o.label === "B")!.id;
    const hostProgress = nextMessage(hostWs);
    const aliceAccepted = nextMessage(aliceWs);
    aliceWs.send(JSON.stringify({ type: "submitAnswer", questionId: q1.id, optionId: q1CorrectOptionId }));
    expect(await aliceAccepted).toEqual({
      type: "answerAccepted",
      payload: { questionId: q1.id, selectedOptionId: q1CorrectOptionId },
    });
    expect(await hostProgress).toEqual({ type: "progressUpdated", payload: { answeredCount: 1, totalCount: 1 } });

    // 7. 締切 → 正解発表: 投影には分布と正解のみ、参加者には自分の正誤・順位のみが届く
    const closedMsgs = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "closeQuestion" }));
    await closedMsgs;

    const stageReveal = nextMessage(stageWs);
    const aliceReveal = nextMessage(aliceWs);
    hostWs.send(JSON.stringify({ type: "revealAnswer" }));
    const stageRevealMsg = await stageReveal;
    const aliceRevealMsg = await aliceReveal;
    expect(stageRevealMsg.payload.personalResult).toBeNull();
    expect(stageRevealMsg.payload.correctOptionId).toBe(q1CorrectOptionId);
    expect(aliceRevealMsg.payload.personalResult).toEqual({ isCorrect: true, correctCount: 1, rank: 1 });

    // 8. 途中参加者 bob が Q1 の正解発表後に参加する: 未出題(Q2)のみ回答対象で、現在のフェーズをそのまま受け取る
    const bob = await joinAs("bob");
    const { ws: bobWs, snapshot: bobSnapshot } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=participant&token=${bob.token}`,
    );
    expect(bobSnapshot.payload.phase).toEqual({ kind: "revealed", questionId: q1.id });
    expect(bobSnapshot.payload.self.answeredQuestionIds).toEqual([]);

    // 9. Q2 へ進行: bob は回答できるが、alice は Q1 に再度回答できない(締切済み)
    const hostNext = nextMessage(hostWs);
    hostWs.send(JSON.stringify({ type: "nextQuestion" }));
    expect((await hostNext).payload.phase).toEqual({ kind: "ready", nextQuestionId: q2.id });

    const q2OpenedMsgs = Promise.all([nextMessage(hostWs), nextMessage(bobWs)]);
    hostWs.send(JSON.stringify({ type: "openQuestion" }));
    for (const msg of await q2OpenedMsgs) {
      expect(msg.type).toBe("questionOpened");
      expect(msg.payload.question.id).toBe(q2.id);
    }

    const aliceLateAttempt = nextMessage(aliceWs);
    aliceWs.send(JSON.stringify({ type: "submitAnswer", questionId: q1.id, optionId: q1CorrectOptionId }));
    expect(await aliceLateAttempt).toEqual({
      type: "commandRejected",
      payload: { code: "ANSWER_WINDOW_CLOSED", message: expect.any(String) },
    });

    const q2CorrectOptionId = q2.options.find((o) => o.label === "A")!.id;
    const bobAccepted = nextMessage(bobWs);
    bobWs.send(JSON.stringify({ type: "submitAnswer", questionId: q2.id, optionId: q2CorrectOptionId }));
    expect((await bobAccepted).type).toBe("answerAccepted");

    const closedQ2Msgs = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs), nextMessage(bobWs)]);
    hostWs.send(JSON.stringify({ type: "closeQuestion" }));
    await closedQ2Msgs;

    const bobReveal = nextMessage(bobWs);
    hostWs.send(JSON.stringify({ type: "revealAnswer" }));
    expect((await bobReveal).payload.personalResult).toEqual({ isCorrect: true, correctCount: 1, rank: expect.any(Number) });

    // 10. 最終結果を確定する
    const finalRankingMsg = nextMessage(stageWs);
    hostWs.send(JSON.stringify({ type: "finalize" }));
    expect((await finalRankingMsg).payload.isFinal).toBe(true);

    hostWs.close();
    stageWs.close();
    aliceWs.close();
    bobWs.close();

    // 11. 主催者が確定結果を閲覧する: 途中参加の bob もランキングに含まれ、それぞれ担当した設問のみ正誤が記録されている
    const resultsRes = await SELF.fetch(`https://example.com/api/events/${event.id}/results`, {
      headers: { Cookie: cookie },
    });
    expect(resultsRes.status).toBe(200);
    const results = await resultsRes.json<{
      entries: readonly {
        nickname: string;
        correctCount: number;
        answers: readonly { questionId: string; isCorrect: boolean; elapsedMs: number }[];
      }[];
    }>();
    const nicknames = results.entries.map((e) => e.nickname).sort();
    expect(nicknames).toEqual(["alice", "bob"]);

    const aliceEntry = results.entries.find((e) => e.nickname === "alice")!;
    expect(aliceEntry.correctCount).toBe(1);
    expect(aliceEntry.answers).toEqual([{ questionId: q1.id, isCorrect: true, elapsedMs: expect.any(Number) }]);

    const bobEntry = results.entries.find((e) => e.nickname === "bob")!;
    expect(bobEntry.correctCount).toBe(1);
    expect(bobEntry.answers).toEqual([{ questionId: q2.id, isCorrect: true, elapsedMs: expect.any(Number) }]);

    // 12. 参加者のリロード相当: 同じ参加者トークンで再接続すると、送信済みの回答を保持したまま最新状態が復元される
    const { ws: aliceReconnected, snapshot: aliceReconnectSnapshot } = await connectPublic(
      `https://example.com/connect?eventId=${event.id}&role=participant&token=${alice.token}`,
    );
    expect(aliceReconnectSnapshot.payload.phase).toEqual({ kind: "finalRanking" });
    expect(aliceReconnectSnapshot.payload.self.answeredQuestionIds).toEqual([q1.id]);
    aliceReconnected.close();
  });
});
