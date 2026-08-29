import { describe, it, expect } from "vitest";
import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import type { EventId, EventMeta, EventStatus, ParticipantId } from "../../shared/domain-types";
import { createParticipantTokenService } from "./participant-token";
import { createLiveStore } from "./live-store";
import { upsertQuestion } from "../catalog/repository";
import { getSessionStub } from "./quiz-session-do";
import type { QuizSessionDO } from "./quiz-session-do";
import { createHostCookie } from "../../../test/auth-helpers";
import { createInvite, acceptInvite, revokeCollaborator, listCollaborators } from "../collaborators/repository";
import { PRACTICE_QUESTION, PRACTICE_QUESTION_ID } from "../../shared/practice-question";

const meta: EventMeta = {
  capacity: 2,
  status: "live",
  theme: {
    primaryColor: "#111111",
    accentColor: "#222222",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    logoAssetId: null,
    backgroundAssetId: null,
    templateId: null,
  },
  practiceMode: false,
};

function newStub(): DurableObjectStub<QuizSessionDO> {
  const id = env.QUIZ_SESSION.newUniqueId();
  return env.QUIZ_SESSION.get(id);
}

async function seedEvent(
  eventId: string,
  opts: { ownerId?: string; stageToken?: string; status?: EventStatus } = {},
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO event (id, owner_id, title, subtitle, status, stage_token, created_at) VALUES (?, ?, 'T', '', ?, ?, 1)",
  )
    .bind(eventId, opts.ownerId ?? "owner-1", opts.status ?? "live", opts.stageToken ?? null)
    .run();
}

async function seedQuestion(
  eventId: string,
  id: string,
  orderIndex: number,
  opts: { timeLimitSec?: number; correctOptionId?: string; explanation?: string } = {},
): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO question (id, event_id, order_index, body, time_limit_sec, explanation) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, eventId, orderIndex, `body-${id}`, opts.timeLimitSec ?? 30, opts.explanation ?? `explanation-${id}`)
    .run();

  const correctId = opts.correctOptionId ?? `${id}-a`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES (?, ?, 'A', ?, 0)").bind(
      `${id}-a`,
      id,
      correctId === `${id}-a` ? 1 : 0,
    ),
    env.DB.prepare("INSERT INTO option (id, question_id, label, is_correct, order_index) VALUES (?, ?, 'B', ?, 1)").bind(
      `${id}-b`,
      id,
      correctId === `${id}-b` ? 1 : 0,
    ),
  ]);
}

async function publish(stub: DurableObjectStub<QuizSessionDO>, eventMeta: EventMeta): Promise<void> {
  const res = await stub.fetch("https://do/internal/publish", { method: "POST", body: JSON.stringify(eventMeta) });
  await res.text();
  expect(res.status).toBe(204);
}

/** WebSocket アップグレード以外の応答本文は、isolated storage のクリーンアップのため必ず読み切る */
async function connectExpecting(
  stub: DurableObjectStub<QuizSessionDO>,
  params: Record<string, string>,
  status: number,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const url = new URL("https://do/connect");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await stub.fetch(url.toString(), { headers: { Upgrade: "websocket", ...extraHeaders } });
  if (!res.webSocket) await res.text();
  expect(res.status).toBe(status);
  return res;
}

async function connectReal(
  stub: DurableObjectStub<QuizSessionDO>,
  params: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<WebSocket> {
  const url = new URL("https://do/connect");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await stub.fetch(url.toString(), { headers: { Upgrade: "websocket", ...extraHeaders } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  return ws;
}

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(JSON.parse(event.data as string)), { once: true });
  });
}

/** connectReal に加えて、接続直後に届く stateSnapshot を読み捨てる（7.8 のスナップショット自体を検証するテスト以外で使う） */
async function connectAndDrain(
  stub: DurableObjectStub<QuizSessionDO>,
  params: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Promise<WebSocket> {
  const ws = await connectReal(stub, params, extraHeaders);
  await nextMessage(ws);
  return ws;
}

async function sendAndAwait(ws: WebSocket, command: unknown): Promise<any> {
  const received = nextMessage(ws);
  ws.send(JSON.stringify(command));
  return received;
}

function fakeWebSocket(attachment: unknown): { ws: WebSocket; sent: string[] } {
  const sent: string[] = [];
  const ws = {
    deserializeAttachment: () => attachment,
    send: (message: string) => sent.push(message),
    close: () => {},
  } as unknown as WebSocket;
  return { ws, sent };
}

async function sendHostCommand(
  stub: DurableObjectStub<QuizSessionDO>,
  eventId: string,
  command: unknown,
): Promise<{ readonly rejected: readonly unknown[] }> {
  const { ws, sent } = fakeWebSocket({ role: "host", eventId });
  await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify(command)));
  return { rejected: sent.map((m) => JSON.parse(m)) };
}

/** イベントに受諾済みの共同運営者を1名作成し、そのCookieを返す */
async function addAcceptedCollaborator(eventId: string, collaboratorId = "collaborator-1"): Promise<{ readonly cookie: string }> {
  await createHostCookie(env, "owner-1"); // 招待発行元(owner_id)のuser行を用意する
  const invite = await createInvite(env, eventId as EventId, `${collaboratorId}@example.com`);
  if (!invite.ok) throw new Error(`setup failed: ${JSON.stringify(invite.error)}`);

  const cookie = await createHostCookie(env, collaboratorId);
  const accepted = await acceptInvite(env, invite.value.inviteToken, collaboratorId, `${collaboratorId}@example.com`);
  if (!accepted.ok) throw new Error(`setup failed: ${JSON.stringify(accepted.error)}`);

  return { cookie };
}

async function loadState(stub: DurableObjectStub<QuizSessionDO>) {
  return runInDurableObject(stub, (_instance, state) => createLiveStore(state.storage.sql).load());
}

async function setPracticeMode(eventId: string, enabled: boolean): Promise<void> {
  await env.DB.prepare("UPDATE event SET practice_mode_enabled = ? WHERE id = ?").bind(enabled ? 1 : 0, eventId).run();
}

async function joinParticipant(
  stub: DurableObjectStub<QuizSessionDO>,
  eventId: string,
  nickname: string,
): Promise<{ readonly participantId: string; readonly token: string }> {
  const res = await stub.fetch("https://do/internal/join", { method: "POST", body: JSON.stringify({ nickname }) });
  const result = await res.json<{ ok: boolean; value?: { id: string }; error?: unknown }>();
  if (!result.ok || !result.value) throw new Error(`join failed: ${JSON.stringify(result)}`);
  const participantId = result.value.id;
  const token = await createParticipantTokenService(env).issue({
    eventId: eventId as EventId,
    participantId: participantId as ParticipantId,
    issuedAt: Date.now(),
  });
  return { participantId, token };
}

describe("QuizSessionDO connect", () => {
  it("rejects a non-websocket request to /connect as 426", async () => {
    const stub = newStub();
    const res = await stub.fetch("https://do/connect?eventId=event-1&role=host");
    await res.text();
    expect(res.status).toBe(426);
  });

  it("rejects a connect request missing eventId or role as 400", async () => {
    const stub = newStub();
    await connectExpecting(stub, {}, 400);
  });

  it("rejects a host connection without an authenticated session as 401", async () => {
    const stub = newStub();
    await connectExpecting(stub, { eventId: "event-1", role: "host" }, 401);
  });

  it("accepts a host connection from an accepted collaborator, and rejects it once revoked", async () => {
    const stub = newStub();
    await seedEvent("event-1", { ownerId: "owner-1" });
    await publish(stub, meta);
    const { cookie } = await addAcceptedCollaborator("event-1");

    await connectExpecting(stub, { eventId: "event-1", role: "host" }, 101, { Cookie: cookie });

    const [entry] = await listCollaborators(env, "event-1" as EventId);
    const revoked = await revokeCollaborator(env, "event-1" as EventId, entry!.id);
    expect(revoked.ok).toBe(true);

    await connectExpecting(stub, { eventId: "event-1", role: "host" }, 401, { Cookie: cookie });
  });

  it("rejects a stage connection with the wrong token as 401", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "correct-token" });
    await connectExpecting(stub, { eventId: "event-1", role: "stage", token: "wrong-token" }, 401);
  });

  it("rejects a participant connection with an invalid token as 401", async () => {
    const stub = newStub();
    await connectExpecting(stub, { eventId: "event-1", role: "participant", token: "garbage" }, 401);
  });

  it("accepts a stage connection with the correct token, keyed off the D1 stage_token", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "correct-token" });
    await publish(stub, meta);

    await connectExpecting(stub, { eventId: "event-1", role: "stage", token: "correct-token" }, 101);
  });

  it("accepts a participant connection with a valid token", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const token = await createParticipantTokenService(env).issue({
      eventId: "event-1" as EventId,
      participantId: "participant-1" as ParticipantId,
      issuedAt: Date.now(),
    });

    await connectExpecting(stub, { eventId: "event-1", role: "participant", token }, 101);
  });
});

describe("QuizSessionDO webSocketMessage role gating", () => {
  it("rejects a host command (openQuestion) received on a stage connection", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "stage" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify({ type: "openQuestion" })));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a host command (startSession) received on a participant connection", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "participant", participantId: "p1" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, JSON.stringify({ type: "startSession" })));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "FORBIDDEN", message: expect.any(String) },
    });
  });

  it("rejects a malformed message as INVALID_COMMAND", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const { ws, sent } = fakeWebSocket({ role: "host", eventId: "event-1" });

    await runInDurableObject(stub, (instance) => instance.webSocketMessage(ws, "not json"));

    expect(JSON.parse(sent[0]!)).toEqual({
      type: "commandRejected",
      payload: { code: "INVALID_COMMAND", message: expect.any(String) },
    });
  });
});

describe("QuizSessionDO publish", () => {
  it("initializes the event meta and the lobby phase in the live store", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const loaded = await loadState(stub);
    expect(loaded).toEqual({ phase: { kind: "lobby" }, eventMeta: meta, questions: null, startedAt: null, finalRevealStep: null });
  });
});

describe("QuizSessionDO join", () => {
  async function join(
    stub: DurableObjectStub<QuizSessionDO>,
    nickname: string,
  ): Promise<{ ok: boolean; value?: unknown; error?: { code: string } }> {
    const res = await stub.fetch("https://do/internal/join", { method: "POST", body: JSON.stringify({ nickname }) });
    return res.json();
  }

  it("registers a participant and rejects a duplicate nickname", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const first = await join(stub, "alice");
    const second = await join(stub, "alice");

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: { code: "NICKNAME_TAKEN" } });
  });

  it("rejects a join once capacity is reached", async () => {
    const stub = newStub();
    await publish(stub, { ...meta, capacity: 1 });

    const first = await join(stub, "alice");
    const second = await join(stub, "bob");

    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, error: { code: "CAPACITY_REACHED" } });
  });

  it("rejects a join once the event has finished", async () => {
    const stub = newStub();
    await publish(stub, { ...meta, status: "finished" });

    const result = await join(stub, "alice");
    expect(result).toEqual({ ok: false, error: { code: "EVENT_FINISHED" } });
  });

  it("registers only one participant when the same nickname joins concurrently", async () => {
    const stub = newStub();
    await publish(stub, meta);

    const results = await Promise.all([join(stub, "alice"), join(stub, "alice")]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("broadcasts participantJoined with the running count to host and stage connections", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "tok" });
    await publish(stub, meta);
    const hostCookie = await createHostCookie(env, "owner-1");

    const hostWs = await connectAndDrain(stub, { eventId: "event-1", role: "host" }, { Cookie: hostCookie });
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });

    const hostMsg1 = nextMessage(hostWs);
    const stageMsg1 = nextMessage(stageWs);
    await join(stub, "alice");
    expect(await hostMsg1).toEqual({ type: "participantJoined", payload: { participantCount: 1, nickname: "alice" } });
    expect(await stageMsg1).toEqual({ type: "participantJoined", payload: { participantCount: 1, nickname: "alice" } });

    const hostMsg2 = nextMessage(hostWs);
    await join(stub, "bob");
    expect(await hostMsg2).toEqual({ type: "participantJoined", payload: { participantCount: 2, nickname: "bob" } });

    hostWs.close();
    stageWs.close();
  });

  it("does not broadcast participantJoined when the join is rejected", async () => {
    const stub = newStub();
    await seedEvent("event-1", { stageToken: "tok" });
    await publish(stub, meta);
    const hostCookie = await createHostCookie(env, "owner-1");
    const hostWs = await connectAndDrain(stub, { eventId: "event-1", role: "host" }, { Cookie: hostCookie });

    const aliceMsg = nextMessage(hostWs);
    await join(stub, "alice");
    await aliceMsg; // alice の参加通知を読み捨てる

    const rejected = await join(stub, "alice"); // 同名での2回目は拒否される
    expect(rejected).toEqual({ ok: false, error: { code: "NICKNAME_TAKEN" } });

    // 拒否された join でメッセージが送られていれば、次に届くのはそれになってしまうはず。
    // bob の参加通知だけが届くことで、拒否時に余分な broadcast がなかったことを確認する
    const nextMsg = nextMessage(hostWs);
    await join(stub, "bob");
    expect(await nextMsg).toEqual({ type: "participantJoined", payload: { participantCount: 2, nickname: "bob" } });

    hostWs.close();
  });
});

describe("getSessionStub", () => {
  it("resolves the same DO instance for the same eventId, honoring an optional location hint", async () => {
    const stubA = getSessionStub(env, "event-x" as EventId, "wnam");
    await publish(stubA, meta);

    const stubB = getSessionStub(env, "event-x" as EventId);
    const loaded = await runInDurableObject(stubB, (_instance, state) => createLiveStore(state.storage.sql).load());

    expect(loaded?.eventMeta).toEqual(meta);
  });
});

describe("QuizSessionDO startSession", () => {
  it("freezes the question snapshot, moves to ready, and updates event.status to live", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    await seedQuestion("event-1", "q2", 1);
    const stub = newStub();
    await publish(stub, meta);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "startSession" });
    expect(rejected).toEqual([]);

    const row = await env.DB.prepare("SELECT status FROM event WHERE id = ?").bind("event-1").first<{ status: string }>();
    expect(row?.status).toBe("live");

    const loaded = await loadState(stub);
    expect(loaded?.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });
    expect(loaded?.questions).toHaveLength(2);
  });

  it("rejects question edits with EVENT_LIVE once startSession has run", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const editResult = await upsertQuestion(env, "event-1" as EventId, "owner-1", {
      body: "edited",
      timeLimitSec: 30,
      options: [
        { label: "x", isCorrect: true },
        { label: "y", isCorrect: false },
      ],
    });
    expect(editResult).toEqual({ ok: false, error: { code: "EVENT_LIVE" } });
  });

  it("rejects a second startSession from ready as INVALID_PHASE", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "startSession" });
    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "INVALID_PHASE", message: expect.any(String) } }]);
  });
});

describe("QuizSessionDO openQuestion / closeQuestion / alarm / pause / resume", () => {
  async function setupOpenQuestion(stub: DurableObjectStub<QuizSessionDO>, timeLimitSec = 5) {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec });
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
  }

  it("sets an alarm and broadcasts questionOpened to a stage connection; the alarm auto-closes the question", async () => {
    const stub = newStub();
    await setupOpenQuestion(stub);
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const opened = nextMessage(stageWs);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    expect(rejected).toEqual([]);

    const openedEvent = await opened;
    expect(openedEvent.type).toBe("questionOpened");
    expect(openedEvent.payload.question.id).toBe("q1");
    expect(typeof openedEvent.payload.deadlineAt).toBe("number");

    expect((await loadState(stub))?.phase.kind).toBe("questionOpen");

    const alarmRan = await runDurableObjectAlarm(stub);
    expect(alarmRan).toBe(true);

    const after = await loadState(stub);
    expect(after?.phase).toEqual({ kind: "questionClosed", questionId: "q1", openedAt: expect.any(Number) });

    stageWs.close();
  });

  it("performs the same close transition for a manual closeQuestion as for the alarm", async () => {
    const stub = newStub();
    await setupOpenQuestion(stub);
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    expect(rejected).toEqual([]);

    const after = await loadState(stub);
    expect(after?.phase).toEqual({ kind: "questionClosed", questionId: "q1", openedAt: expect.any(Number) });

    const alarmRan = await runDurableObjectAlarm(stub);
    expect(alarmRan).toBe(false);
  });

  it("clears the alarm on pause so the original deadline never auto-closes, and resume re-arms it", async () => {
    const stub = newStub();
    await setupOpenQuestion(stub, 5);
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    await sendHostCommand(stub, "event-1", { type: "pause" });
    expect((await loadState(stub))?.phase.kind).toBe("paused");
    expect(await runDurableObjectAlarm(stub)).toBe(false);

    await sendHostCommand(stub, "event-1", { type: "resume" });
    expect((await loadState(stub))?.phase.kind).toBe("questionOpen");
    expect(await runDurableObjectAlarm(stub)).toBe(true);
  });
});

describe("QuizSessionDO reopenQuestion", () => {
  it("reopens a closed question, keeps the existing answer's elapsedMs unchanged, and accepts new answers", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 5 });
    const stub = newStub();
    await publish(stub, { ...meta, capacity: 5 });
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });

    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    const beforeReopen = await runInDurableObject(stub, (_i, state) => createLiveStore(state.storage.sql).listAllAnswers());
    const aliceBefore = beforeReopen.find((a) => a.participantId === alice.participantId)!;

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "reopenQuestion" });
    expect(rejected).toEqual([]);
    expect((await loadState(stub))?.phase.kind).toBe("questionOpen");

    const bob = await joinParticipant(stub, "event-1", "bob");
    const bobWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: bob.token });
    await sendAndAwait(bobWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-b" });

    const afterReopen = await runInDurableObject(stub, (_i, state) => createLiveStore(state.storage.sql).listAllAnswers());
    const aliceAfter = afterReopen.find((a) => a.participantId === alice.participantId)!;
    expect(aliceAfter.elapsedMs).toBe(aliceBefore.elapsedMs);
    expect(afterReopen).toHaveLength(2);

    aliceWs.close();
    bobWs.close();
  });

  it("rejects reopenQuestion once the question has already been revealed", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 5 });
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "reopenQuestion" });
    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "ALREADY_REVEALED", message: expect.any(String) } }]);
  });
});

describe("QuizSessionDO submitAnswer", () => {
  async function setupOpenWithAlice(stub: DurableObjectStub<QuizSessionDO>) {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 30 });
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });
    return { alice, aliceWs };
  }

  it("accepts the first answer and rejects a duplicate, keeping the first choice", async () => {
    const stub = newStub();
    const { aliceWs } = await setupOpenWithAlice(stub);

    const first = await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });
    expect(first).toEqual({ type: "answerAccepted", payload: { questionId: "q1", selectedOptionId: "q1-a" } });

    const second = await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-b" });
    expect(second).toEqual({ type: "commandRejected", payload: { code: "ALREADY_ANSWERED", message: expect.any(String) } });

    const answers = await runInDurableObject(stub, (_i, state) => createLiveStore(state.storage.sql).listAllAnswers());
    expect(answers).toHaveLength(1);
    expect(answers[0]?.selectedOptionId).toBe("q1-a");

    aliceWs.close();
  });

  it("rejects a submission once the answer window has closed", async () => {
    const stub = newStub();
    const { aliceWs } = await setupOpenWithAlice(stub);
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });

    const rejected = await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });
    expect(rejected).toEqual({
      type: "commandRejected",
      payload: { code: "ANSWER_WINDOW_CLOSED", message: expect.any(String) },
    });

    aliceWs.close();
  });

  it("broadcasts progress to a stage connection as a participant answers", async () => {
    const stub = newStub();
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 30 });
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });

    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });

    const progress = nextMessage(stageWs);
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });

    expect(await progress).toEqual({ type: "progressUpdated", payload: { answeredCount: 1, totalCount: 1 } });

    stageWs.close();
    aliceWs.close();
  });
});

describe("QuizSessionDO revealAnswer", () => {
  it("grades answers and broadcasts questionClosed: distribution/explanation to stage without per-participant detail, personalResult to the participant", async () => {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 30, correctOptionId: "q1-a" });
    const stub = newStub();
    await publish(stub, { ...meta, capacity: 5 });
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });

    const bob = await joinParticipant(stub, "event-1", "bob");
    const bobWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: bob.token });
    await sendAndAwait(bobWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-b" });

    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const stageMsg = nextMessage(stageWs);
    const aliceMsg = nextMessage(aliceWs);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    expect(rejected).toEqual([]);

    const stageEvent = await stageMsg;
    expect(stageEvent.type).toBe("questionClosed");
    expect(stageEvent.payload.correctOptionId).toBe("q1-a");
    expect(stageEvent.payload.explanation).toBe("explanation-q1");
    expect(stageEvent.payload.personalResult).toBeNull();
    expect(stageEvent.payload.distribution).toEqual(
      expect.arrayContaining([
        { optionId: "q1-a", count: 1 },
        { optionId: "q1-b", count: 1 },
      ]),
    );
    expect(JSON.stringify(stageEvent)).not.toContain("alice");
    expect(JSON.stringify(stageEvent)).not.toContain("bob");

    const aliceEvent = await aliceMsg;
    expect(aliceEvent.type).toBe("questionClosed");
    expect(aliceEvent.payload.personalResult).toEqual({ isCorrect: true, correctCount: 1, rank: expect.any(Number) });

    stageWs.close();
    aliceWs.close();
    bobWs.close();
  });
});

describe("QuizSessionDO showRanking / finalize", () => {
  async function setupRevealed(stub: DurableObjectStub<QuizSessionDO>) {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 30, correctOptionId: "q1-a" });
    await publish(stub, { ...meta, capacity: 5 });
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });

    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    return { aliceWs };
  }

  it("broadcasts an interim ranking to a stage connection on showRanking", async () => {
    const stub = newStub();
    const { aliceWs } = await setupRevealed(stub);
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });

    const ranking = nextMessage(stageWs);
    const { rejected } = await sendHostCommand(stub, "event-1", { type: "showRanking" });
    expect(rejected).toEqual([]);

    const event = await ranking;
    expect(event.type).toBe("rankingUpdated");
    expect(event.payload.entries[0]).toMatchObject({ nickname: "alice", rank: 1, correctCount: 1 });
    expect(event.payload.isFinal).toBe(false);

    stageWs.close();
    aliceWs.close();
  });

  it("marks the ranking broadcast from finalize as isFinal, unlike showRanking", async () => {
    const stub = newStub();
    const { aliceWs } = await setupRevealed(stub);
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });

    const ranking = nextMessage(stageWs);
    const { rejected } = await sendHostCommand(stub, "event-1", { type: "finalize" });
    expect(rejected).toEqual([]);

    const event = await ranking;
    expect(event.type).toBe("rankingUpdated");
    expect(event.payload.isFinal).toBe(true);

    stageWs.close();
    aliceWs.close();
  });

  it("sends the participant a personalRank with isFinal matching showRanking vs finalize", async () => {
    const stub = newStub();
    const { aliceWs } = await setupRevealed(stub);

    const interim = nextMessage(aliceWs);
    await sendHostCommand(stub, "event-1", { type: "showRanking" });
    const interimEvent = await interim;
    expect(interimEvent.type).toBe("personalRank");
    expect(interimEvent.payload).toMatchObject({ rank: 1, correctCount: 1, isFinal: false });

    const final = nextMessage(aliceWs);
    await sendHostCommand(stub, "event-1", { type: "finalize" });
    const finalEvent = await final;
    expect(finalEvent.type).toBe("personalRank");
    expect(finalEvent.payload).toMatchObject({ rank: 1, correctCount: 1, isFinal: true });

    aliceWs.close();
  });

  it("rejects nextQuestion with NO_NEXT_QUESTION after the only question has been revealed", async () => {
    const stub = newStub();
    const { aliceWs } = await setupRevealed(stub);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "nextQuestion" });
    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "NO_NEXT_QUESTION", message: expect.any(String) } }]);

    aliceWs.close();
  });

  it("finalizes: saves the result and updates event.status to finished", async () => {
    const stub = newStub();
    const { aliceWs } = await setupRevealed(stub);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "finalize" });
    expect(rejected).toEqual([]);

    const row = await env.DB.prepare("SELECT status FROM event WHERE id = ?").bind("event-1").first<{ status: string }>();
    expect(row?.status).toBe("finished");

    const resultRow = await env.DB.prepare("SELECT id FROM result WHERE event_id = ?").bind("event-1").first();
    expect(resultRow).not.toBeNull();

    const entryRow = await env.DB.prepare(
      "SELECT nickname, rank, correct_count FROM result_entry WHERE result_id = ?",
    )
      .bind((resultRow as { id: string }).id)
      .first();
    expect(entryRow).toEqual({ nickname: "alice", rank: 1, correct_count: 1 });

    aliceWs.close();
  });
});

describe("QuizSessionDO advanceFinalReveal（要件15.1〜15.3, 15.8, Issue #16フォローアップ）", () => {
  /** N人の参加者を全員同じ設問に正解させ、正解発表まで進める(finalizeは呼び出し側で行う)。
   * 同一正解数・同一回答時間のため、参加登録順(joinedSeq)昇順が順位に直結する:
   * 最初に参加した人が1位、最後の人が最下位になる */
  async function setupRevealedWithParticipants(stub: DurableObjectStub<QuizSessionDO>, count: number) {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { timeLimitSec: 30, correctOptionId: "q1-a" });
    await publish(stub, { ...meta, capacity: count + 1 });
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });

    const sockets: WebSocket[] = [];
    for (let i = 0; i < count; i++) {
      const participant = await joinParticipant(stub, "event-1", `player${i + 1}`);
      const ws = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: participant.token });
      await sendAndAwait(ws, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });
      sockets.push(ws);
    }

    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    return { sockets };
  }

  it("shows only the lowest batch immediately upon finalize, for a 7-participant event (2 rest + top5)", async () => {
    const stub = newStub();
    const { sockets } = await setupRevealedWithParticipants(stub, 7);
    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });

    const message = nextMessage(stageWs);
    await sendHostCommand(stub, "event-1", { type: "finalize" });
    const event = await message;

    expect(event.type).toBe("rankingUpdated");
    expect(event.payload.isFinal).toBe(true);
    expect(event.payload.revealStep).toBe(0);
    // entriesは常に全員分を送る(どのグループを表示するかはrevealStepからクライアント側で計算する)
    expect(event.payload.entries.map((e: { rank: number }) => e.rank).sort((a: number, b: number) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);

    const loaded = await loadState(stub);
    expect(loaded?.finalRevealStep).toBe(0);

    stageWs.close();
    sockets.forEach((ws) => ws.close());
  });

  it("advances to the next (final, top-5) batch on advanceFinalReveal", async () => {
    const stub = newStub();
    const { sockets } = await setupRevealedWithParticipants(stub, 7);
    await sendHostCommand(stub, "event-1", { type: "finalize" });

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const message = nextMessage(stageWs);
    const { rejected } = await sendHostCommand(stub, "event-1", { type: "advanceFinalReveal" });
    expect(rejected).toEqual([]);

    const event = await message;
    expect(event.type).toBe("rankingUpdated");
    expect(event.payload.revealStep).toBe(1);

    const loaded = await loadState(stub);
    expect(loaded?.finalRevealStep).toBe(1);

    stageWs.close();
    sockets.forEach((ws) => ws.close());
  });

  it("rejects advanceFinalReveal once the top-5 (final) batch has already been reached", async () => {
    const stub = newStub();
    const { sockets } = await setupRevealedWithParticipants(stub, 7);
    await sendHostCommand(stub, "event-1", { type: "finalize" });

    await sendHostCommand(stub, "event-1", { type: "advanceFinalReveal" }); // step 0 -> 1 (top5, final)
    const { rejected } = await sendHostCommand(stub, "event-1", { type: "advanceFinalReveal" }); // 1 -> rejected

    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "NO_NEXT_REVEAL_STEP", message: expect.any(String) } }]);

    sockets.forEach((ws) => ws.close());
  });

  it("rejects advanceFinalReveal when the phase is not finalRanking", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "advanceFinalReveal" });
    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "INVALID_PHASE", message: expect.any(String) } }]);
  });

  it("goes straight to the final (top-5-or-fewer) batch immediately when there are 5 or fewer participants", async () => {
    const stub = newStub();
    const { sockets } = await setupRevealedWithParticipants(stub, 3);
    await sendHostCommand(stub, "event-1", { type: "finalize" });

    const loaded = await loadState(stub);
    expect(loaded?.finalRevealStep).toBe(0);

    const { rejected } = await sendHostCommand(stub, "event-1", { type: "advanceFinalReveal" });
    expect(rejected).toEqual([{ type: "commandRejected", payload: { code: "NO_NEXT_REVEAL_STEP", message: expect.any(String) } }]);

    sockets.forEach((ws) => ws.close());
  });
});

describe("QuizSessionDO practice question mode（要件1.1, 1.3, 3.2, 3.3, 4.1-4.4）", () => {
  it("re-syncs practiceMode from D1 at startSession, reflecting a change made after publish（設計レビュー修正）", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    const stub = newStub();
    await publish(stub, meta); // meta.practiceMode は false（公開時点の値）
    await setPracticeMode("event-1", true); // 公開後・開催開始前にトグルを変更

    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const loaded = await loadState(stub);
    expect(loaded?.phase).toEqual({ kind: "ready", nextQuestionId: PRACTICE_QUESTION_ID });
  });

  it("delivers the practice question's own content and time limit when opened", async () => {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0);
    await setPracticeMode("event-1", true);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const opened = nextMessage(stageWs);
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    const event = await opened;

    expect(event.type).toBe("questionOpened");
    expect(event.payload.question.id).toBe(PRACTICE_QUESTION_ID);
    expect(event.payload.question.body).toBe(PRACTICE_QUESTION.body);
    expect(event.payload.question.options).toHaveLength(PRACTICE_QUESTION.options.length);
    expect(event.payload.deadlineAt - event.payload.serverNow).toBeLessThanOrEqual(PRACTICE_QUESTION.timeLimitSec * 1000);

    stageWs.close();
  });

  it("reveals the practice question's own correct answer", async () => {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0);
    await setPracticeMode("event-1", true);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const closed = nextMessage(stageWs);
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    const event = await closed;

    expect(event.type).toBe("questionClosed");
    expect(event.payload.questionId).toBe(PRACTICE_QUESTION_ID);
    expect(event.payload.correctOptionId).toBe(PRACTICE_QUESTION.correctOptionId);
    expect(event.payload.explanation).toBe(PRACTICE_QUESTION.explanation);

    stageWs.close();
  });

  it("advances from the revealed practice question to the real first question on nextQuestion（要件3.7）", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    await setPracticeMode("event-1", true);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });

    await sendHostCommand(stub, "event-1", { type: "nextQuestion" });

    const loaded = await loadState(stub);
    expect(loaded?.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });
  });

  it("excludes the practice question's answer from scoring, ranking, and the result archive end-to-end（要件4.1〜4.4）", async () => {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0, { correctOptionId: "q1-a" });
    await setPracticeMode("event-1", true);
    const stub = newStub();
    await publish(stub, { ...meta, capacity: 5 });
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    // テスト問題: aliceは正解(practice-option-b)を選ぶが、採点には一切反映されないはず
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: PRACTICE_QUESTION_ID, optionId: PRACTICE_QUESTION.correctOptionId });
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    await sendHostCommand(stub, "event-1", { type: "nextQuestion" });

    // 本編: aliceはq1に正解する
    await sendHostCommand(stub, "event-1", { type: "openQuestion" });
    await sendAndAwait(aliceWs, { type: "submitAnswer", questionId: "q1", optionId: "q1-a" });
    await sendHostCommand(stub, "event-1", { type: "closeQuestion" });

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const revealed = nextMessage(stageWs);
    await sendHostCommand(stub, "event-1", { type: "revealAnswer" });
    await revealed; // questionClosed をここで読み捨てる（rankingUpdated と取り違えないため）

    const ranking = nextMessage(stageWs);
    await sendHostCommand(stub, "event-1", { type: "finalize" });

    const rankingEvent = await ranking;
    expect(rankingEvent.type).toBe("rankingUpdated");
    expect(rankingEvent.payload.entries).toEqual([
      expect.objectContaining({ nickname: "alice", correctCount: 1, rank: 1 }),
    ]);

    const resultRow = await env.DB.prepare("SELECT id FROM result WHERE event_id = ?").bind("event-1").first<{ id: string }>();
    const entryRow = await env.DB.prepare("SELECT id, correct_count FROM result_entry WHERE result_id = ?")
      .bind(resultRow!.id)
      .first<{ id: string; correct_count: number }>();
    expect(entryRow?.correct_count).toBe(1);

    const { results: answerRows } = await env.DB.prepare("SELECT question_id FROM result_answer WHERE result_entry_id = ?")
      .bind(entryRow!.id)
      .all<{ question_id: string }>();
    expect(answerRows.map((r) => r.question_id)).toEqual(["q1"]);
    expect(answerRows.map((r) => r.question_id)).not.toContain(PRACTICE_QUESTION_ID);

    stageWs.close();
    aliceWs.close();
  });

  it("shows no practice-related host progression once the event reaches ready without practiceMode（要件3.8の前提: PhaseMachineに委譲）", async () => {
    await seedEvent("event-1", { status: "published" });
    await seedQuestion("event-1", "q1", 0);
    // practiceMode を有効化しない（既定false）
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const loaded = await loadState(stub);
    expect(loaded?.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });
  });
});

describe("QuizSessionDO theme update", () => {
  it("broadcasts themeUpdated to stage and participant connections without changing the phase", async () => {
    await seedEvent("event-1", { stageToken: "tok" });
    const stub = newStub();
    await publish(stub, meta);

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });

    const stageMsg = nextMessage(stageWs);
    const aliceMsg = nextMessage(aliceWs);

    const newTheme = { ...meta.theme, primaryColor: "#abcdef" };
    const res = await stub.fetch("https://do/internal/theme", { method: "POST", body: JSON.stringify(newTheme) });
    await res.text();
    expect(res.status).toBe(204);

    expect(await stageMsg).toEqual({ type: "themeUpdated", payload: newTheme });
    expect(await aliceMsg).toEqual({ type: "themeUpdated", payload: newTheme });

    const loaded = await loadState(stub);
    expect(loaded?.phase).toEqual({ kind: "lobby" });
    expect(loaded?.eventMeta.theme).toEqual(newTheme);

    stageWs.close();
    aliceWs.close();
  });

  it("broadcasts a changed design template id to stage and participant connections while live (要件4.6)", async () => {
    await seedEvent("event-1", { stageToken: "tok" });
    const stub = newStub();
    await publish(stub, meta);

    const stageWs = await connectAndDrain(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const alice = await joinParticipant(stub, "event-1", "alice");
    const aliceWs = await connectAndDrain(stub, { eventId: "event-1", role: "participant", token: alice.token });

    const stageMsg = nextMessage(stageWs);
    const aliceMsg = nextMessage(aliceWs);

    const templatedTheme = { ...meta.theme, templateId: "fancy-party" as const };
    const res = await stub.fetch("https://do/internal/theme", { method: "POST", body: JSON.stringify(templatedTheme) });
    await res.text();
    expect(res.status).toBe(204);

    expect(await stageMsg).toEqual({ type: "themeUpdated", payload: templatedTheme });
    expect(await aliceMsg).toEqual({ type: "themeUpdated", payload: templatedTheme });

    stageWs.close();
    aliceWs.close();
  });
});

describe("QuizSessionDO stateSnapshot on connect", () => {
  it("sends a full stateSnapshot immediately on connect, scoped to the caller's role", async () => {
    await seedEvent("event-1", { stageToken: "tok" });
    const stub = newStub();
    await publish(stub, meta);

    const stageWs = await connectReal(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const snapshot = await nextMessage(stageWs);

    expect(snapshot).toEqual({
      type: "stateSnapshot",
      payload: {
        eventId: "event-1",
        phase: { kind: "lobby" },
        theme: meta.theme,
        serverNow: expect.any(Number),
        self: { role: "stage" },
        participantCount: 0,
      },
    });

    stageWs.close();
  });

  it("scopes a participant's stateSnapshot to their own nickname and answered questions", async () => {
    const stub = newStub();
    await publish(stub, meta);
    const alice = await joinParticipant(stub, "event-1", "alice");

    const aliceWs = await connectReal(stub, { eventId: "event-1", role: "participant", token: alice.token });
    const snapshot = await nextMessage(aliceWs);

    expect(snapshot.payload.self).toEqual({
      role: "participant",
      participantId: alice.participantId,
      nickname: "alice",
      answeredQuestionIds: [],
    });

    aliceWs.close();
  });

  it("resends a full stateSnapshot on reconnect, reflecting current phase", async () => {
    await seedEvent("event-1", { status: "published", stageToken: "tok" });
    await seedQuestion("event-1", "q1", 0);
    const stub = newStub();
    await publish(stub, meta);
    await sendHostCommand(stub, "event-1", { type: "startSession" });

    const firstWs = await connectReal(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const firstSnapshot = await nextMessage(firstWs);
    expect(firstSnapshot.payload.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });
    firstWs.close();

    const secondWs = await connectReal(stub, { eventId: "event-1", role: "stage", token: "tok" });
    const secondSnapshot = await nextMessage(secondWs);
    expect(secondSnapshot.payload.phase).toEqual({ kind: "ready", nextQuestionId: "q1" });

    secondWs.close();
  });
});
