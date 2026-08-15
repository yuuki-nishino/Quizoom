import { describe, it, expect } from "vitest";
import { isLateJoin } from "./late-join";

describe("isLateJoin", () => {
  it("is false when the initial phase is lobby (joined before the event started)", () => {
    expect(isLateJoin("lobby")).toBe(false);
  });

  it("is false when the initial phase is ready (started but no question opened yet)", () => {
    expect(isLateJoin("ready")).toBe(false);
  });

  it("is true for any phase past ready, since at least one question has already opened", () => {
    expect(isLateJoin("questionOpen")).toBe(true);
    expect(isLateJoin("questionClosed")).toBe(true);
    expect(isLateJoin("revealed")).toBe(true);
    expect(isLateJoin("interimRanking")).toBe(true);
    expect(isLateJoin("paused")).toBe(true);
    expect(isLateJoin("finalRanking")).toBe(true);
  });

  it("is false when the phase has not been observed yet", () => {
    expect(isLateJoin(null)).toBe(false);
  });
});
