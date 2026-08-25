import { describe, it, expect } from "vitest";
import { PRACTICE_QUESTION, PRACTICE_QUESTION_ID, resolveQuestion } from "./practice-question";
import type { QuestionId, QuestionSnapshot } from "./domain-types";

describe("PRACTICE_QUESTION", () => {
  it("uses PRACTICE_QUESTION_ID as its id", () => {
    expect(PRACTICE_QUESTION.id).toBe(PRACTICE_QUESTION_ID);
  });

  it("has 2 to 4 options（既存の設問バリデーション規則: 選択肢2〜4件）", () => {
    expect(PRACTICE_QUESTION.options.length).toBeGreaterThanOrEqual(2);
    expect(PRACTICE_QUESTION.options.length).toBeLessThanOrEqual(4);
  });

  it("has exactly one correct option that matches one of its options（既存の設問バリデーション規則: 正解ちょうど1件）", () => {
    const matches = PRACTICE_QUESTION.options.filter((o) => o.id === PRACTICE_QUESTION.correctOptionId);
    expect(matches).toHaveLength(1);
  });

  it("has a time limit within the existing 5〜300 second bounds", () => {
    expect(PRACTICE_QUESTION.timeLimitSec).toBeGreaterThanOrEqual(5);
    expect(PRACTICE_QUESTION.timeLimitSec).toBeLessThanOrEqual(300);
  });

  it("has a non-empty body and explanation", () => {
    expect(PRACTICE_QUESTION.body.length).toBeGreaterThan(0);
    expect(PRACTICE_QUESTION.explanation.length).toBeGreaterThan(0);
  });

  it("has no image attached", () => {
    expect(PRACTICE_QUESTION.imageAssetId).toBeNull();
  });

  it("uses an orderIndex that cannot collide with a real question's orderIndex", () => {
    expect(PRACTICE_QUESTION.orderIndex).toBeLessThan(0);
  });

  it("gives every option a distinct id and a non-empty label", () => {
    const ids = new Set(PRACTICE_QUESTION.options.map((o) => o.id));
    expect(ids.size).toBe(PRACTICE_QUESTION.options.length);
    for (const option of PRACTICE_QUESTION.options) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveQuestion", () => {
  const realQuestion: QuestionSnapshot = {
    id: "q1" as QuestionId,
    orderIndex: 0,
    body: "real question",
    imageAssetId: null,
    timeLimitSec: 30,
    explanation: "",
    options: PRACTICE_QUESTION.options,
    correctOptionId: PRACTICE_QUESTION.correctOptionId,
  };

  it("resolves PRACTICE_QUESTION_ID to PRACTICE_QUESTION even when it is absent from the questions list", () => {
    expect(resolveQuestion(PRACTICE_QUESTION_ID, [realQuestion])).toBe(PRACTICE_QUESTION);
  });

  it("resolves a real questionId by looking it up in the questions list", () => {
    expect(resolveQuestion("q1" as QuestionId, [realQuestion])).toBe(realQuestion);
  });
});
