import { describe, it, expect } from "vitest";
import { stageReducer, initialStageState } from "./stage-state";
import type { StageState } from "./stage-state";
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

describe("stageReducer", () => {
  it("applies a stateSnapshot by replacing phase, theme, and serverNow", () => {
    const event: ServerEvent = {
      type: "stateSnapshot",
      payload: { eventId: "e1" as never, phase: { kind: "lobby" }, theme, serverNow: 1000, self: { role: "stage" } },
    };
    const next = stageReducer(initialStageState, event);
    expect(next.phase).toEqual({ kind: "lobby" });
    expect(next.theme).toEqual(theme);
  });

  it("synthesizes a questionOpen phase and resets progress/closedQuestion/ranking when a question opens", () => {
    const stale: StageState = {
      ...initialStageState,
      answeredCount: 5,
      totalCount: 5,
      closedQuestion: {} as never,
      ranking: [{}] as never,
      isFinalRanking: true,
    };
    const event: ServerEvent = {
      type: "questionOpened",
      payload: {
        question: { id: "q1" as QuestionId, orderIndex: 0, body: "?", imageAssetId: null, options: [] },
        deadlineAt: 5000,
        serverNow: 1000,
      },
    };

    const next = stageReducer(stale, event);
    expect(next.currentQuestion?.id).toBe("q1");
    expect(next.phase).toEqual({ kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 5000 });
    expect(next.answeredCount).toBe(0);
    expect(next.closedQuestion).toBeNull();
    expect(next.ranking).toBeNull();
    expect(next.isFinalRanking).toBe(false);
  });

  it("updates answered/total counts on progressUpdated", () => {
    const event: ServerEvent = { type: "progressUpdated", payload: { answeredCount: 4, totalCount: 9 } };
    const next = stageReducer(initialStageState, event);
    expect(next.answeredCount).toBe(4);
    expect(next.totalCount).toBe(9);
  });

  it("stores the reveal payload (correct option, distribution, explanation)", () => {
    const payload = {
      questionId: "q1" as QuestionId,
      correctOptionId: "o2" as OptionId,
      distribution: [{ optionId: "o1" as OptionId, count: 1 }],
      explanation: "because",
      personalResult: null,
    };
    const event: ServerEvent = { type: "questionClosed", payload };
    expect(stageReducer(initialStageState, event).closedQuestion).toEqual(payload);
  });

  it("stores ranking entries and the isFinal flag from rankingUpdated", () => {
    const entries = [{ participantId: "p1" as never, nickname: "alice", correctCount: 1, totalElapsedMs: 100, joinedSeq: 0, rank: 1 }];

    const interim: ServerEvent = { type: "rankingUpdated", payload: { entries, isFinal: false } };
    expect(stageReducer(initialStageState, interim)).toMatchObject({ ranking: entries, isFinalRanking: false });

    const final: ServerEvent = { type: "rankingUpdated", payload: { entries, isFinal: true } };
    expect(stageReducer(initialStageState, final)).toMatchObject({ ranking: entries, isFinalRanking: true });
  });

  it("replaces the theme on themeUpdated without touching the phase", () => {
    const newTheme: ThemeSettings = { ...theme, primaryColor: "#abcdef" };
    const event: ServerEvent = { type: "themeUpdated", payload: newTheme };
    const withPhase: StageState = { ...initialStageState, phase: { kind: "revealed", questionId: "q1" as QuestionId } };
    const next = stageReducer(withPhase, event);
    expect(next.theme).toEqual(newTheme);
    expect(next.phase?.kind).toBe("revealed");
  });
});
