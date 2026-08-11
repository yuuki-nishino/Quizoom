import { describe, it, expect } from "vitest";
import { next } from "./phase-machine";
import type { HostCommand } from "../../shared/protocol";
import type { LivePhase, OptionId, QuestionId, QuestionSnapshot } from "../../shared/domain-types";

function question(id: string, orderIndex: number): QuestionSnapshot {
  return {
    id: id as QuestionId,
    orderIndex,
    body: `question ${id}`,
    imageAssetId: null,
    timeLimitSec: 30,
    explanation: `explanation ${id}`,
    options: [
      { id: "a" as OptionId, label: "A", orderIndex: 0 },
      { id: "b" as OptionId, label: "B", orderIndex: 1 },
    ],
    correctOptionId: "a" as OptionId,
  };
}

const q1 = question("q1", 0);
const q2 = question("q2", 1);
const questions = [q1, q2];

function command(type: HostCommand["type"]): HostCommand {
  return { type } as HostCommand;
}

describe("PhaseMachine.next", () => {
  it("rejects an invalid transition (closeQuestion from lobby) as INVALID_PHASE", () => {
    const result = next({ kind: "lobby" }, command("closeQuestion"), { now: 0, questions });
    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_PHASE", current: "lobby", command: "closeQuestion" },
    });
  });

  it("transitions lobby -> ready on startSession, pointing at the first question", () => {
    const result = next({ kind: "lobby" }, command("startSession"), { now: 1000, questions });
    expect(result).toEqual({
      ok: true,
      value: { phase: { kind: "ready", nextQuestionId: "q1" }, alarm: { kind: "noop" } },
    });
  });

  it("transitions ready -> questionOpen on openQuestion and sets the alarm to the deadline", () => {
    const result = next({ kind: "ready", nextQuestionId: "q1" as QuestionId }, command("openQuestion"), {
      now: 1000,
      questions,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        phase: { kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 1000 + 30_000 },
        alarm: { kind: "set", at: 1000 + 30_000 },
      },
    });
  });

  it("transitions questionOpen -> questionClosed on closeQuestion and clears the alarm", () => {
    const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 1000, deadlineAt: 31_000 };
    const result = next(open, command("closeQuestion"), { now: 15_000, questions });
    expect(result).toEqual({
      ok: true,
      value: {
        phase: { kind: "questionClosed", questionId: "q1", openedAt: 1000 },
        alarm: { kind: "clear" },
      },
    });
  });

  describe("pause / resume", () => {
    it("stops the countdown on pause, clearing the alarm and recording the remaining time", () => {
      const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 1000, deadlineAt: 31_000 };
      const result = next(open, command("pause"), { now: 21_000, questions });
      expect(result).toEqual({
        ok: true,
        value: {
          phase: { kind: "paused", resumeTo: open, remainingMs: 10_000 },
          alarm: { kind: "clear" },
        },
      });
    });

    it("continues from the remaining time on resume, setting a fresh alarm", () => {
      const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 1000, deadlineAt: 31_000 };
      const paused: LivePhase = { kind: "paused", resumeTo: open, remainingMs: 10_000 };
      const result = next(paused, command("resume"), { now: 50_000, questions });
      expect(result).toEqual({
        ok: true,
        value: {
          phase: { kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 60_000 },
          alarm: { kind: "set", at: 60_000 },
        },
      });
    });

    it("rejects pause from any phase other than questionOpen", () => {
      const result = next({ kind: "ready", nextQuestionId: "q1" as QuestionId }, command("pause"), { now: 0, questions });
      expect(result.ok).toBe(false);
    });
  });

  describe("reopenQuestion", () => {
    it("allows reopening from questionClosed, keeping the original openedAt and extending the deadline", () => {
      const closed: LivePhase = { kind: "questionClosed", questionId: "q1" as QuestionId, openedAt: 1000 };
      const result = next(closed, command("reopenQuestion"), { now: 40_000, questions });
      expect(result).toEqual({
        ok: true,
        value: {
          phase: { kind: "questionOpen", questionId: "q1", openedAt: 1000, deadlineAt: 40_000 + 30_000 },
          alarm: { kind: "set", at: 40_000 + 30_000 },
        },
      });
    });

    it("rejects reopening a revealed question with ALREADY_REVEALED", () => {
      const revealed: LivePhase = { kind: "revealed", questionId: "q1" as QuestionId };
      const result = next(revealed, command("reopenQuestion"), { now: 0, questions });
      expect(result).toEqual({ ok: false, error: { code: "ALREADY_REVEALED" } });
    });
  });

  describe("revealAnswer", () => {
    it("transitions questionClosed -> revealed without touching the alarm", () => {
      const closed: LivePhase = { kind: "questionClosed", questionId: "q1" as QuestionId, openedAt: 1000 };
      const result = next(closed, command("revealAnswer"), { now: 40_000, questions });
      expect(result).toEqual({
        ok: true,
        value: { phase: { kind: "revealed", questionId: "q1" }, alarm: { kind: "noop" } },
      });
    });
  });

  describe("nextQuestion", () => {
    it("advances revealed -> ready with the following question when one remains", () => {
      const revealed: LivePhase = { kind: "revealed", questionId: "q1" as QuestionId };
      const result = next(revealed, command("nextQuestion"), { now: 0, questions });
      expect(result).toEqual({
        ok: true,
        value: { phase: { kind: "ready", nextQuestionId: "q2" }, alarm: { kind: "noop" } },
      });
    });

    it("returns NO_NEXT_QUESTION when the revealed question was the last one", () => {
      const revealed: LivePhase = { kind: "revealed", questionId: "q2" as QuestionId };
      const result = next(revealed, command("nextQuestion"), { now: 0, questions });
      expect(result).toEqual({ ok: false, error: { code: "NO_NEXT_QUESTION" } });
    });

    it("only accepts finalize once the last question's nextQuestion is exhausted", () => {
      const revealed: LivePhase = { kind: "revealed", questionId: "q2" as QuestionId };
      expect(next(revealed, command("nextQuestion"), { now: 0, questions }).ok).toBe(false);
      expect(next(revealed, command("finalize"), { now: 0, questions })).toEqual({
        ok: true,
        value: { phase: { kind: "finalRanking" }, alarm: { kind: "clear" } },
      });
    });

    it("carries the resolved nextQuestionId through interimRanking", () => {
      const revealed: LivePhase = { kind: "revealed", questionId: "q1" as QuestionId };
      const shown = next(revealed, command("showRanking"), { now: 0, questions });
      expect(shown).toEqual({
        ok: true,
        value: { phase: { kind: "interimRanking", nextQuestionId: "q2" }, alarm: { kind: "noop" } },
      });

      const interim: LivePhase = { kind: "interimRanking", nextQuestionId: "q2" as QuestionId };
      const advanced = next(interim, command("nextQuestion"), { now: 0, questions });
      expect(advanced).toEqual({
        ok: true,
        value: { phase: { kind: "ready", nextQuestionId: "q2" }, alarm: { kind: "noop" } },
      });
    });

    it("returns NO_NEXT_QUESTION from interimRanking when there is no next question", () => {
      const interim: LivePhase = { kind: "interimRanking", nextQuestionId: null };
      const result = next(interim, command("nextQuestion"), { now: 0, questions });
      expect(result).toEqual({ ok: false, error: { code: "NO_NEXT_QUESTION" } });
    });
  });

  describe("finalize", () => {
    it("defensively clears the alarm when finalizing from interimRanking", () => {
      const interim: LivePhase = { kind: "interimRanking", nextQuestionId: null };
      const result = next(interim, command("finalize"), { now: 0, questions });
      expect(result).toEqual({
        ok: true,
        value: { phase: { kind: "finalRanking" }, alarm: { kind: "clear" } },
      });
    });

    it("rejects any command once finalRanking is reached", () => {
      const result = next({ kind: "finalRanking" }, command("nextQuestion"), { now: 0, questions });
      expect(result.ok).toBe(false);
    });
  });
});
