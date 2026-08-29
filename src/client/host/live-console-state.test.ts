import { describe, it, expect } from "vitest";
import {
  hostConsoleReducer,
  initialHostConsoleState,
  canOpenQuestion,
  canCloseQuestion,
  canPause,
  canResume,
  canReopenQuestion,
  canRevealAnswer,
  canShowRanking,
  canFinalize,
  canShowNextQuestion,
  isLastQuestion,
  canStartSession,
  currentDeadlineAt,
  pausedRemainingMs,
  isPracticeReady,
  isPracticeRevealed,
} from "./live-console-state";
import type { HostConsoleState } from "./live-console-state";
import type { LivePhase, OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { ServerEvent } from "../../shared/protocol";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

const theme: ThemeSettings = {
  primaryColor: "#000",
  accentColor: "#111",
  backgroundColor: "#fff",
  textColor: "#000",
  logoAssetId: null,
  backgroundAssetId: null,
  templateId: null,
};

describe("hostConsoleReducer", () => {
  it("applies a stateSnapshot by replacing phase, theme, serverNow, and participantCount", () => {
    const event: ServerEvent = {
      type: "stateSnapshot",
      payload: { eventId: "e1" as never, phase: { kind: "lobby" }, theme, serverNow: 1000, self: { role: "host" }, participantCount: 4 },
    };
    const next = hostConsoleReducer(initialHostConsoleState, event);
    expect(next.phase).toEqual({ kind: "lobby" });
    expect(next.theme).toEqual(theme);
    expect(next.serverNow).toBe(1000);
    expect(next.participantCount).toBe(4);
  });

  it("accumulates participant nicknames as participantJoined events arrive", () => {
    const e1: ServerEvent = { type: "participantJoined", payload: { participantCount: 1, nickname: "alice" } };
    const e2: ServerEvent = { type: "participantJoined", payload: { participantCount: 2, nickname: "bob" } };

    const s1 = hostConsoleReducer(initialHostConsoleState, e1);
    const s2 = hostConsoleReducer(s1, e2);

    expect(s2.participantCount).toBe(2);
    expect(s2.participantNicknames).toEqual(["alice", "bob"]);
  });

  it("synthesizes a questionOpen phase and resets progress/closedQuestion/ranking when a question opens", () => {
    const withStaleState: HostConsoleState = {
      ...initialHostConsoleState,
      phase: { kind: "ready", nextQuestionId: "q1" as QuestionId },
      answeredCount: 5,
      totalCount: 5,
      closedQuestion: {} as never,
      ranking: [{}] as never,
    };
    const event: ServerEvent = {
      type: "questionOpened",
      payload: {
        question: { id: "q1" as QuestionId, orderIndex: 0, body: "?", imageAssetId: null, options: [] },
        deadlineAt: 5000,
        serverNow: 1000,
      },
    };

    const next = hostConsoleReducer(withStaleState, event);
    expect(next.currentQuestion?.id).toBe("q1");
    expect(next.phase).toEqual({ kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 5000 });
    expect(next.answeredCount).toBe(0);
    expect(next.closedQuestion).toBeNull();
    expect(next.ranking).toBeNull();
  });

  it("updates answered/total counts on progressUpdated", () => {
    const event: ServerEvent = { type: "progressUpdated", payload: { answeredCount: 3, totalCount: 10 } };
    const next = hostConsoleReducer(initialHostConsoleState, event);
    expect(next.answeredCount).toBe(3);
    expect(next.totalCount).toBe(10);
  });

  it("stores the questionClosed (reveal) payload without touching phase", () => {
    const payload = {
      questionId: "q1" as QuestionId,
      correctOptionId: "o1" as OptionId,
      distribution: [],
      explanation: "because",
      personalResult: null,
    };
    const startPhase: LivePhase = { kind: "questionClosed", questionId: "q1" as QuestionId, openedAt: 0 };
    const event: ServerEvent = { type: "questionClosed", payload };
    const next = hostConsoleReducer({ ...initialHostConsoleState, phase: startPhase }, event);
    expect(next.closedQuestion).toEqual(payload);
    expect(next.phase).toEqual(startPhase);
  });

  it("stores ranking entries from rankingUpdated", () => {
    const entries = [{ participantId: "p1" as never, nickname: "alice", correctCount: 1, totalElapsedMs: 100, joinedSeq: 0, rank: 1 }];
    const event: ServerEvent = { type: "rankingUpdated", payload: { entries, isFinal: false, revealStep: null } };
    expect(hostConsoleReducer(initialHostConsoleState, event).ranking).toEqual(entries);
  });

  it("replaces the theme on themeUpdated without touching the phase", () => {
    const newTheme: ThemeSettings = { ...theme, primaryColor: "#abcdef" };
    const event: ServerEvent = { type: "themeUpdated", payload: newTheme };
    const next = hostConsoleReducer(
      { ...initialHostConsoleState, phase: { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 0, deadlineAt: 1000 } },
      event,
    );
    expect(next.theme).toEqual(newTheme);
    expect(next.phase?.kind).toBe("questionOpen");
  });

  it("records the last commandRejected payload", () => {
    const event: ServerEvent = { type: "commandRejected", payload: { code: "INVALID_PHASE", message: "nope" } };
    expect(hostConsoleReducer(initialHostConsoleState, event).lastRejection).toEqual({ code: "INVALID_PHASE", message: "nope" });
  });
});

describe("phase gating helpers", () => {
  const lobby: LivePhase = { kind: "lobby" };
  const ready: LivePhase = { kind: "ready", nextQuestionId: "q1" as QuestionId };
  const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 0, deadlineAt: 1000 };
  const closed: LivePhase = { kind: "questionClosed", questionId: "q1" as QuestionId, openedAt: 0 };
  const revealed: LivePhase = { kind: "revealed", questionId: "q1" as QuestionId };
  const paused: LivePhase = { kind: "paused", resumeTo: open, remainingMs: 500 };

  it("gates startSession to lobby only", () => {
    expect(canStartSession(lobby)).toBe(true);
    expect(canStartSession(ready)).toBe(false);
    expect(canStartSession(null)).toBe(false);
  });

  it("gates openQuestion to ready only", () => {
    expect(canOpenQuestion(ready)).toBe(true);
    expect(canOpenQuestion(lobby)).toBe(false);
    expect(canOpenQuestion(open)).toBe(false);
  });

  it("gates closeQuestion and pause to questionOpen only", () => {
    expect(canCloseQuestion(open)).toBe(true);
    expect(canCloseQuestion(closed)).toBe(false);
    expect(canPause(open)).toBe(true);
    expect(canPause(closed)).toBe(false);
  });

  it("gates resume to paused only", () => {
    expect(canResume(paused)).toBe(true);
    expect(canResume(open)).toBe(false);
  });

  it("gates reopenQuestion and revealAnswer to questionClosed only, not revealed", () => {
    expect(canReopenQuestion(closed)).toBe(true);
    expect(canReopenQuestion(revealed)).toBe(false);
    expect(canRevealAnswer(closed)).toBe(true);
    expect(canRevealAnswer(revealed)).toBe(false);
  });

  it("derives the current deadline only while questionOpen", () => {
    expect(currentDeadlineAt(open)).toBe(1000);
    expect(currentDeadlineAt(closed)).toBeNull();
    expect(currentDeadlineAt(null)).toBeNull();
  });

  it("derives the frozen remaining time only while paused", () => {
    expect(pausedRemainingMs(paused)).toBe(500);
    expect(pausedRemainingMs(open)).toBeNull();
  });
});

describe("post-reveal gating (revealed / rankingShown / lastQuestion booleans)", () => {
  it("shows the ranking action only once revealed and not already shown", () => {
    expect(canShowRanking(false, false)).toBe(false);
    expect(canShowRanking(true, false)).toBe(true);
    expect(canShowRanking(true, true)).toBe(false);
  });

  it("allows finalize any time after reveal", () => {
    expect(canFinalize(false)).toBe(false);
    expect(canFinalize(true)).toBe(true);
  });

  it("isLastQuestion is true when the current order index is the last of the total", () => {
    expect(isLastQuestion(2, 3)).toBe(true);
    expect(isLastQuestion(1, 3)).toBe(false);
    expect(isLastQuestion(null, 3)).toBe(false);
  });

  it("hides the next-question action once the final question has been revealed", () => {
    expect(canShowNextQuestion(true, true)).toBe(false);
    expect(canShowNextQuestion(true, false)).toBe(true);
    expect(canShowNextQuestion(false, false)).toBe(false);
  });
});

describe("practice question progression gating（要件3.1, 3.7, 3.8）", () => {
  it("isPracticeReady is true only when ready is pointing at the practice question", () => {
    expect(isPracticeReady({ kind: "ready", nextQuestionId: PRACTICE_QUESTION_ID })).toBe(true);
    expect(isPracticeReady({ kind: "ready", nextQuestionId: "q1" as QuestionId })).toBe(false);
    expect(isPracticeReady({ kind: "ready", nextQuestionId: null })).toBe(false);
    expect(isPracticeReady({ kind: "lobby" })).toBe(false);
    expect(isPracticeReady(null)).toBe(false);
  });

  it("isPracticeReady is never true when practice mode is disabled（要件3.8: nextQuestionIdは有効時にしかPRACTICE_QUESTION_IDにならない）", () => {
    // practiceMode無効時、PhaseMachineはnextQuestionIdに本編設問IDしか積まないため、
    // ここでの判定は自然にfalseのままになる（呼び出し側で別途フラグを渡す必要はない）
    expect(isPracticeReady({ kind: "ready", nextQuestionId: "q1" as QuestionId })).toBe(false);
  });

  it("isPracticeRevealed is true only when the closed question was the practice question", () => {
    expect(isPracticeRevealed(PRACTICE_QUESTION_ID)).toBe(true);
    expect(isPracticeRevealed("q1" as QuestionId)).toBe(false);
    expect(isPracticeRevealed(null)).toBe(false);
  });
});
