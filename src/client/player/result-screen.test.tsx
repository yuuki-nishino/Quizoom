import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultScreen } from "./result-screen";
import type { PersonalResult } from "../../shared/protocol";

const personalResult: PersonalResult = { isCorrect: true, correctCount: 3, rank: 2 };

describe("ResultScreen", () => {
  it("shows nothing when neither a personal result nor a personal rank is available", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={null} personalRank={null} />);
    expect(markup).toBe("");
  });

  it("shows correctness, current correct count, and current rank from the interim personal result", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} personalRank={null} />);
    expect(markup).toContain("正解です");
    expect(markup).toContain("現在の正解数: 3");
    expect(markup).toContain("現在の順位: 2位");
  });

  it("shows an incorrect message when isCorrect is false", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={{ ...personalResult, isCorrect: false }} personalRank={null} />);
    expect(markup).toContain("不正解でした");
  });

  it("prioritizes the final ranking over the interim personal result once isFinal is true", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen personalResult={personalResult} personalRank={{ rank: 1, correctCount: 5, totalElapsedMs: 12_300, isFinal: true }} />,
    );
    expect(markup).toContain("最終結果");
    expect(markup).toContain("あなたの順位: 1位");
    expect(markup).toContain("正解数: 5");
    expect(markup).toContain("12.3秒");
    expect(markup).not.toContain("現在の順位");
  });

  it("shows the interim personal result when a non-final personal rank is present", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen personalResult={personalResult} personalRank={{ rank: 4, correctCount: 3, totalElapsedMs: 8_000, isFinal: false }} />,
    );
    expect(markup).toContain("現在の順位: 2位");
    expect(markup).not.toContain("最終結果");
  });
});
