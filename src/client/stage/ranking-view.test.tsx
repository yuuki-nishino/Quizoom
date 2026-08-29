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

/** "playerN"が markup に含まれるか判定する。"player1" は "player10" 等の部分文字列にもなるため、後続の数字が続かないことを確認する */
function containsPlayer(markup: string, rank: number): boolean {
  return new RegExp(`player${rank}(?!\\d)`).test(markup);
}

/** rank昇順のN件を生成する(joinedSeqも昇順)。バッチ分割のテスト用 */
function manyEntries(count: number): readonly RankingEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    participantId: `p${i + 1}` as ParticipantId,
    nickname: `player${i + 1}`,
    correctCount: 1,
    totalElapsedMs: 1000,
    joinedSeq: i,
    rank: i + 1,
  }));
}

describe("RankingView", () => {
  it("shows a plain heading for an interim ranking", () => {
    const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} revealStep={null} />);
    expect(markup).toContain("中間ランキング");
    expect(markup).not.toContain("最終結果");
    expect(markup).toContain("alice");
    expect(markup).toContain("1位");
  });

  it("shows a celebratory heading and distinct styling for the final ranking", () => {
    const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} revealStep={0} />);
    expect(markup).toContain("最終結果");
    expect(markup).toContain("stage-ranking-final");
  });

  it("never plays the celebratory effect for the interim ranking", () => {
    const interim = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} revealStep={null} />);
    expect(interim).not.toContain("quiz-confetti");
  });

  it("limits the interim display to the top N entries", () => {
    const many = manyEntries(15);
    const markup = renderToStaticMarkup(<RankingView entries={many} isFinal={false} revealStep={null} topN={5} />);
    expect(markup).toContain("player5");
    expect(markup).not.toMatch(/player6(?!\d)/);
  });

  describe("見栄えの安定性（要件13.1, 13.2, Issue #15）", () => {
    it("truncates a long nickname within a bounded flex child instead of letting it overflow", () => {
      const long = [{ ...entries()[0]!, nickname: "とてもながいにっくねーむをつけてしまったさんかしゃ" }];
      const markup = renderToStaticMarkup(<RankingView entries={long} isFinal={false} revealStep={null} />);
      expect(markup).toMatch(/class="stage-nickname[^"]*\bmin-w-0\b[^"]*\btruncate\b[^"]*"/);
    });

    it("keeps the rank-1 star badge on a single line without wrapping", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} revealStep={null} />);
      expect(markup).toMatch(/class="stage-rank[^"]*\bwhitespace-nowrap\b[^"]*"/);
      expect(markup).not.toMatch(/class="stage-rank[^"]*\bw-14\b[^"]*"/);
    });
  });

  describe("上位5位の個別発表演出（要件15.4〜15.6, Issue #16）", () => {
    it("hides every nickname and score before the reveal timers have fired, on the final (top-5) batch", () => {
      // 2人のみなので最初のbatch(revealStep=0)が既に最終(上位5位)段階になる
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} revealStep={0} />);
      expect(markup).not.toContain("alice");
      expect(markup).not.toContain("bob");
      // 順位バッジ(枠)自体はプレースホルダーとして表示され続ける
      expect(markup).toContain("1位");
      expect(markup).toContain("2位");
    });

    it("does not fire the celebratory effect before rank 1 has been revealed", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} revealStep={0} />);
      expect(markup).not.toContain("quiz-confetti");
    });

    it("shows every nickname and score immediately for an interim ranking (no reveal staging)", () => {
      const markup = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} revealStep={null} />);
      expect(markup).toContain("alice");
      expect(markup).toContain("bob");
    });
  });

  describe("6位以下のグループ発表（要件15.1, 15.2, 15.3, Issue #16フォローアップ）", () => {
    it("shows only the current bottom batch's entries immediately, without placeholders (12 participants, revealStep=0)", () => {
      // 12人: rest=6〜12位(7人) -> [8-12],[6,7] の2バッチ、その後に上位5位。revealStep=0は最下位バッチ(8〜12位)
      const markup = renderToStaticMarkup(<RankingView entries={manyEntries(12)} isFinal={true} revealStep={0} />);
      for (const rank of [8, 9, 10, 11, 12]) {
        expect(containsPlayer(markup, rank)).toBe(true);
      }
      for (const rank of [1, 2, 3, 4, 5, 6, 7]) {
        expect(containsPlayer(markup, rank)).toBe(false);
      }
      expect(markup).not.toContain("？？？");
    });

    it("switches to the next bottom batch on revealStep=1, no longer showing the previous batch", () => {
      const markup = renderToStaticMarkup(<RankingView entries={manyEntries(12)} isFinal={true} revealStep={1} />);
      expect(containsPlayer(markup, 6)).toBe(true);
      expect(containsPlayer(markup, 7)).toBe(true);
      for (const rank of [1, 2, 3, 4, 5, 8, 9, 10, 11, 12]) {
        expect(containsPlayer(markup, rank)).toBe(false);
      }
    });

    it("reaches the final (top-5, staged) batch only once every bottom batch has been shown", () => {
      // 12人の場合、バッチは[8-12],[6,7],[1-5]の3つ。revealStep=2で初めて上位5位の個別発表段階になる
      const markup = renderToStaticMarkup(<RankingView entries={manyEntries(12)} isFinal={true} revealStep={2} />);
      // 上位5位段階はまだ何も発表されていない(プレースホルダー)ため名前は一切出ない
      for (let rank = 1; rank <= 12; rank++) {
        expect(containsPlayer(markup, rank)).toBe(false);
      }
      expect(markup).toContain("1位");
      expect(markup).toContain("5位");
    });

    it("does not apply podium (top-3) styling to a bottom batch's rows", () => {
      const markup = renderToStaticMarkup(<RankingView entries={manyEntries(12)} isFinal={true} revealStep={0} />);
      expect(markup).not.toContain("bg-amber-300");
      expect(markup).not.toContain("bg-slate-200");
      expect(markup).not.toContain("bg-orange-200");
    });

    it("falls back to the first batch when revealStep is null for a final ranking", () => {
      const markup = renderToStaticMarkup(<RankingView entries={manyEntries(12)} isFinal={true} revealStep={null} />);
      for (const rank of [8, 9, 10, 11, 12]) {
        expect(markup).toContain(`player${rank}`);
      }
    });
  });
});
