import { describe, it, expect, beforeEach } from "vitest";
import { env, SELF } from "cloudflare:test";
import { createHostCookie } from "../../../test/auth-helpers";

// 検証(Issue #36, タスク8.1): 選択肢画像付きの設問を保存し、開催→出題→回答→正解発表→結果確定まで、
// 公開のHTTP + WebSocket APIだけで通す。画像参照が出題ペイロードに現れること、画像の有無で採点・フェーズ遷移・
// ランキングが変わらないこと、画像のない従来の設問が同じイベントで従来どおり動くことを確認する。

beforeEach(async () => {
  await env.DB.exec(
    "DELETE FROM result_answer; DELETE FROM result_entry; DELETE FROM result; DELETE FROM theme; DELETE FROM option; DELETE FROM question; DELETE FROM event; DELETE FROM session; DELETE FROM user;",
  );
});

interface CreatedQuestion {
  readonly id: string;
  readonly options: readonly { readonly id: string; readonly label: string; readonly isCorrect: boolean; readonly imageAssetId: string | null }[];
}

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

describe("choice images through the public HTTP + WebSocket API (Issue #36)", () => {
  it("carries option images from saving to the stage, and scores and ranks exactly as for a text-only question", async () => {
    const cookie = await createHostCookie(env, "owner-1");
    const createRes = await SELF.fetch("https://example.com/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ title: "Picture Quiz" }),
    });
    const event = await createRes.json<{ id: string }>();

    async function uploadImage(): Promise<string> {
      const form = new FormData();
      form.set("file", new File([new Uint8Array(512)], "option.jpg", { type: "image/jpeg" }));
      const res = await SELF.fetch(`https://example.com/api/events/${event.id}/media`, { method: "POST", headers: { Cookie: cookie }, body: form });
      expect(res.status).toBe(201);
      return (await res.json<{ assetId: string }>()).assetId;
    }
    async function addQuestion(payload: unknown): Promise<CreatedQuestion> {
      const res = await SELF.fetch(`https://example.com/api/events/${event.id}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(201);
      return res.json<CreatedQuestion>();
    }

    // 4択すべてに画像、設問画像も併用した設問と、画像のない従来の2択設問
    const questionImage = await uploadImage();
    const optionImages = [await uploadImage(), await uploadImage(), await uploadImage(), await uploadImage()];
    const labels = ["りんご", "みかん", "ぶどう", "もも"];
    const imageQuestion = await addQuestion({
      body: "これはどれ？",
      imageAssetId: questionImage,
      timeLimitSec: 30,
      options: labels.map((label, i) => ({ label, isCorrect: i === 2, imageAssetId: optionImages[i] })),
    });
    const textQuestion = await addQuestion({
      body: "2+2?",
      timeLimitSec: 30,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    });
    expect(imageQuestion.options.map((o) => o.imageAssetId)).toEqual(optionImages);
    expect(textQuestion.options.map((o) => o.imageAssetId)).toEqual([null, null]);

    const published = await (
      await SELF.fetch(`https://example.com/api/events/${event.id}/publish`, { method: "POST", headers: { Cookie: cookie } })
    ).json<{ joinCode: string; stageToken: string }>();
    const alice = await (
      await SELF.fetch(`https://example.com/api/join/${published.joinCode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: "alice" }),
      })
    ).json<{ token: string }>();

    const { ws: hostWs } = await connectPublic(`https://example.com/connect?eventId=${event.id}&role=host`, { Cookie: cookie });
    const { ws: stageWs } = await connectPublic(`https://example.com/connect?eventId=${event.id}&role=stage&token=${published.stageToken}`);
    const { ws: aliceWs } = await connectPublic(`https://example.com/connect?eventId=${event.id}&role=participant&token=${alice.token}`);

    const ready = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "startSession" }));
    for (const msg of await ready) expect(msg.payload.phase).toEqual({ kind: "ready", nextQuestionId: imageQuestion.id });

    // 画像付き設問の出題: 投影・参加者へ届く設問に選択肢の画像参照が含まれ、正解は含まれない
    const opened = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "openQuestion" }));
    const [, stageOpened] = await opened;
    expect(stageOpened.type).toBe("questionOpened");
    expect(stageOpened.payload.question.imageAssetId).toBe(questionImage);
    expect(stageOpened.payload.question.options.map((o: any) => [o.label, o.imageAssetId])).toEqual(labels.map((l, i) => [l, optionImages[i]]));
    expect(JSON.stringify(stageOpened.payload.question)).not.toContain("isCorrect");
    await nextMessage(hostWs); // progressUpdated

    // 投影トークンで、出題された選択肢画像をすべて取得できる
    for (const assetId of optionImages) {
      const res = await SELF.fetch(`https://example.com/api/events/${event.id}/media/${assetId}?token=${published.stageToken}`);
      expect(res.status).toBe(200);
      await res.arrayBuffer();
    }

    // 回答 → 締切 → 正解発表: 画像の有無に関係なく、正解の選択肢IDで判定される
    const correctId = imageQuestion.options[2]!.id;
    const hostProgress = nextMessage(hostWs);
    const accepted = nextMessage(aliceWs);
    aliceWs.send(JSON.stringify({ type: "submitAnswer", questionId: imageQuestion.id, optionId: correctId }));
    expect((await accepted).type).toBe("answerAccepted");
    await hostProgress; // 投影への progressUpdated も同時に配信済みになる

    const closed = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "closeQuestion" }));
    await closed;
    const stageReveal = nextMessage(stageWs);
    const aliceReveal = nextMessage(aliceWs);
    hostWs.send(JSON.stringify({ type: "revealAnswer" }));
    expect((await stageReveal).payload.correctOptionId).toBe(correctId);
    expect((await aliceReveal).payload.personalResult).toEqual({ isCorrect: true, correctCount: 1, rank: 1 });

    // 続く画像のない従来の設問は、同じイベントで従来どおり出題され、選択肢の画像参照はnullになる
    const next = nextMessage(hostWs);
    hostWs.send(JSON.stringify({ type: "nextQuestion" }));
    expect((await next).payload.phase).toEqual({ kind: "ready", nextQuestionId: textQuestion.id });
    const textOpened = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "openQuestion" }));
    const [, stageTextOpened] = await textOpened;
    expect(stageTextOpened.payload.question.options.map((o: any) => o.imageAssetId)).toEqual([null, null]);
    await nextMessage(hostWs); // progressUpdated

    const textCorrectId = textQuestion.options.find((o) => o.label === "4")!.id;
    const textHostProgress = nextMessage(hostWs);
    const textAccepted = nextMessage(aliceWs);
    aliceWs.send(JSON.stringify({ type: "submitAnswer", questionId: textQuestion.id, optionId: textCorrectId }));
    expect((await textAccepted).type).toBe("answerAccepted");
    await textHostProgress;
    const closedText = Promise.all([nextMessage(hostWs), nextMessage(stageWs), nextMessage(aliceWs)]);
    hostWs.send(JSON.stringify({ type: "closeQuestion" }));
    await closedText;
    const textReveal = nextMessage(aliceWs);
    hostWs.send(JSON.stringify({ type: "revealAnswer" }));
    expect((await textReveal).payload.personalResult).toEqual({ isCorrect: true, correctCount: 2, rank: 1 });

    const finalRanking = nextMessage(stageWs);
    hostWs.send(JSON.stringify({ type: "finalize" }));
    expect((await finalRanking).payload.isFinal).toBe(true);
    hostWs.close();
    stageWs.close();
    aliceWs.close();

    // 結果: 2問とも正解として記録される(画像付き設問が結果の集計から欠けない)
    const results = await (await SELF.fetch(`https://example.com/api/events/${event.id}/results`, { headers: { Cookie: cookie } })).json<{
      entries: readonly { nickname: string; correctCount: number; answers: readonly { questionId: string; isCorrect: boolean }[] }[];
    }>();
    expect(results.entries).toHaveLength(1);
    expect(results.entries[0]!.correctCount).toBe(2);
    expect(Object.fromEntries(results.entries[0]!.answers.map((a) => [a.questionId, a.isCorrect]))).toEqual({
      [imageQuestion.id]: true,
      [textQuestion.id]: true,
    });
  });
});
