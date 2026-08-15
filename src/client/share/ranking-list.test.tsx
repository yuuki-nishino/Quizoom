import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RankingList } from "./ranking-list";
import type { PublicResultEntry } from "../../shared/domain-types";

describe("RankingList", () => {
  it("shows every entry sorted by rank, regardless of input order", () => {
    const entries: PublicResultEntry[] = [
      { rank: 2, nickname: "bob", correctCount: 2, totalElapsedMs: 5000 },
      { rank: 1, nickname: "alice", correctCount: 3, totalElapsedMs: 4200 },
    ];
    const markup = renderToStaticMarkup(<RankingList entries={entries} />);
    expect(markup.indexOf("alice")).toBeLessThan(markup.indexOf("bob"));
    expect(markup).toContain("1位");
    expect(markup).toContain("2位");
  });

  it("renders an empty list without error when there are no entries", () => {
    const markup = renderToStaticMarkup(<RankingList entries={[]} />);
    expect(markup).toContain("<ol");
  });
});
