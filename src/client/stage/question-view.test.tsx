import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionView } from "./question-view";
import type { QuestionPublicView } from "../../shared/protocol";
import type { OptionId, QuestionId } from "../../shared/domain-types";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

function question(overrides: Partial<QuestionPublicView> = {}): QuestionPublicView {
  return {
    id: "q1" as QuestionId,
    orderIndex: 2,
    body: "日本の首都は？",
    imageAssetId: null,
    options: [
      { id: "o1" as OptionId, label: "大阪", orderIndex: 0 },
      { id: "o2" as OptionId, label: "東京", orderIndex: 1 },
    ],
    ...overrides,
  };
}

describe("QuestionView", () => {
  it("shows the 1-based question number, body, options, countdown, and answered ratio", () => {
    const markup = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl={null} remainingMs={12_400} paused={false} answeredCount={3} totalCount={10} />,
    );
    expect(markup).toContain("第3問");
    expect(markup).toContain("日本の首都は？");
    expect(markup).toContain("大阪");
    expect(markup).toContain("東京");
    expect(markup).toContain("13秒");
    expect(markup).toContain("回答済み 3 / 10");
    expect(markup).toContain("30%");
  });

  it("indicates the paused state", () => {
    const markup = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl={null} remainingMs={5000} paused={true} answeredCount={0} totalCount={5} />,
    );
    expect(markup).toContain("一時停止中");
  });

  it("renders the attached image when an imageUrl is provided", () => {
    const markup = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl="/api/events/e1/media/a1?token=t" paused={false} remainingMs={1000} answeredCount={0} totalCount={1} />,
    );
    expect(markup).toContain('src="/api/events/e1/media/a1?token=t"');
  });

  it("switches to a compact layout when an image is attached, so options fit without scrolling", () => {
    const withImage = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl="/api/events/e1/media/a1?token=t" paused={false} remainingMs={1000} answeredCount={0} totalCount={1} />,
    );
    const withoutImage = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl={null} paused={false} remainingMs={1000} answeredCount={0} totalCount={1} />,
    );
    // 画像あり: 余白・フォントサイズが詰まったコンパクトクラスになる
    expect(withImage).toMatch(/class="stage-question-view[^"]*gap-3[^"]*py-6[^"]*"/);
    expect(withImage).toContain("max-h-56");
    // 画像なし: 従来どおりゆったりしたクラスのまま
    expect(withoutImage).toMatch(/class="stage-question-view[^"]*gap-6[^"]*py-10[^"]*"/);
  });

  it("shows a テスト問題 badge instead of the question number when the practice question is open（要件3.3）", () => {
    const markup = renderToStaticMarkup(
      <QuestionView
        question={question({ id: PRACTICE_QUESTION_ID })}
        imageUrl={null}
        remainingMs={1000}
        paused={false}
        answeredCount={0}
        totalCount={1}
      />,
    );
    expect(markup).toContain("テスト問題");
    expect(markup).not.toContain("第3問");
  });

  it("keeps the question number for a real question", () => {
    const markup = renderToStaticMarkup(
      <QuestionView question={question()} imageUrl={null} remainingMs={1000} paused={false} answeredCount={0} totalCount={1} />,
    );
    expect(markup).not.toContain("テスト問題");
  });
});
