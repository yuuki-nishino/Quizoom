import { describe, it, expect } from "vitest";
import { buildRevealSchedule } from "./ranking-reveal";

describe("buildRevealSchedule（要件15.1, 15.2）", () => {
  it("returns an empty schedule for zero entries", () => {
    expect(buildRevealSchedule(0)).toEqual([]);
  });

  it("reveals ranks from lowest to highest (index count-1 down to 0)", () => {
    const schedule = buildRevealSchedule(5);
    expect(schedule.map((s) => s.index)).toEqual([4, 3, 2, 1, 0]);
  });

  it("gives the top 3 (index 0, 1, 2) a longer delay than the rest", () => {
    const schedule = buildRevealSchedule(6);
    const byIndex = new Map(schedule.map((s) => [s.index, s.delayMs]));
    const top3Delays = [byIndex.get(0)!, byIndex.get(1)!, byIndex.get(2)!];
    const restDelays = [byIndex.get(3)!, byIndex.get(4)!, byIndex.get(5)!];
    for (const top3 of top3Delays) {
      for (const rest of restDelays) {
        expect(top3).toBeGreaterThan(rest);
      }
    }
  });

  it("makes rank 1 (index 0) the single longest delay, building the most suspense last", () => {
    const schedule = buildRevealSchedule(8);
    const byIndex = new Map(schedule.map((s) => [s.index, s.delayMs]));
    const rank1Delay = byIndex.get(0)!;
    for (const [index, delayMs] of byIndex) {
      if (index !== 0) expect(delayMs).toBeLessThan(rank1Delay);
    }
  });

  it("handles a single entry as just rank 1", () => {
    expect(buildRevealSchedule(1)).toEqual([{ index: 0, delayMs: expect.any(Number) }]);
  });

  it("produces every delay as a positive number", () => {
    const schedule = buildRevealSchedule(10);
    for (const step of schedule) {
      expect(step.delayMs).toBeGreaterThan(0);
    }
  });
});
