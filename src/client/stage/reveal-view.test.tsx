import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealView } from "./reveal-view";
import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import type { OptionId, QuestionId } from "../../shared/domain-types";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "2+2は？",
  imageAssetId: null,
  options: [
    { id: "o1" as OptionId, label: "3", orderIndex: 0 },
    { id: "o2" as OptionId, label: "4", orderIndex: 1 },
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
});
