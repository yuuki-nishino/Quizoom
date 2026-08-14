import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";
import { createLiveStore, type LiveStore } from "./live-store";
import { createParticipantTokenService } from "./participant-token";
import { requireEventOwner } from "../auth/guard";
import { loadQuestionSnapshot, updateStatus } from "../catalog/repository";
import { save as saveResult, type JudgedAnswer } from "../results/archive";
import { judge, aggregate, rank } from "../../shared/scoring";
import { next } from "./phase-machine";
import {
  clientCommandSchema,
  type ClientCommand,
  type HostCommand,
  type ServerEvent,
  type SelfState,
  type StateSnapshotPayload,
  type QuestionOpenedPayload,
  type QuestionPublicView,
  type ProgressUpdatedPayload,
  type QuestionClosedPayload,
  type OptionDistributionEntry,
  type PersonalResult,
  type RankingUpdatedPayload,
  type PersonalRankPayload,
} from "../../shared/protocol";
import type {
  AlarmIntent,
  EventId,
  EventMeta,
  EventStatus,
  LivePhase,
  ParticipantId,
  QuestionSnapshot,
  Result,
  ThemeSettings,
} from "../../shared/domain-types";
import { err, ok } from "../../shared/domain-types";

type ConnectionRole =
  | { readonly role: "host"; readonly eventId: EventId }
  | { readonly role: "stage"; readonly eventId: EventId }
  | { readonly role: "participant"; readonly eventId: EventId; readonly participantId: ParticipantId };

function toPublicView(question: QuestionSnapshot): QuestionPublicView {
  return {
    id: question.id,
    orderIndex: question.orderIndex,
    body: question.body,
    imageAssetId: question.imageAssetId,
    options: question.options,
  };
}

export class QuizSessionDO extends DurableObject<Env> {
  readonly #store: LiveStore;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = createLiveStore(ctx.storage.sql);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/internal/publish") {
      return this.#handlePublish(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/join") {
      return this.#handleJoin(request);
    }
    if (request.method === "POST" && url.pathname === "/internal/theme") {
      return this.#handleThemeUpdate(request);
    }
    if (request.method === "GET" && url.pathname === "/internal/ping") {
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/connect") {
      return this.#handleConnect(request, url);
    }

    return new Response("Not Found", { status: 404 });
  }

  async #handlePublish(request: Request): Promise<Response> {
    const meta = (await request.json()) as EventMeta;
    this.#store.initialize(meta);
    return new Response(null, { status: 204 });
  }

  async #handleJoin(request: Request): Promise<Response> {
    const { nickname } = (await request.json()) as { nickname: string };
    const state = this.#store.load();

    if (!state || state.eventMeta.status === "finished") {
      return Response.json({ ok: false, error: { code: "EVENT_FINISHED" } });
    }
    if (this.#store.listParticipants().length >= state.eventMeta.capacity) {
      return Response.json({ ok: false, error: { code: "CAPACITY_REACHED" } });
    }

    return Response.json(this.#store.addParticipant(nickname, Date.now()));
  }

  async #handleThemeUpdate(request: Request): Promise<Response> {
    const theme = (await request.json()) as ThemeSettings;
    const state = this.#store.load();
    if (!state) return new Response("Not Found", { status: 404 });

    this.#store.saveEventMeta({ ...state.eventMeta, theme });
    this.#broadcast({ type: "themeUpdated", payload: theme }, (role) => role.role === "stage" || role.role === "participant");

    return new Response(null, { status: 204 });
  }

  async #handleConnect(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket", { status: 426 });
    }

    const eventIdParam = url.searchParams.get("eventId");
    const role = url.searchParams.get("role");
    if (!eventIdParam || !role) {
      return new Response("Bad Request", { status: 400 });
    }
    const eventId = eventIdParam as EventId;

    const verified = await this.#verifyRole(request, eventId, role, url);
    if (!verified.ok) {
      return new Response("Unauthorized", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(verified.value);
    this.#sendStateSnapshot(server, verified.value);

    return new Response(null, { status: 101, webSocket: client });
  }

  async #verifyRole(
    request: Request,
    eventId: EventId,
    role: string,
    url: URL,
  ): Promise<Result<ConnectionRole, { readonly code: string }>> {
    if (role === "host") {
      const auth = await requireEventOwner(request, this.env, eventId);
      return auth.ok ? ok({ role: "host", eventId }) : err({ code: auth.error.code });
    }

    if (role === "stage") {
      const token = url.searchParams.get("token");
      if (!token) return err({ code: "UNAUTHORIZED" });
      const row = await this.env.DB.prepare("SELECT id FROM event WHERE id = ? AND stage_token = ?")
        .bind(eventId, token)
        .first();
      return row ? ok({ role: "stage", eventId }) : err({ code: "UNAUTHORIZED" });
    }

    if (role === "participant") {
      const token = url.searchParams.get("token");
      if (!token) return err({ code: "UNAUTHORIZED" });
      const verified = await createParticipantTokenService(this.env).verify(token, eventId);
      return verified.ok
        ? ok({ role: "participant", eventId, participantId: verified.value.participantId })
        : err({ code: verified.error.code });
    }

    return err({ code: "UNKNOWN_ROLE" });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const role = ws.deserializeAttachment() as ConnectionRole | null;
    if (!role) {
      ws.close(1011, "missing role");
      return;
    }

    let parsedJson: unknown;
    try {
      const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
      parsedJson = JSON.parse(raw);
    } catch {
      this.#sendRejection(ws, "INVALID_COMMAND", "message is not valid JSON");
      return;
    }

    const parsed = clientCommandSchema.safeParse(parsedJson);
    if (!parsed.success) {
      this.#sendRejection(ws, "INVALID_COMMAND", "message does not match the client command schema");
      return;
    }

    const command: ClientCommand = parsed.data;

    if (command.type === "resync") {
      this.#sendStateSnapshot(ws, role);
      return;
    }

    if (command.type === "submitAnswer") {
      if (role.role !== "participant") {
        this.#sendRejection(ws, "FORBIDDEN", "only participants may submit answers");
        return;
      }
      this.#handleSubmitAnswer(ws, role, command);
      return;
    }

    if (role.role !== "host") {
      this.#sendRejection(ws, "FORBIDDEN", "host commands are rejected on non-host connections");
      return;
    }
    await this.#handleHostCommand(ws, role.eventId, command);
  }

  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {}

  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {}

  async alarm(): Promise<void> {
    const state = this.#store.load();
    if (!state || state.phase.kind !== "questionOpen") return;

    const transition = next(state.phase, { type: "closeQuestion" }, { now: Date.now(), questions: state.questions ?? [] });
    if (!transition.ok) return;

    this.#store.savePhase(transition.value.phase);
    await this.#applyAlarm(transition.value.alarm);
    this.#broadcastStateSnapshot();
  }

  async #handleHostCommand(ws: WebSocket, eventId: EventId, command: HostCommand): Promise<void> {
    const state = this.#store.load();
    if (!state) {
      this.#sendRejection(ws, "NOT_INITIALIZED", "the session has not been published yet");
      return;
    }

    if (command.type === "startSession") {
      await this.#handleStartSession(ws, eventId, state.phase);
      return;
    }

    const questions = state.questions ?? [];
    const transition = next(state.phase, command, { now: Date.now(), questions });
    if (!transition.ok) {
      this.#sendRejection(ws, transition.error.code, `cannot apply ${command.type} from phase ${state.phase.kind}`);
      return;
    }

    this.#store.savePhase(transition.value.phase);
    await this.#applyAlarm(transition.value.alarm);

    switch (command.type) {
      case "openQuestion":
      case "reopenQuestion":
        this.#afterQuestionOpened(transition.value.phase, questions);
        break;
      case "revealAnswer":
        this.#afterRevealAnswer(transition.value.phase, questions);
        break;
      case "showRanking":
        this.#broadcastRanking(questions);
        break;
      case "finalize":
        await this.#afterFinalize(eventId, questions);
        break;
      case "closeQuestion":
      case "nextQuestion":
      case "pause":
      case "resume":
        this.#broadcastStateSnapshot();
        break;
    }
  }

  async #handleStartSession(ws: WebSocket, eventId: EventId, phase: LivePhase): Promise<void> {
    const existing = this.#store.load();
    let questions = existing?.questions ?? null;
    if (questions === null) {
      questions = await loadQuestionSnapshot(this.env, eventId);
      this.#store.freezeQuestionSnapshot(questions, Date.now());
    }

    const transition = next(phase, { type: "startSession" }, { now: Date.now(), questions });
    if (!transition.ok) {
      this.#sendRejection(ws, transition.error.code, `cannot apply startSession from phase ${phase.kind}`);
      return;
    }

    this.#store.savePhase(transition.value.phase);
    await this.#applyAlarm(transition.value.alarm);
    await this.#updateStatusWithRetry(eventId, "published", "live");
    this.#broadcastStateSnapshot();
  }

  #handleSubmitAnswer(
    ws: WebSocket,
    role: Extract<ConnectionRole, { role: "participant" }>,
    command: Extract<ClientCommand, { type: "submitAnswer" }>,
  ): void {
    const state = this.#store.load();
    const phase = state?.phase;
    if (
      !state ||
      !phase ||
      phase.kind !== "questionOpen" ||
      phase.questionId !== command.questionId ||
      Date.now() > phase.deadlineAt
    ) {
      this.#sendRejection(ws, "ANSWER_WINDOW_CLOSED", "the answer window for this question is closed");
      return;
    }

    const outcome = this.#store.recordAnswer({
      participantId: role.participantId,
      questionId: command.questionId,
      selectedOptionId: command.optionId,
      elapsedMs: Date.now() - phase.openedAt,
    });

    if (outcome.kind === "alreadyAnswered") {
      this.#sendRejection(ws, "ALREADY_ANSWERED", "you have already answered this question");
      return;
    }

    this.#sendTo(ws, {
      type: "answerAccepted",
      payload: { questionId: command.questionId, selectedOptionId: command.optionId },
    });
    this.#broadcastProgress(phase, state.eventMeta);
  }

  #broadcastProgress(phase: Extract<LivePhase, { kind: "questionOpen" }>, _eventMeta: EventMeta): void {
    const answeredCount = this.#store.listAnswers(phase.questionId).length;
    const totalCount = this.#store.listParticipants().length;
    const payload: ProgressUpdatedPayload = { answeredCount, totalCount };
    this.#broadcast({ type: "progressUpdated", payload }, (role) => role.role === "host" || role.role === "stage");
  }

  #afterQuestionOpened(phase: LivePhase, questions: readonly QuestionSnapshot[]): void {
    if (phase.kind !== "questionOpen") return;
    const question = questions.find((q) => q.id === phase.questionId);
    if (!question) return;

    const payload: QuestionOpenedPayload = {
      question: toPublicView(question),
      deadlineAt: phase.deadlineAt,
      serverNow: Date.now(),
    };
    this.#broadcast({ type: "questionOpened", payload }, () => true);
    this.#broadcastProgress(phase, this.#store.load()!.eventMeta);
  }

  #afterRevealAnswer(phase: LivePhase, questions: readonly QuestionSnapshot[]): void {
    if (phase.kind !== "revealed") return;
    const question = questions.find((q) => q.id === phase.questionId);
    if (!question) return;

    const answersForQuestion = this.#store.listAnswers(phase.questionId);
    const distribution: readonly OptionDistributionEntry[] = question.options.map((option) => ({
      optionId: option.id,
      count: answersForQuestion.filter((a) => a.selectedOptionId === option.id).length,
    }));

    const participants = this.#store.listParticipants();
    const allAnswers = this.#store.listAllAnswers();
    const ranked = rank(aggregate(participants, allAnswers, questions));
    const rankByParticipant = new Map(ranked.map((r) => [r.participantId, r]));

    const basePayload = {
      questionId: phase.questionId,
      correctOptionId: question.correctOptionId,
      distribution,
      explanation: question.explanation,
    };

    this.#broadcast(
      { type: "questionClosed", payload: { ...basePayload, personalResult: null } },
      (role) => role.role === "host" || role.role === "stage",
    );

    for (const ws of this.ctx.getWebSockets()) {
      const role = ws.deserializeAttachment() as ConnectionRole | null;
      if (!role || role.role !== "participant") continue;

      const myScore = rankByParticipant.get(role.participantId);
      if (!myScore) continue;
      const myAnswer = answersForQuestion.find((a) => a.participantId === role.participantId);
      const personalResult: PersonalResult = {
        isCorrect: myAnswer !== undefined && myAnswer.selectedOptionId === question.correctOptionId,
        correctCount: myScore.correctCount,
        rank: myScore.rank,
      };

      const payload: QuestionClosedPayload = { ...basePayload, personalResult };
      this.#sendTo(ws, { type: "questionClosed", payload });
    }
  }

  #broadcastRanking(questions: readonly QuestionSnapshot[]): void {
    const participants = this.#store.listParticipants();
    const answers = this.#store.listAllAnswers();
    const ranked = rank(aggregate(participants, answers, questions));

    const payload: RankingUpdatedPayload = { entries: ranked };
    this.#broadcast({ type: "rankingUpdated", payload }, (role) => role.role === "host" || role.role === "stage");

    const rankByParticipant = new Map(ranked.map((r) => [r.participantId, r]));
    for (const ws of this.ctx.getWebSockets()) {
      const role = ws.deserializeAttachment() as ConnectionRole | null;
      if (!role || role.role !== "participant") continue;
      const my = rankByParticipant.get(role.participantId);
      if (!my) continue;
      const payload: PersonalRankPayload = { rank: my.rank, correctCount: my.correctCount, totalElapsedMs: my.totalElapsedMs };
      this.#sendTo(ws, { type: "personalRank", payload });
    }
  }

  async #afterFinalize(eventId: EventId, questions: readonly QuestionSnapshot[]): Promise<void> {
    const participants = this.#store.listParticipants();
    const answers = this.#store.listAllAnswers();
    const ranked = rank(aggregate(participants, answers, questions));

    const correctOptionByQuestion = new Map(questions.map((q) => [q.id, q.correctOptionId]));
    const judgedAnswers: readonly JudgedAnswer[] = answers.map((answer) => {
      const correctOptionId = correctOptionByQuestion.get(answer.questionId);
      return {
        participantId: answer.participantId,
        questionId: answer.questionId,
        isCorrect: correctOptionId !== undefined && judge(answer, correctOptionId).isCorrect,
        elapsedMs: answer.elapsedMs,
      };
    });

    await saveResult(this.env, eventId, ranked, judgedAnswers);
    await this.#updateStatusWithRetry(eventId, "live", "finished");

    this.#broadcastRanking(questions);
  }

  async #updateStatusWithRetry(eventId: EventId, expected: EventStatus, nextStatus: EventStatus, attempts = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      try {
        await updateStatus(this.env, eventId, expected, nextStatus);
        return;
      } catch {
        // D1 への書き戻し失敗は DO 側の状態を正としてリトライする。最終的に失敗しても
        // フェーズ遷移は既に確定しているため、進行は止めない。
      }
    }
  }

  async #applyAlarm(intent: AlarmIntent): Promise<void> {
    if (intent.kind === "set") await this.ctx.storage.setAlarm(intent.at);
    else if (intent.kind === "clear") await this.ctx.storage.deleteAlarm();
  }

  #buildSelfState(role: ConnectionRole): SelfState {
    if (role.role === "host") return { role: "host" };
    if (role.role === "stage") return { role: "stage" };

    const participant = this.#store.findParticipant(role.participantId);
    const answeredQuestionIds = this.#store
      .listAllAnswers()
      .filter((a) => a.participantId === role.participantId)
      .map((a) => a.questionId);

    return {
      role: "participant",
      participantId: role.participantId,
      nickname: participant?.nickname ?? "",
      answeredQuestionIds,
    };
  }

  #sendStateSnapshot(ws: WebSocket, role: ConnectionRole): void {
    const state = this.#store.load();
    if (!state) return;

    const payload: StateSnapshotPayload = {
      eventId: role.eventId,
      phase: state.phase,
      theme: state.eventMeta.theme,
      serverNow: Date.now(),
      self: this.#buildSelfState(role),
    };
    this.#sendTo(ws, { type: "stateSnapshot", payload });
  }

  #broadcastStateSnapshot(): void {
    for (const ws of this.ctx.getWebSockets()) {
      const role = ws.deserializeAttachment() as ConnectionRole | null;
      if (role) this.#sendStateSnapshot(ws, role);
    }
  }

  #broadcast(event: ServerEvent, filter: (role: ConnectionRole) => boolean): void {
    const message = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      const role = ws.deserializeAttachment() as ConnectionRole | null;
      if (role && filter(role)) ws.send(message);
    }
  }

  #sendTo(ws: WebSocket, event: ServerEvent): void {
    ws.send(JSON.stringify(event));
  }

  #sendRejection(ws: WebSocket, code: string, message: string): void {
    this.#sendTo(ws, { type: "commandRejected", payload: { code, message } });
  }
}

export function getSessionStub(
  env: Env,
  eventId: EventId,
  locationHint?: DurableObjectLocationHint,
): DurableObjectStub<QuizSessionDO> {
  return env.QUIZ_SESSION.getByName(eventId, locationHint ? { locationHint } : undefined);
}
