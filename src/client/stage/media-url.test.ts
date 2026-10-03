import { describe, it, expect } from "vitest";
import { buildOptionImageUrls, buildStageMediaUrl, isChoiceImageScreen } from "./media-url";
import type { AssetId, EventId, OptionId, QuestionId } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { initialStageState } from "./stage-state";

describe("buildStageMediaUrl", () => {
  it("builds a token-authorized media URL", () => {
    expect(buildStageMediaUrl("e1" as EventId, "a1" as AssetId, "tok-123")).toBe("/api/events/e1/media/a1?token=tok-123");
  });
});

const question = (imageIds: readonly (string | null)[]): QuestionPublicView => ({
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "どれ？",
  imageAssetId: null,
  options: imageIds.map((id, i) => ({ id: `o${i + 1}` as OptionId, label: `選択肢${i + 1}`, orderIndex: i, imageAssetId: id as AssetId | null })),
});

describe("buildOptionImageUrls (Issue #36)", () => {
  it("resolves a stage-token media URL for every option that has an image", () => {
    expect(buildOptionImageUrls("e1" as EventId, question(["a1", "a2"]), "tok")).toEqual({
      o1: "/api/events/e1/media/a1?token=tok",
      o2: "/api/events/e1/media/a2?token=tok",
    });
  });

  it("leaves options without an image out of the map (mixed question)", () => {
    expect(buildOptionImageUrls("e1" as EventId, question([null, "a2", null]), "tok")).toEqual({ o2: "/api/events/e1/media/a2?token=tok" });
  });

  it("returns an empty map for a text-only question", () => {
    expect(buildOptionImageUrls("e1" as EventId, question([null, null]), "tok")).toEqual({});
  });

  it("returns an empty map when there is no current question", () => {
    expect(buildOptionImageUrls("e1" as EventId, null, "tok")).toEqual({});
  });
});

describe("isChoiceImageScreen (Issue #36)", () => {
  it("is true while the question or its reveal is shown and an option has an image", () => {
    expect(isChoiceImageScreen({ ...initialStageState, currentQuestion: question(["a1", null]) })).toBe(true);
    expect(
      isChoiceImageScreen({
        ...initialStageState,
        currentQuestion: question(["a1", null]),
        closedQuestion: { questionId: "q1" as QuestionId, correctOptionId: "o1" as OptionId, distribution: [], explanation: "", personalResult: null },
      }),
    ).toBe(true);
  });

  it("is false for a text-only question, while waiting, and while a ranking is shown", () => {
    expect(isChoiceImageScreen({ ...initialStageState, currentQuestion: question([null, null]) })).toBe(false);
    expect(isChoiceImageScreen(initialStageState)).toBe(false);
    expect(isChoiceImageScreen({ ...initialStageState, currentQuestion: question(["a1", null]), ranking: [] })).toBe(false);
  });
});

