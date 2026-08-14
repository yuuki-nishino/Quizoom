import { describe, it, expect } from "vitest";
import { validateQuestionForm, resizeOptions, optionCountForFormat } from "./question-validation";
import type { QuestionFormValues } from "./question-validation";

function values(overrides: Partial<QuestionFormValues> = {}): QuestionFormValues {
  return {
    body: "1+1は?",
    timeLimitSec: 30,
    options: [
      { label: "1", isCorrect: false },
      { label: "2", isCorrect: true },
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
    expect(validateQuestionForm(values({ options: [{ label: "only one", isCorrect: true }] }))).toContain("options");
  });

  it("flags more than 4 options", () => {
    const options = Array.from({ length: 5 }, (_, i) => ({ label: `opt${i}`, isCorrect: i === 0 }));
    expect(validateQuestionForm(values({ options }))).toContain("options");
  });

  it("flags zero correct options", () => {
    const options = [
      { label: "a", isCorrect: false },
      { label: "b", isCorrect: false },
    ];
    expect(validateQuestionForm(values({ options }))).toContain("correctOption");
  });

  it("flags more than one correct option", () => {
    const options = [
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: true },
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
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: false },
    ];
    const resized = resizeOptions(options, "four");
    expect(resized).toEqual([
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: false },
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ]);
  });

  it("trims options when switching from four to two, keeping an existing correct flag among survivors", () => {
    const options = [
      { label: "a", isCorrect: false },
      { label: "b", isCorrect: true },
      { label: "c", isCorrect: false },
      { label: "d", isCorrect: false },
    ];
    expect(resizeOptions(options, "two")).toEqual([
      { label: "a", isCorrect: false },
      { label: "b", isCorrect: true },
    ]);
  });

  it("forces the first survivor to be correct if trimming removed the only correct option", () => {
    const options = [
      { label: "a", isCorrect: false },
      { label: "b", isCorrect: false },
      { label: "c", isCorrect: true },
      { label: "d", isCorrect: false },
    ];
    expect(resizeOptions(options, "two")).toEqual([
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: false },
    ]);
  });

  it("returns the same options unchanged when already the target length", () => {
    const options = [
      { label: "a", isCorrect: true },
      { label: "b", isCorrect: false },
    ];
    expect(resizeOptions(options, "two")).toBe(options);
  });
});
