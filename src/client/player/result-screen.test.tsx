import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FinalResultScreen, ResultScreen } from "./result-screen";
import type { PersonalResult } from "../../shared/protocol";

const personalResult: PersonalResult = { isCorrect: true, correctCount: 3, rank: 2 };

describe("ResultScreen", () => {
  it("shows nothing when no personal result is available", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={null} isPractice={false} />);
    expect(markup).toBe("");
  });

  it("shows correctness and the current correct count, but never the interim rank, from the interim personal result", () => {
    const markup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} isPractice={false} />);
    expect(markup).toContain("正解です");
    expect(markup).toContain("現在の正解数: 3");
    // 途中順位は最終結果発表のネタバレになるため表示しない（要件7.6・Issue #28）
    expect(markup).not.toContain("現在の順位");
    expect(markup).not.toContain("2位");
  });

  it("shows an incorrect message when isCorrect is false", () => {
    const markup = renderToStaticMarkup(
      <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} isPractice={false} />,
    );
    expect(markup).toContain("不正解でした");
  });

  it("plays a celebratory effect only when the interim answer was correct", () => {
    const correctMarkup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} isPractice={false} />);
    expect(correctMarkup).toContain("quiz-confetti");

    const incorrectMarkup = renderToStaticMarkup(
      <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} isPractice={false} />,
    );
    expect(incorrectMarkup).not.toContain("quiz-confetti");
  });

  describe("テスト問題の正解発表（要件3.3, 3.6）", () => {
    it("shows correctness and a practice notice, without the real scoring numbers, when isPractice is true", () => {
      const markup = renderToStaticMarkup(<ResultScreen personalResult={personalResult} isPractice={true} />);
      expect(markup).toContain("テスト問題");
      expect(markup).toContain("正解です");
      expect(markup).not.toContain("現在の正解数");
      expect(markup).not.toContain("現在の順位");
    });

    it("shows an incorrect message for a practice miss, still without real scoring numbers", () => {
      const markup = renderToStaticMarkup(
        <ResultScreen personalResult={{ ...personalResult, isCorrect: false }} isPractice={true} />,
      );
      expect(markup).toContain("不正解でした");
      expect(markup).not.toContain("現在の正解数");
    });
  });
});

describe("FinalResultScreen（要件7.9, Issue #34）", () => {
  it("hides the rank, correct count and total time behind ？？？ until the participant is revealed on stage", () => {
    const markup = renderToStaticMarkup(<FinalResultScreen personalRank={null} />);
    expect(markup).toContain("最終結果");
    expect(markup).toContain("あなたの順位: ？？？");
    expect(markup).toContain("正解数: ？？？");
    expect(markup).toContain("合計回答時間: ？？？");
    expect(markup).not.toContain("quiz-confetti");
  });

  it("keeps hiding the result when only an interim (non-final) personal rank is held", () => {
    const markup = renderToStaticMarkup(<FinalResultScreen personalRank={{ rank: 4, correctCount: 3, totalElapsedMs: 8_000, isFinal: false }} />);
    expect(markup).toContain("あなたの順位: ？？？");
    expect(markup).not.toContain("4位");
  });

  it("shows the final rank, correct count and total time with a celebration once revealed", () => {
    const markup = renderToStaticMarkup(<FinalResultScreen personalRank={{ rank: 1, correctCount: 5, totalElapsedMs: 12_300, isFinal: true }} />);
    expect(markup).toContain("最終結果");
    expect(markup).toContain("あなたの順位: 1位");
    expect(markup).toContain("正解数: 5");
    expect(markup).toContain("12.3秒");
    expect(markup).not.toContain("？？？");
    expect(markup).toContain("quiz-confetti");
  });
});
