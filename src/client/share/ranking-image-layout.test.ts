import { describe, it, expect } from "vitest";
import { computeRankingImageLayout, RANKING_IMAGE_WIDTH } from "./ranking-image-layout";
import type { PublicResult } from "../../shared/domain-types";

function result(overrides: Partial<PublicResult> = {}): PublicResult {
  return {
    eventTitle: "Quiz Night",
    theme: { primaryColor: "#111", accentColor: "#222", backgroundColor: "#fff", textColor: "#000" },
    finalizedAt: 1700000000000,
    entries: [
      { rank: 2, nickname: "bob", correctCount: 2, totalElapsedMs: 5000 },
      { rank: 1, nickname: "alice", correctCount: 3, totalElapsedMs: 4200 },
      { rank: 3, nickname: "carol", correctCount: 1, totalElapsedMs: 6000 },
    ],
    ...overrides,
  };
}

describe("computeRankingImageLayout", () => {
  it("sorts rows by rank ascending regardless of input order", () => {
    const layout = computeRankingImageLayout(result());
    expect(layout.rows.map((r) => r.nickname)).toEqual(["alice", "bob", "carol"]);
  });

  it("carries the event title, a fixed subtitle, and the theme through unchanged", () => {
    const layout = computeRankingImageLayout(result());
    expect(layout.title).toBe("Quiz Night");
    expect(layout.subtitle).toBe("最終ランキング");
    expect(layout.theme).toEqual({ primaryColor: "#111", accentColor: "#222", backgroundColor: "#fff", textColor: "#000" });
  });

  it("formats each row's detail as correct count and elapsed time in seconds", () => {
    const layout = computeRankingImageLayout(result());
    const alice = layout.rows.find((r) => r.nickname === "alice");
    expect(alice?.detail).toBe("正解数 3 / 4.2秒");
  });

  it("limits rows to the top N entries by rank", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      rank: i + 1,
      nickname: `player${i}`,
      correctCount: 1,
      totalElapsedMs: 1000,
    }));
    const layout = computeRankingImageLayout(result({ entries: many }), 5);
    expect(layout.rows).toHaveLength(5);
    expect(layout.rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it("uses a fixed image width and grows height with the row count", () => {
    const oneRow = computeRankingImageLayout(result({ entries: [result().entries[0]!] }));
    const threeRows = computeRankingImageLayout(result());
    expect(oneRow.width).toBe(RANKING_IMAGE_WIDTH);
    expect(threeRows.height).toBeGreaterThan(oneRow.height);
  });

  it("produces monotonically increasing y positions for successive rows", () => {
    const layout = computeRankingImageLayout(result());
    const ys = layout.rows.map((r) => r.y);
    expect(ys[1]).toBeGreaterThan(ys[0]!);
    expect(ys[2]).toBeGreaterThan(ys[1]!);
  });

  it("returns no rows for an empty entries list", () => {
    const layout = computeRankingImageLayout(result({ entries: [] }));
    expect(layout.rows).toEqual([]);
  });
});
