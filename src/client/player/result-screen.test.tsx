import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ResultScreen } from "./result-screen";
import type { PersonalResult } from "../../shared/protocol";

const personalResult: PersonalResult = { isCorrect: true, correctCount: 3, rank: 2 };

describe("ResultScreen", () => {
  it("shows nothing when neither a personal result nor a personal rank is available", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={null} personalRank={null} isPractice={false} />);
    expect(markup).toBe("");
  });

  it("shows correctness, current correct count, and current rank from the interim personal result", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} personalRank={null} isPractice={false} />);
    expect(markup).toContain("正解です");
    expect(markup).toContain("現在の正解数: 3");
    expect(markup).toContain("現在の順位: 2位");
  });

  it("shows an incorrect message when isCorrect is false", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} personalRank={null} isPractice={false} />,
    );
    expect(markup).toContain("不正解でした");
  });

  it("plays a celebratory effect only when the interim answer was correct", () => {
    const correctMarkup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} personalRank={null} isPractice={false} />);
    expect(correctMarkup).toContain("quiz-confetti");

    const incorrectMarkup = renderToStaticMarkup(
      <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} personalRank={null} isPractice={false} />,
    );
    expect(incorrectMarkup).not.toContain("quiz-confetti");
  });

  it("prioritizes the final ranking over the interim personal result once isFinal is true", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen
        personalResult={personalResult}
        personalRank={{ rank: 1, correctCount: 5, totalElapsedMs: 12_300, isFinal: true }}
        isPractice={false}
      />,
    );
    expect(markup).toContain("最終結果");
    expect(markup).toContain("あなたの順位: 1位");
    expect(markup).toContain("正解数: 5");
    expect(markup).toContain("12.3秒");
    expect(markup).not.toContain("現在の順位");
    expect(markup).toContain("quiz-confetti");
  });

  it("shows the interim personal result when a non-final personal rank is present", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen
        personalResult={personalResult}
        personalRank={{ rank: 4, correctCount: 3, totalElapsedMs: 8_000, isFinal: false }}
        isPractice={false}
      />,
    );
    expect(markup).toContain("現在の順位: 2位");
    expect(markup).not.toContain("最終結果");
  });

  describe("テスト問題の正解発表（要件3.3, 3.6）", () => {
    it("shows correctness and a practice notice, without the real scoring numbers, when isPractice is true", () => {
      const markup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} personalRank={null} isPractice={true} />);
      expect(markup).toContain("テスト問題");
      expect(markup).toContain("正解です");
      expect(markup).not.toContain("現在の正解数");
      expect(markup).not.toContain("現在の順位");
    });

    it("shows an incorrect message for a practice miss, still without real scoring numbers", () => {
      const markup = renderToStaticMarkup(
        <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} personalRank={null} isPractice={true} />,
      );
      expect(markup).toContain("不正解でした");
      expect(markup).not.toContain("現在の正解数");
    });
  });
});
