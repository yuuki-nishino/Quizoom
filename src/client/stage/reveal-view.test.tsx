import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealView } from "./reveal-view";
import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import type { AssetId, OptionId, QuestionId } from "../../shared/domain-types";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "2+2は？",
  imageAssetId: null,
  options: [
    { id: "o1" as OptionId, label: "3", orderIndex: 0, imageAssetId: null },
    { id: "o2" as OptionId, label: "4", orderIndex: 1, imageAssetId: null },
  ],
};

const closed: QuestionClosedPayload = {
  questionId: "q1" as QuestionId,
  correctOptionId: "o2" as OptionId,
  distribution: [
    { optionId: "o1" as OptionId, count: 1 },
    { optionId: "o2" as OptionId, count: 3 },
  ],
  explanation: "2+2=4です",
  personalResult: null,
};

describe("RevealView", () => {
  it("highlights the correct option and shows distribution percentages and the explanation", () => {
    const markup = renderToStaticMarkup(<RevealView question={question} closed={closed} />);
    expect(markup).toContain("2+2=4です");
    expect(markup).toContain("正解");
    expect(markup).toContain("<svg");
    expect(markup).toMatch(/data-correct="true" class="stage-option-correct[^"]*"/);
    expect(markup).toContain("1人（25%）");
    expect(markup).toContain("3人（75%）");
  });

  it("plays a one-shot celebratory effect when the correct answer is revealed", () => {
    const markup = renderToStaticMarkup(<RevealView question={question} closed={closed} />);
    expect(markup).toContain("quiz-confetti");
  });

  it("shows a テスト問題 badge when revealing the practice question（要件3.3, 3.6）", () => {
    const practiceQuestion: QuestionPublicView = { ...question, id: PRACTICE_QUESTION_ID };
    const practiceClosed: QuestionClosedPayload = { ...closed, questionId: PRACTICE_QUESTION_ID };
    const markup = renderToStaticMarkup(<RevealView question={practiceQuestion} closed={practiceClosed} />);
    expect(markup).toContain("テスト問題");
  });

  it("does not show the badge for a real question", () => {
    const markup = renderToStaticMarkup(<RevealView question={question} closed={closed} />);
    expect(markup).not.toContain("テスト問題");
  });

  describe("choice images (Issue #36)", () => {
    const imageQuestion = (count: 2 | 4): QuestionPublicView => ({
      ...question,
      options: ["りんご", "みかん", "ぶどう", "もも"].slice(0, count).map((label, i) => ({
        id: `o${i + 1}` as OptionId,
        label,
        orderIndex: i,
        imageAssetId: `img${i + 1}` as AssetId,
      })),
    });
    const imageClosed = (count: 2 | 4): QuestionClosedPayload => ({
      ...closed,
      correctOptionId: "o2" as OptionId,
      distribution: Array.from({ length: count }, (_, i) => ({ optionId: `o${i + 1}` as OptionId, count: i === 1 ? 3 : 1 })),
    });
    const urls = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`o${i + 1}`, `/media/img${i + 1}?token=t`]));
    const imgCount = (markup: string) => (markup.match(/<img/g) ?? []).length;

    it("shows every option's image, highlights the correct one, and keeps count and percentage for each", () => {
      const markup = renderToStaticMarkup(<RevealView question={imageQuestion(4)} closed={imageClosed(4)} optionImageUrls={urls(4)} />);
      expect(imgCount(markup)).toBe(4);
      expect(markup).toContain('src="/media/img2?token=t"');
      expect((markup.match(/data-correct="true"/g) ?? []).length).toBe(1);
      expect((markup.match(/data-correct="false"/g) ?? []).length).toBe(3);
      expect(markup).toContain("3人（50%）");
      expect(markup).toContain("1人（17%）");
      expect(markup).toContain("2+2は？");
    });

    it("fits the screen without scrolling: clipped root, single row, clamped title and explanation", () => {
      const markup = renderToStaticMarkup(<RevealView question={imageQuestion(4)} closed={imageClosed(4)} optionImageUrls={urls(4)} />);
      expect(markup).toMatch(/class="stage-reveal-view stage-reveal-fit[^"]*overflow-hidden[^"]*"/);
      expect(markup).not.toMatch(/class="stage-reveal-view[^"]*overflow-y-auto/);
      expect(markup).toMatch(/class="stage-options[^"]*grid-cols-4[^"]*"/);
      expect(markup).toMatch(/<h1 class="[^"]*line-clamp-3[^"]*"/);
      expect(markup).toMatch(/class="stage-explanation[^"]*line-clamp-2[^"]*"/);
    });

    it("lays 2 options out in 2 columns", () => {
      const markup = renderToStaticMarkup(<RevealView question={imageQuestion(2)} closed={imageClosed(2)} optionImageUrls={urls(2)} />);
      expect(markup).toMatch(/class="stage-options[^"]*grid-cols-2[^"]*"/);
      expect(imgCount(markup)).toBe(2);
    });

    it("keeps the existing reveal for text-only questions", () => {
      const markup = renderToStaticMarkup(<RevealView question={question} closed={closed} />);
      expect(markup).not.toContain("stage-reveal-fit");
      expect(markup).toMatch(/class="stage-reveal-view[^"]*overflow-y-auto[^"]*"/);
    });
  });
});

