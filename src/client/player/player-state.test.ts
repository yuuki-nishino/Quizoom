import { describe, it, expect } from "vitest";
import { playerReducer, initialPlayerState, hasAnsweredCurrentQuestion } from "./player-state";
import type { PlayerState } from "./player-state";
import type { OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { ServerEvent } from "../../shared/protocol";

const theme: ThemeSettings = {
  primaryColor: "#000",
  accentColor: "#111",
  backgroundColor: "#fff",
  textColor: "#000",
  logoAssetId: null,
  backgroundAssetId: null,
};

describe("playerReducer", () => {
  it("applies a stateSnapshot: phase/theme/serverNow always, nickname/answeredQuestionIds only when self.role is participant", () => {
    const event: ServerEvent = {
      type: "stateSnapshot",
      payload: {
        eventId: "e1" as never,
        phase: { kind: "lobby" },
        theme,
        serverNow: 1000,
        self: { role: "participant", participantId: "p1" as never, nickname: "alice", answeredQuestionIds: ["q0" as QuestionId] },
      },
    };
    const next = playerReducer(initialPlayerState, event);
    expect(next.phase).toEqual({ kind: "lobby" });
    expect(next.nickname).toBe("alice");
    expect(next.answeredQuestionIds).toEqual(["q0"]);
  });

  it("captures initialPhaseKind only on the first stateSnapshot, never overwriting it on later ones", () => {
    const first: ServerEvent = {
      type: "stateSnapshot",
      payload: { eventId: "e1" as never, phase: { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 0, deadlineAt: 1000 }, theme, serverNow: 500, self: { role: "host" } },
    };
    const second: ServerEvent = {
      type: "stateSnapshot",
      payload: { eventId: "e1" as never, phase: { kind: "lobby" }, theme, serverNow: 2000, self: { role: "host" } },
    };
    const s1 = playerReducer(initialPlayerState, first);
    expect(s1.initialPhaseKind).toBe("questionOpen");
    const s2 = playerReducer(s1, second);
    expect(s2.initialPhaseKind).toBe("questionOpen");
    expect(s2.phase).toEqual({ kind: "lobby" });
  });

  it("synthesizes a questionOpen phase and resets myAnswerOptionId/closedQuestion/personalRank when a genuinely new question opens", () => {
    const stale: PlayerState = {
      ...initialPlayerState,
      currentQuestion: { id: "q0" as QuestionId, orderIndex: 0, body: "old", imageAssetId: null, options: [] },
      myAnswerOptionId: "o1" as OptionId,
      closedQuestion: {} as never,
      personalRank: {} as never,
    };
    const event: ServerEvent = {
      type: "questionOpened",
      payload: { question: { id: "q1" as QuestionId, orderIndex: 1, body: "new", imageAssetId: null, options: [] }, deadlineAt: 5000, serverNow: 1000 },
    };

    const next = playerReducer(stale, event);
    expect(next.currentQuestion?.id).toBe("q1");
    expect(next.phase).toEqual({ kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 5000 });
    expect(next.myAnswerOptionId).toBeNull();
    expect(next.closedQuestion).toBeNull();
    expect(next.personalRank).toBeNull();
  });

  it("preserves myAnswerOptionId/closedQuestion/personalRank when questionOpened repeats the SAME question (reopenQuestion)", () => {
    const answered: PlayerState = {
      ...initialPlayerState,
      currentQuestion: { id: "q1" as QuestionId, orderIndex: 0, body: "q", imageAssetId: null, options: [] },
      myAnswerOptionId: "o1" as OptionId,
    };
    const event: ServerEvent = {
      type: "questionOpened",
      payload: { question: { id: "q1" as QuestionId, orderIndex: 0, body: "q", imageAssetId: null, options: [] }, deadlineAt: 9000, serverNow: 2000 },
    };

    const next = playerReducer(answered, event);
    expect(next.myAnswerOptionId).toBe("o1");
    expect(next.phase).toEqual({ kind: "questionOpen", questionId: "q1", openedAt: 2000, deadlineAt: 9000 });
  });

  it("records the selected option from answerAccepted", () => {
    const event: ServerEvent = { type: "answerAccepted", payload: { questionId: "q1" as QuestionId, selectedOptionId: "o2" as OptionId } };
    expect(playerReducer(initialPlayerState, event).myAnswerOptionId).toBe("o2");
  });

  it("stores the questionClosed payload including personalResult", () => {
    const payload = {
      questionId: "q1" as QuestionId,
      correctOptionId: "o1" as OptionId,
      distribution: [],
      explanation: "because",
      personalResult: { isCorrect: true, correctCount: 1, rank: 1 },
    };
    const event: ServerEvent = { type: "questionClosed", payload };
    expect(playerReducer(initialPlayerState, event).closedQuestion).toEqual(payload);
  });

  it("stores personalRank", () => {
    const payload = { rank: 1, correctCount: 2, totalElapsedMs: 3000, isFinal: true };
    const event: ServerEvent = { type: "personalRank", payload };
    expect(playerReducer(initialPlayerState, event).personalRank).toEqual(payload);
  });

  it("replaces the theme on themeUpdated", () => {
    const newTheme: ThemeSettings = { ...theme, primaryColor: "#abcdef" };
    const event: ServerEvent = { type: "themeUpdated", payload: newTheme };
    expect(playerReducer(initialPlayerState, event).theme).toEqual(newTheme);
  });

  it("records the last commandRejected payload", () => {
    const event: ServerEvent = { type: "commandRejected", payload: { code: "ANSWER_WINDOW_CLOSED", message: "too late" } };
    expect(playerReducer(initialPlayerState, event).lastRejection).toEqual({ code: "ANSWER_WINDOW_CLOSED", message: "too late" });
  });
});

describe("hasAnsweredCurrentQuestion", () => {
  it("is true when myAnswerOptionId is set for this connection", () => {
    const state: PlayerState = { ...initialPlayerState, myAnswerOptionId: "o1" as OptionId };
    expect(hasAnsweredCurrentQuestion(state)).toBe(true);
  });

  it("is true when the snapshot's answeredQuestionIds already includes the current question (e.g. after reload)", () => {
    const state: PlayerState = {
      ...initialPlayerState,
      currentQuestion: { id: "q1" as QuestionId, orderIndex: 0, body: "q", imageAssetId: null, options: [] },
      answeredQuestionIds: ["q1" as QuestionId],
    };
    expect(hasAnsweredCurrentQuestion(state)).toBe(true);
  });

  it("is false when there is no current question or it hasn't been answered", () => {
    expect(hasAnsweredCurrentQuestion(initialPlayerState)).toBe(false);
    const state: PlayerState = {
      ...initialPlayerState,
      currentQuestion: { id: "q1" as QuestionId, orderIndex: 0, body: "q", imageAssetId: null, options: [] },
    };
    expect(hasAnsweredCurrentQuestion(state)).toBe(false);
  });
});
