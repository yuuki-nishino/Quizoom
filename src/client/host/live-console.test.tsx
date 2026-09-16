import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RevealSummary } from "./live-console";
import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import type { OptionId, QuestionId } from "../../shared/domain-types";

const question: QuestionPublicView = {
  id: "q1" as QuestionId,
  orderIndex: 0,
  body: "日本の首都は？",
  imageAssetId: null,
  options: [
    { id: "3f2b0c1e-9a44-4d3e-8b7a-1c2d3e4f5a6b" as OptionId, label: "東京", orderIndex: 0 },
    { id: "7c9d8e5a-2b31-4f60-9c8d-0a1b2c3d4e5f" as OptionId, label: "大阪", orderIndex: 1 },
  ],
};

const closed: QuestionClosedPayload = {
  questionId: "q1" as QuestionId,
  correctOptionId: "3f2b0c1e-9a44-4d3e-8b7a-1c2d3e4f5a6b" as OptionId,
  distribution: [
    { optionId: "3f2b0c1e-9a44-4d3e-8b7a-1c2d3e4f5a6b" as OptionId, count: 12 },
    { optionId: "7c9d8e5a-2b31-4f60-9c8d-0a1b2c3d4e5f" as OptionId, count: 5 },
  ],
  explanation: "東京です",
  personalResult: null,
};

describe("RevealSummary（進行画面の正解発表・要件5.6）", () => {
  it("shows the correct answer and the distribution by option label, never the raw option id", () => {
    const markup = renderToStaticMarkup(<RevealSummary question={question} closed={closed} />);
    expect(markup).toContain("正解: 東京");
    expect(markup).toContain("東京: 12人（71%）");
    expect(markup).toContain("大阪: 5人（29%）");
    expect(markup).not.toContain("3f2b0c1e");
    expect(markup).not.toContain("7c9d8e5a");
  });

  it("marks the correct option so the host can tell it apart at a glance", () => {
    const markup = renderToStaticMarkup(<RevealSummary question={question} closed={closed} />);
    expect(markup).toMatch(/data-correct="true"[^>]*class="[^"]*bg-emerald-50/);
    expect(markup).toContain("<svg");
  });

  it("lists options in the question's order and shows options nobody picked as 0人", () => {
    const partial: QuestionClosedPayload = {
      ...closed,
      distribution: [{ optionId: "7c9d8e5a-2b31-4f60-9c8d-0a1b2c3d4e5f" as OptionId, count: 4 }],
    };
    const markup = renderToStaticMarkup(<RevealSummary question={question} closed={partial} />);
    expect(markup.indexOf("東京")).toBeLessThan(markup.indexOf("大阪"));
    expect(markup).toContain("東京: 0人（0%）");
    expect(markup).toContain("大阪: 4人（100%）");
  });

  it("falls back to positional labels when the question is unavailable after a reconnect", () => {
    const markup = renderToStaticMarkup(<RevealSummary question={null} closed={closed} />);
    expect(markup).toContain("正解: 選択肢1");
    expect(markup).toContain("選択肢1: 12人（71%）");
    expect(markup).toContain("選択肢2: 5人（29%）");
    expect(markup).not.toContain("3f2b0c1e");
  });
});
