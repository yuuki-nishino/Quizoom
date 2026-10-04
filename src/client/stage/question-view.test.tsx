import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionView } from "./question-view";
import type { QuestionPublicView } from "../../shared/protocol";
import type { AssetId, OptionId, QuestionId } from "../../shared/domain-types";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

function question(overrides: Partial<QuestionPublicView> = {}): QuestionPublicView {
  return {
    id: "q1" as QuestionId,
    orderIndex: 2,
    body: "日本の首都は？",
    imageAssetId: null,
    options: [
      { id: "o1" as OptionId, label: "大阪", orderIndex: 0, imageAssetId: null },
      { id: "o2" as OptionId, label: "東京", orderIndex: 1, imageAssetId: null },
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

  describe("choice images (Issue #36)", () => {
    const withImages = (count: 2 | 4, imageIdx: readonly number[] = [0, 1, 2, 3]) => {
      const options = ["りんご", "みかん", "ぶどう", "もも"].slice(0, count).map((label, i) => ({
        id: `o${i + 1}` as OptionId,
        label,
        orderIndex: i,
        imageAssetId: imageIdx.includes(i) ? (`img${i + 1}` as AssetId) : null,
      }));
      const urls = Object.fromEntries(options.filter((o) => o.imageAssetId).map((o) => [o.id, `/media/${o.imageAssetId}?token=t`]));
      return { question: question({ options }), optionImageUrls: urls };
    };
    const render = (props: { question: QuestionPublicView; optionImageUrls: Record<string, string | null> }, imageUrl: string | null = null) =>
      renderToStaticMarkup(
        <QuestionView {...props} imageUrl={imageUrl} remainingMs={9000} paused={false} answeredCount={1} totalCount={4} />,
      );
    const countImages = (markup: string) => (markup.match(/<img/g) ?? []).length;

    it("shows one image per option for a 4-option question, each with its text, in a single row of 4 columns", () => {
      const markup = render(withImages(4));
      expect(countImages(markup)).toBe(4);
      for (const label of ["りんご", "みかん", "ぶどう", "もも"]) expect(markup).toContain(label);
      expect(markup).toMatch(/class="stage-options[^"]*grid-cols-4[^"]*"/);
    });

    it("lays a 2-option question out in 2 columns", () => {
      const markup = render(withImages(2));
      expect(countImages(markup)).toBe(2);
      expect(markup).toMatch(/class="stage-options[^"]*grid-cols-2[^"]*"/);
    });

    it("uses a fit layout that never scrolls: clipped root and every region allowed to shrink", () => {
      const markup = render(withImages(4));
      expect(markup).toMatch(/class="stage-question-view[^"]*stage-question-fit[^"]*overflow-hidden[^"]*"/);
      expect(markup).not.toMatch(/class="stage-question-view[^"]*overflow-y-auto/);
      expect(markup).toMatch(/class="stage-options[^"]*min-h-0[^"]*flex-\[3\][^"]*"/);
    });

    it("shows the question image together with the option images, giving the question image its own shrinkable region", () => {
      const markup = render(withImages(4), "/media/question?token=t");
      expect(countImages(markup)).toBe(5);
      expect(markup).toContain('src="/media/question?token=t"');
      expect(markup).toMatch(/class="stage-question-image[^"]*min-h-0[^"]*"/);
      // 画像付きでも、問題文・カウントダウン・回答状況はすべて表示される
      expect(markup).toContain("日本の首都は？");
      expect(markup).toContain("9秒");
      expect(markup).toContain("回答済み 1 / 4");
    });

    it("keeps every option visible when only some options have an image (mixed)", () => {
      const markup = render(withImages(4, [1, 3]));
      expect(countImages(markup)).toBe(2);
      for (const label of ["りんご", "みかん", "ぶどう", "もも"]) expect(markup).toContain(label);
      expect(markup).toContain("stage-question-fit");
    });

    it("clamps a long question body so it cannot push options off the screen", () => {
      const props = withImages(4);
      const markup = render({ ...props, question: { ...props.question, body: "長い問題文".repeat(50) } });
      expect(markup).toMatch(/<h1 class="[^"]*line-clamp-3[^"]*"/);
    });

    it("leaves text-only questions on the existing layout, unchanged", () => {
      const markup = render({ question: question(), optionImageUrls: {} });
      expect(markup).not.toContain("stage-question-fit");
      expect(markup).toMatch(/class="stage-question-view[^"]*gap-6[^"]*py-10[^"]*"/);
      expect(markup).not.toContain("stage-option-image");
    });

    it("ignores an image reference whose URL was not resolved instead of rendering a broken tile", () => {
      const props = withImages(2);
      const markup = render({ ...props, optionImageUrls: {} });
      expect(countImages(markup)).toBe(0);
      expect(markup).toContain("りんご");
    });
  });
});
