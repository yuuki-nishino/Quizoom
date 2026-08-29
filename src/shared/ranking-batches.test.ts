import { describe, it, expect } from "vitest";
import { buildRevealBatches, isFinalBatchStep } from "./ranking-batches";
import type { RankingEntry, ParticipantId } from "./domain-types";

function entries(count: number): readonly RankingEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    participantId: `p${i + 1}` as ParticipantId,
    nickname: `player${i + 1}`,
    correctCount: count - i,
    totalElapsedMs: 1000,
    joinedSeq: i,
    rank: i + 1,
  }));
}

describe("buildRevealBatches（要件15.1, 15.2）", () => {
  it("returns no batches for zero participants", () => {
    expect(buildRevealBatches([])).toEqual([]);
  });

  it("puts everyone into a single top-stage batch when there are 5 or fewer participants", () => {
    const batches = buildRevealBatches(entries(3));
    expect(batches).toHaveLength(1);
    expect(batches[0]!.entries.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it("still produces a single top-stage batch for exactly 5 participants (no rest groups)", () => {
    const batches = buildRevealBatches(entries(5));
    expect(batches).toHaveLength(1);
    expect(batches[0]!.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("groups a single leftover 6th-place entry into its own bottom batch before the top-5 stage", () => {
    const batches = buildRevealBatches(entries(6));
    expect(batches).toHaveLength(2);
    expect(batches[0]!.entries.map((e) => e.rank)).toEqual([6]);
    expect(batches[1]!.entries.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("chunks 6th-place-and-below into groups of 5 counting from the bottom, ending with the top-5 stage (34 participants)", () => {
    const batches = buildRevealBatches(entries(34));
    expect(batches.map((b) => b.entries.map((e) => e.rank))).toEqual([
      [30, 31, 32, 33, 34],
      [25, 26, 27, 28, 29],
      [20, 21, 22, 23, 24],
      [15, 16, 17, 18, 19],
      [10, 11, 12, 13, 14],
      [6, 7, 8, 9],
      [1, 2, 3, 4, 5],
    ]);
  });

  it("produces exactly two full bottom groups plus the top-5 stage for 15 participants", () => {
    const batches = buildRevealBatches(entries(15));
    expect(batches.map((b) => b.entries.map((e) => e.rank))).toEqual([
      [11, 12, 13, 14, 15],
      [6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5],
    ]);
  });
});

describe("isFinalBatchStep（要件15.8）", () => {
  it("is true only for the last batch index (the top-5 stage)", () => {
    const batches = buildRevealBatches(entries(34));
    expect(isFinalBatchStep(batches, 0)).toBe(false);
    expect(isFinalBatchStep(batches, batches.length - 2)).toBe(false);
    expect(isFinalBatchStep(batches, batches.length - 1)).toBe(true);
  });

  it("is true immediately when there are 5 or fewer participants (single batch)", () => {
    const batches = buildRevealBatches(entries(3));
    expect(isFinalBatchStep(batches, 0)).toBe(true);
  });

  it("is false for an empty batch list (no participants)", () => {
    expect(isFinalBatchStep([], 0)).toBe(false);
  });
});
