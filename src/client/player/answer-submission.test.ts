import { describe, it, expect } from "vitest";
import { answerSubmissionReducer, initialAnswerSubmissionState, canSubmitAnswer } from "./answer-submission";
import type { AnswerSubmissionState } from "./answer-submission";
import type { OptionId, QuestionId } from "../../shared/domain-types";

const q1 = "q1" as QuestionId;
const q2 = "q2" as QuestionId;
const optA = "optA" as OptionId;
const optB = "optB" as OptionId;

describe("answerSubmissionReducer", () => {
  it("starts idle", () => {
    expect(initialAnswerSubmissionState).toEqual({ status: "idle" });
  });

  it("transitions idle -> pending on submit", () => {
    const next = answerSubmissionReducer(initialAnswerSubmissionState, { type: "submit", questionId: q1, optionId: optA });
    expect(next).toEqual({ status: "pending", questionId: q1, optionId: optA });
  });

  it("ignores a second submit while already pending (prevents a duplicate tap from sending twice)", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: q1, optionId: optA };
    const next = answerSubmissionReducer(pending, { type: "submit", questionId: q1, optionId: optB });
    expect(next).toBe(pending);
  });

  it("transitions pending -> accepted when the matching answerAccepted arrives", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: q1, optionId: optA };
    const next = answerSubmissionReducer(pending, { type: "accepted", questionId: q1, optionId: optA });
    expect(next).toEqual({ status: "accepted", questionId: q1, optionId: optA });
  });

  it("ignores a stale accepted event for a different question/option than what is pending", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: q1, optionId: optA };
    expect(answerSubmissionReducer(pending, { type: "accepted", questionId: q2, optionId: optA })).toBe(pending);
    expect(answerSubmissionReducer(pending, { type: "accepted", questionId: q1, optionId: optB })).toBe(pending);
  });

  it("transitions pending -> rejected with the server's rejection code", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: q1, optionId: optA };
    const next = answerSubmissionReducer(pending, { type: "rejected", questionId: q1, code: "ANSWER_WINDOW_CLOSED" });
    expect(next).toEqual({ status: "rejected", questionId: q1, optionId: optA, code: "ANSWER_WINDOW_CLOSED" });
  });

  it("does not allow retrying a business rejection via submit", () => {
    const rejected: AnswerSubmissionState = { status: "rejected", questionId: q1, optionId: optA, code: "ALREADY_ANSWERED" };
    const next = answerSubmissionReducer(rejected, { type: "submit", questionId: q1, optionId: optA });
    expect(next).toBe(rejected);
  });

  it("transitions pending -> failed on sendFailed (network failure), and allows a retry via submit", () => {
    const pending: AnswerSubmissionState = { status: "pending", questionId: q1, optionId: optA };
    const failed = answerSubmissionReducer(pending, { type: "sendFailed", questionId: q1 });
    expect(failed).toEqual({ status: "failed", questionId: q1, optionId: optA });

    const retried = answerSubmissionReducer(failed, { type: "submit", questionId: q1, optionId: optA });
    expect(retried).toEqual({ status: "pending", questionId: q1, optionId: optA });
  });

  it("resets to idle regardless of prior state (used when a new question opens)", () => {
    const accepted: AnswerSubmissionState = { status: "accepted", questionId: q1, optionId: optA };
    expect(answerSubmissionReducer(accepted, { type: "reset" })).toEqual({ status: "idle" });
  });
});

describe("canSubmitAnswer", () => {
  it("is true when idle", () => {
    expect(canSubmitAnswer({ status: "idle" }, q1)).toBe(true);
  });

  it("is false while pending or accepted or rejected", () => {
    expect(canSubmitAnswer({ status: "pending", questionId: q1, optionId: optA }, q1)).toBe(false);
    expect(canSubmitAnswer({ status: "accepted", questionId: q1, optionId: optA }, q1)).toBe(false);
    expect(canSubmitAnswer({ status: "rejected", questionId: q1, optionId: optA, code: "ALREADY_ANSWERED" }, q1)).toBe(false);
  });

  it("is true when failed for the same question (retry), false for a different question", () => {
    const failed: AnswerSubmissionState = { status: "failed", questionId: q1, optionId: optA };
    expect(canSubmitAnswer(failed, q1)).toBe(true);
    expect(canSubmitAnswer(failed, q2)).toBe(false);
  });
});
