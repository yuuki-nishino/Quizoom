import { describe, it, expect } from "vitest";
import { buildRevealBatches, maxRevealStep, isTopStage, revealedTopCount } from "./ranking-batches";
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

  it("chunks 6th-place-and-below into groups of 5 counting from rank 1 (fixed boundaries: 6-10, 11-15, ...), revealing worst-to-best (34 participants)", () => {
    // 6位以降は1位から数えて5人単位(6-10,11-15,16-20,21-25,26-30,31-34)に区切り、
    // 端数(31-34の4人)は最下位側のグループとして最初に発表される
    const batches = buildRevealBatches(entries(34));
    expect(batches.map((b) => b.entries.map((e) => e.rank))).toEqual([
      [31, 32, 33, 34],
      [26, 27, 28, 29, 30],
      [21, 22, 23, 24, 25],
      [16, 17, 18, 19, 20],
      [11, 12, 13, 14, 15],
      [6, 7, 8, 9, 10],
      [1, 2, 3, 4, 5],
    ]);
  });

  it("keeps the leftover (non-multiple-of-5) bottom group aligned to rank-1-counted boundaries (23 participants)", () => {
    // 23人: 6位以降(18人)を1位から数えて5人単位に区切ると6-10,11-15,16-20,21-23(端数3人)。
    // 端数は最下位側のグループとなり、最初に発表される
    const batches = buildRevealBatches(entries(23));
    expect(batches.map((b) => b.entries.map((e) => e.rank))).toEqual([
      [21, 22, 23],
      [16, 17, 18, 19, 20],
      [11, 12, 13, 14, 15],
      [6, 7, 8, 9, 10],
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

describe("maxRevealStep / isTopStage / revealedTopCount（要件15.3, 15.4, 15.8, Issue #16再フォローアップ）", () => {
  it("counts the bottom groups plus one step per top-5 entry (12 participants: 2 bottom groups + 5 top entries)", () => {
    const batches = buildRevealBatches(entries(12)); // [11,12],[6-10],[1-5]
    // restCount=2 (2 bottom groups) + (topCount-1)=4 -> 6
    expect(maxRevealStep(batches)).toBe(6);
  });

  it("is not yet on the top stage while a bottom group is showing", () => {
    const batches = buildRevealBatches(entries(12));
    expect(isTopStage(batches, 0)).toBe(false);
    expect(isTopStage(batches, 1)).toBe(false);
    expect(revealedTopCount(batches, 0)).toBe(0);
    expect(revealedTopCount(batches, 1)).toBe(0);
  });

  it("reveals the top-5 group one person at a time, from the bottom (rank5) up to rank1", () => {
    const batches = buildRevealBatches(entries(12)); // restCount=2
    expect(isTopStage(batches, 2)).toBe(true);
    expect(revealedTopCount(batches, 2)).toBe(1); // rank5だけ発表済み
    expect(revealedTopCount(batches, 3)).toBe(2); // rank5,4
    expect(revealedTopCount(batches, 4)).toBe(3);
    expect(revealedTopCount(batches, 5)).toBe(4);
    expect(revealedTopCount(batches, 6)).toBe(5); // 全員(1位まで)発表済み = maxRevealStep
  });

  it("starts the top stage immediately (step 0) when there are 5 or fewer participants", () => {
    const batches = buildRevealBatches(entries(3));
    expect(isTopStage(batches, 0)).toBe(true);
    expect(revealedTopCount(batches, 0)).toBe(1);
    expect(maxRevealStep(batches)).toBe(2); // 3人 -> steps 0,1,2 (rank3,2,1の順)
    expect(revealedTopCount(batches, 2)).toBe(3);
  });

  it("treats an empty batch list (no participants) as step 0 with nothing to reveal", () => {
    expect(maxRevealStep([])).toBe(0);
    expect(isTopStage([], 0)).toBe(false);
    expect(revealedTopCount([], 0)).toBe(0);
  });
});
