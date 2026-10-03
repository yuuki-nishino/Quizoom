import { describe, it, expect } from "vitest";
import type { AssetId } from "../../shared/domain-types";
import { validateQuestionForm, resizeOptions, optionCountForFormat, findEmptyOptionIndexes } from "./question-validation";
import type { QuestionFormValues } from "./question-validation";

function values(overrides: Partial<QuestionFormValues> = {}): QuestionFormValues {
  return {
    body: "1+1は?",
    timeLimitSec: 30,
    options: [
      { label: "1", isCorrect: false, imageAssetId: null },
      { label: "2", isCorrect: true, imageAssetId: null },
    ],
    ...overrides,
  };
}

describe("validateQuestionForm", () => {
  it("returns no fields for a fully valid question", () => {
    expect(validateQuestionForm(values())).toEqual([]);
  });

  it("flags an empty body", () => {
    expect(validateQuestionForm(values({ body: "  " }))).toContain("body");
  });

  it("flags fewer than 2 options", () => {
    expect(validateQuestionForm(values({ options: [{ label: "only one", isCorrect: true, imageAssetId: null }] }))).toContain("options");
  });

  it("flags more than 4 options", () => {
    const options = Array.from({ length: 5 }, (_, i) => ({ label: `opt${i}`, isCorrect: i === 0, imageAssetId: null }));
    expect(validateQuestionForm(values({ options }))).toContain("options");
  });

  it("flags zero correct options", () => {
    const options = [
      { label: "a", isCorrect: false, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
    ];
    expect(validateQuestionForm(values({ options }))).toContain("correctOption");
  });

  it("flags more than one correct option", () => {
    const options = [
      { label: "a", isCorrect: true, imageAssetId: null },
      { label: "b", isCorrect: true, imageAssetId: null },
    ];
    expect(validateQuestionForm(values({ options }))).toContain("correctOption");
  });

  it("flags a time limit below 5 seconds", () => {
    expect(validateQuestionForm(values({ timeLimitSec: 4 }))).toContain("timeLimitSec");
  });

  it("flags a time limit above 300 seconds", () => {
    expect(validateQuestionForm(values({ timeLimitSec: 301 }))).toContain("timeLimitSec");
  });

  it("accepts the boundary values 5 and 300", () => {
    expect(validateQuestionForm(values({ timeLimitSec: 5 }))).not.toContain("timeLimitSec");
    expect(validateQuestionForm(values({ timeLimitSec: 300 }))).not.toContain("timeLimitSec");
  });
});

describe("optionCountForFormat", () => {
  it("maps two -> 2 and four -> 4", () => {
    expect(optionCountForFormat("two")).toBe(2);
    expect(optionCountForFormat("four")).toBe(4);
  });
});

describe("resizeOptions", () => {
  it("pads with empty options when switching from two to four", () => {
    const options = [
      { label: "a", isCorrect: true, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
    ];
    const resized = resizeOptions(options, "four");
    expect(resized).toEqual([
      { label: "a", isCorrect: true, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
      { label: "", isCorrect: false, imageAssetId: null },
      { label: "", isCorrect: false, imageAssetId: null },
    ]);
  });

  it("trims options when switching from four to two, keeping an existing correct flag among survivors", () => {
    const options = [
      { label: "a", isCorrect: false, imageAssetId: null },
      { label: "b", isCorrect: true, imageAssetId: null },
      { label: "c", isCorrect: false, imageAssetId: null },
      { label: "d", isCorrect: false, imageAssetId: null },
    ];
    expect(resizeOptions(options, "two")).toEqual([
      { label: "a", isCorrect: false, imageAssetId: null },
      { label: "b", isCorrect: true, imageAssetId: null },
    ]);
  });

  it("forces the first survivor to be correct if trimming removed the only correct option", () => {
    const options = [
      { label: "a", isCorrect: false, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
      { label: "c", isCorrect: true, imageAssetId: null },
      { label: "d", isCorrect: false, imageAssetId: null },
    ];
    expect(resizeOptions(options, "two")).toEqual([
      { label: "a", isCorrect: true, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
    ]);
  });

  it("returns the same options unchanged when already the target length", () => {
    const options = [
      { label: "a", isCorrect: true, imageAssetId: null },
      { label: "b", isCorrect: false, imageAssetId: null },
    ];
    expect(resizeOptions(options, "two")).toBe(options);
  });
});

describe("option text is required even when an image is attached (Issue #36)", () => {
  const img = "asset-1" as AssetId;
  const optionsWith = (labels: readonly string[], images: readonly (AssetId | null)[]) =>
    labels.map((label, i) => ({ label, isCorrect: i === 0, imageAssetId: images[i] ?? null }));

  it("accepts options that have both text and an image", () => {
    expect(validateQuestionForm(values({ options: optionsWith(["りんご", "みかん"], [img, img]) }))).toEqual([]);
  });

  it("flags an image-only option (empty text) as optionLabel", () => {
    expect(validateQuestionForm(values({ options: optionsWith(["りんご", ""], [img, img]) }))).toContain("optionLabel");
  });

  it("flags a whitespace-only text as empty even with an image", () => {
    expect(validateQuestionForm(values({ options: optionsWith(["  ", "みかん"], [img, null]) }))).toContain("optionLabel");
  });

  it("flags an empty text without an image as well", () => {
    expect(validateQuestionForm(values({ options: optionsWith(["", "みかん"], [null, null]) }))).toContain("optionLabel");
  });

  it("reports the positions of the options whose text is empty, regardless of images", () => {
    expect(findEmptyOptionIndexes(optionsWith(["a", "", "c", " "], [null, img, null, img]))).toEqual([1, 3]);
    expect(findEmptyOptionIndexes(optionsWith(["a", "b"], [img, null]))).toEqual([]);
  });
});

describe("resizeOptions keeps option images (Issue #36)", () => {
  const img = (n: number) => `asset-${n}` as AssetId;

  it("keeps the images of the remaining options when shrinking from four to two", () => {
    const options = [0, 1, 2, 3].map((i) => ({ label: `o${i}`, isCorrect: i === 0, imageAssetId: img(i) }));
    const resized = resizeOptions(options, "two");
    expect(resized.map((o) => o.imageAssetId)).toEqual([img(0), img(1)]);
  });

  it("keeps existing images and adds new options without an image when growing from two to four", () => {
    const options = [0, 1].map((i) => ({ label: `o${i}`, isCorrect: i === 0, imageAssetId: img(i) }));
    const resized = resizeOptions(options, "four");
    expect(resized.map((o) => o.imageAssetId)).toEqual([img(0), img(1), null, null]);
    expect(resized.slice(2).every((o) => o.label === "")).toBe(true);
  });

  it("restores the same images when switching back to four after shrinking is not required: returns the same array when the size already matches", () => {
    const options = [0, 1].map((i) => ({ label: `o${i}`, isCorrect: i === 0, imageAssetId: img(i) }));
    expect(resizeOptions(options, "two")).toBe(options);
  });
});

