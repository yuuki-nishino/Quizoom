import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingView } from "./ranking-view";
import type { RankingEntry, ParticipantId } from "../../shared/domain-types";

function entries(): readonly RankingEntry[] {
  return [
    { participantId: "p1" as ParticipantId, nickname: "alice", correctCount: 3, totalElapsedMs: 4200, joinedSeq: 0, rank: 1 },
    { participantId: "p2" as ParticipantId, nickname: "bob", correctCount: 2, totalElapsedMs: 5000, joinedSeq: 1, rank: 2 },
  ];
}

describe("RankingView", () => {
  it("shows a plain heading for an interim ranking", () => {
    const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} />);
    expect(markup).toContain("中間ランキング");
    expect(markup).not.toContain("最終結果");
    expect(markup).toContain("alice");
    expect(markup).toContain("1位");
  });

  it("shows a celebratory heading and distinct styling for the final ranking", () => {
    const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} />);
    expect(markup).toContain("最終結果");
    expect(markup).toContain("stage-ranking-final");
  });

  it("never plays the celebratory effect for the interim ranking", () => {
    const interim = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} />);
    expect(interim).not.toContain("quiz-confetti");
  });

  it("limits the display to the top N entries", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      participantId: `p${i}` as ParticipantId,
      nickname: `player${i}`,
      correctCount: 1,
      totalElapsedMs: 1000,
      joinedSeq: i,
      rank: i + 1,
    }));
    const markup = renderToStaticMarkup(<RankingView entries={many} isFinal={false} topN={5} />);
    expect(markup).toContain("player4");
    expect(markup).not.toContain("player5");
  });

  describe("見栄えの安定性（要件13.1, 13.2, Issue #15）", () => {
    it("truncates a long nickname within a bounded flex child instead of letting it overflow", () => {
      const long = [{ ...entries()[0]!, nickname: "とてもながいにっくねーむをつけてしまったさんかしゃ" }];
      const markup = renderToStaticMarkup(<RankingView entries={long} isFinal={false} />);
      expect(markup).toMatch(/class="stage-nickname[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*"/);
    });

    it("keeps the rank-1 star badge on a single line without wrapping", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} />);
      expect(markup).toMatch(/class="stage-rank[^"]*\bwhitespace-nowrap\b[^"]*"/);
      expect(markup).not.toMatch(/class="stage-rank[^"]*\bw-14\b[^"]*"/);
    });
  });

  describe("最終結果の発表演出（要件15.1〜15.5, Issue #16）", () => {
    it("hides every nickname and score before the reveal timers have fired for a final ranking", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} />);
      expect(markup).not.toContain("alice");
      expect(markup).not.toContain("bob");
      // 順位バッジ(枠)自体はプレースホルダーとして表示され続ける
      expect(markup).toContain("1位");
      expect(markup).toContain("2位");
    });

    it("does not fire the celebratory effect before rank 1 has been revealed", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} />);
      expect(markup).not.toContain("quiz-confetti");
    });

    it("shows every nickname and score immediately for an interim ranking (no reveal staging)", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} />);
      expect(markup).toContain("alice");
      expect(markup).toContain("bob");
    });
  });
});
