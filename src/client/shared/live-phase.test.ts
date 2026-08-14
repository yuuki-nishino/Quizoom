import { describe, it, expect } from "vitest";
import { currentDeadlineAt, pausedRemainingMs } from "./live-phase";
import type { LivePhase, QuestionId } from "../../shared/domain-types";

describe("currentDeadlineAt", () => {
  it("returns the deadline only while questionOpen", () => {
    const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 0, deadlineAt: 1000 };
    const closed: LivePhase = { kind: "questionClosed", questionId: "q1" as QuestionId, openedAt: 0 };
    expect(currentDeadlineAt(open)).toBe(1000);
    expect(currentDeadlineAt(closed)).toBeNull();
    expect(currentDeadlineAt(null)).toBeNull();
  });
});

describe("pausedRemainingMs", () => {
  it("returns the frozen remaining time only while paused", () => {
    const open: LivePhase = { kind: "questionOpen", questionId: "q1" as QuestionId, openedAt: 0, deadlineAt: 1000 };
    const paused: LivePhase = { kind: "paused", resumeTo: open, remainingMs: 500 };
    expect(pausedRemainingMs(paused)).toBe(500);
    expect(pausedRemainingMs(open)).toBeNull();
  });
});
