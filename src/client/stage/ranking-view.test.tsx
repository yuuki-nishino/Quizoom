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

  it("plays the celebratory effect only for the final ranking, not the interim one", () => {
    const interim = renderToStaticMarkup(<RankingView entries={entries()} isFinal={false} />);
    expect(interim).not.toContain("quiz-confetti");

    const final = renderToStaticMarkup(<RankingView entries={entries()} isFinal={true} />);
    expect(final).toContain("quiz-confetti");
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
});
