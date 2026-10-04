import { describe, it, expect } from "vitest";
import { buildOptionBreakdown } from "./option-breakdown";
import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import type { AssetId, OptionId, QuestionId } from "../../shared/domain-types";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都は？",
  imageAssetId: null,
  options: [
    { id: "o1" as OptionId, label: "東京", orderIndex: 0, imageAssetId: null },
    { id: "o2" as OptionId, label: "大阪", orderIndex: 1, imageAssetId: null },
  ],
};

const closed: QuestionClosedPayload = {
  questionId: "q1" as QuestionId,
  correctOptionId: "o1" as OptionId,
  distribution: [
    { optionId: "o1" as OptionId, count: 12 },
    { optionId: "o2" as OptionId, count: 5 },
  ],
  explanation: "東京です",
  personalResult: null,
};

describe("buildOptionBreakdown", () => {
  it("resolves each option id to its label with the count, percentage, and correctness", () => {
    expect(buildOptionBreakdown(question, closed)).toEqual([
      { optionId: "o1", label: "東京", imageAssetId: null, count: 12, pct: 71, isCorrect: true },
      { optionId: "o2", label: "大阪", imageAssetId: null, count: 5, pct: 29, isCorrect: false },
    ]);
  });

  it("orders rows by the question's orderIndex rather than the distribution order", () => {
    const shuffled: QuestionClosedPayload = {
      ...closed,
      distribution: [
        { optionId: "o2" as OptionId, count: 5 },
        { optionId: "o1" as OptionId, count: 12 },
      ],
    };
    expect(buildOptionBreakdown(question, shuffled).map((row) => row.label)).toEqual(["東京", "大阪"]);
  });

  it("sorts options whose orderIndex disagrees with the array order", () => {
    const unsorted: QuestionPublicView = {
      ...question,
      options: [
        { id: "o2" as OptionId, label: "大阪", orderIndex: 1, imageAssetId: null },
        { id: "o1" as OptionId, label: "東京", orderIndex: 0, imageAssetId: null },
      ],
    };
    expect(buildOptionBreakdown(unsorted, closed).map((row) => row.label)).toEqual(["東京", "大阪"]);
  });

  it("includes options that received no answers as a zero-count row（要件5.6）", () => {
    const missing: QuestionClosedPayload = { ...closed, distribution: [{ optionId: "o1" as OptionId, count: 12 }] };
    expect(buildOptionBreakdown(question, missing)).toEqual([
      { optionId: "o1", label: "東京", imageAssetId: null, count: 12, pct: 100, isCorrect: true },
      { optionId: "o2", label: "大阪", imageAssetId: null, count: 0, pct: 0, isCorrect: false },
    ]);
  });

  it("reports every percentage as 0 when nobody answered, without dividing by zero", () => {
    const noAnswers: QuestionClosedPayload = {
      ...closed,
      distribution: [
        { optionId: "o1" as OptionId, count: 0 },
        { optionId: "o2" as OptionId, count: 0 },
      ],
    };
    expect(buildOptionBreakdown(question, noAnswers).map((row) => row.pct)).toEqual([0, 0]);
  });

  describe("再接続直後のフォールバック（question が null）", () => {
    it("falls back to positional labels instead of exposing raw option ids", () => {
      expect(buildOptionBreakdown(null, closed)).toEqual([
        { optionId: "o1", label: "選択肢1", imageAssetId: null, count: 12, pct: 71, isCorrect: true },
        { optionId: "o2", label: "選択肢2", imageAssetId: null, count: 5, pct: 29, isCorrect: false },
      ]);
    });

    it("keeps the distribution order, which the server builds in the question's option order", () => {
      const reordered: QuestionClosedPayload = {
        ...closed,
        correctOptionId: "o2" as OptionId,
        distribution: [
          { optionId: "o2" as OptionId, count: 5 },
          { optionId: "o1" as OptionId, count: 12 },
        ],
      };
      expect(buildOptionBreakdown(null, reordered)).toEqual([
        { optionId: "o2", label: "選択肢1", imageAssetId: null, count: 5, pct: 29, isCorrect: true },
        { optionId: "o1", label: "選択肢2", imageAssetId: null, count: 12, pct: 71, isCorrect: false },
      ]);
    });
  });

  it("carries each option's image reference into its row so the reveal can show the image (Issue #36)", () => {
    const withImages: QuestionPublicView = {
      ...question,
      options: [
        { id: "o1" as OptionId, label: "東京", orderIndex: 0, imageAssetId: "img-1" as AssetId },
        { id: "o2" as OptionId, label: "大阪", orderIndex: 1, imageAssetId: null },
      ],
    };
    expect(buildOptionBreakdown(withImages, closed).map((r) => r.imageAssetId)).toEqual(["img-1", null]);
  });

  it("has no image reference when the question could not be restored (fallback labels)", () => {
    expect(buildOptionBreakdown(null, closed).map((r) => r.imageAssetId)).toEqual([null, null]);
  });
});
