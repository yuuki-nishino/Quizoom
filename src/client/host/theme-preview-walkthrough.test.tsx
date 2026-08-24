import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemePreviewWalkthrough, previewFrameConfig, resolveActiveQuestion } from "./theme-preview-walkthrough";
import type { OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";

function theme(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return {
    primaryColor: "#4338ca",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    logoAssetId: null,
    backgroundAssetId: null,
    templateId: null,
    ...overrides,
  };
}

describe("ThemePreviewWalkthrough", () => {
  it("renders the first step (投影画面: 待機) using the real WaitingRoom component, reflecting the current theme colors", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme({ primaryColor: "#abcdef" })} logoImageUrl={null} backgroundImageUrl={null} />,
    );
    expect(markup).toContain("Quiz Night");
    expect(markup).toContain("開始をお待ちください");
    expect(markup).toContain("--color-brand-primary:#abcdef");
    expect(markup).toContain("投影画面: 待機");
    expect(markup).toContain("1/9");
  });

  it("displays the first (投影画面) step inside a 16:9 frame, matching projector proportions (要件3.11)", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme()} logoImageUrl={null} backgroundImageUrl={null} />,
    );
    const config = previewFrameConfig("投影画面");
    expect(markup).toContain(`width:${config.displayWidth}px`);
    expect(markup).toContain(`height:${config.displayHeight}px`);
    // 実寸(1280x720)で描画してからscaleで縮小するため、内側のコンテンツがそのままの大きさで見切れることを防ぐ
    expect(markup).toContain(`width:${config.referenceWidth}px`);
    expect(markup).toContain(`transform:scale(${config.scale})`);
  });

  it("applies the projector safety-zone margin (StageSafeArea) around 投影画面 steps (要件3.13)", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme()} logoImageUrl={null} backgroundImageUrl={null} />,
    );
    expect(markup).toMatch(/class="[^"]*p-\[8%\][^"]*"/);
  });

  it("reflects the event's selected design template on the previewed screen (要件4.6)", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough
        eventTitle="Quiz Night"
        theme={theme({ templateId: "elegant-wedding" })}
        logoImageUrl={null}
        backgroundImageUrl={null}
      />,
    );
    expect(markup).toContain('data-design-template="elegant-wedding"');
  });

  it("disables the previous button and enables the next button on the first step", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme()} logoImageUrl={null} backgroundImageUrl={null} />,
    );
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>← 前へ<\/button>/);
    expect(markup).toMatch(/<button type="button"[^>]*>次へ →<\/button>/);
  });

  it("applies a resolved logo/background image URL to every step via ThemeProvider", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough
        eventTitle="Quiz Night"
        theme={theme()}
        logoImageUrl="https://example.test/logo.png"
        backgroundImageUrl="https://example.test/bg.png"
      />,
    );
    expect(markup).toContain('src="https://example.test/logo.png"');
    expect(markup).toContain("background-image:url(https://example.test/bg.png)");
  });

  it("accepts a real host question in place of the sample question without crashing", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough
        eventTitle="Quiz Night"
        theme={theme()}
        logoImageUrl={null}
        backgroundImageUrl={null}
        questions={[
          {
            question: {
              id: "q1" as QuestionId,
              orderIndex: 0,
              body: "自作の設問",
              imageAssetId: null,
              options: [
                { id: "o1" as OptionId, label: "A", orderIndex: 0 },
                { id: "o2" as OptionId, label: "B", orderIndex: 1 },
              ],
            },
            correctOptionId: "o2" as OptionId,
            imageUrl: "https://example.test/question.png",
          },
        ]}
      />,
    );
    expect(markup).toContain("投影画面: 待機");
  });
});

describe("previewFrameConfig", () => {
  it("renders 投影画面 steps at a realistic 1280x720 reference size, scaled down to fit the display frame (要件3.11)", () => {
    const config = previewFrameConfig("投影画面");
    expect(config.referenceWidth / config.referenceHeight).toBeCloseTo(16 / 9, 2);
    expect(config.displayWidth / config.displayHeight).toBeCloseTo(16 / 9, 2);
    expect(config.scale).toBeCloseTo(config.displayWidth / config.referenceWidth, 5);
    expect(config.scale).toBeLessThan(1);
  });

  it("renders 回答画面 steps at a realistic smartphone reference size, scaled down to fit the display frame (要件3.12)", () => {
    const config = previewFrameConfig("回答画面");
    expect(config.referenceWidth).toBeLessThan(config.referenceHeight);
    expect(config.displayWidth).toBeLessThan(config.displayHeight);
    expect(config.scale).toBeCloseTo(config.displayWidth / config.referenceWidth, 5);
    expect(config.scale).toBeLessThan(1);
  });
});

describe("resolveActiveQuestion", () => {
  function previewQuestion(body: string): { question: { id: QuestionId; orderIndex: number; body: string; imageAssetId: null; options: never[] }; correctOptionId: OptionId; imageUrl: null } {
    return {
      question: { id: `q-${body}` as QuestionId, orderIndex: 0, body, imageAssetId: null, options: [] },
      correctOptionId: "o1" as OptionId,
      imageUrl: null,
    };
  }

  it("returns the question at the given index (要件3.14)", () => {
    const questions = [previewQuestion("第1問"), previewQuestion("第2問"), previewQuestion("第3問")];
    expect(resolveActiveQuestion(questions, 1).question.body).toBe("第2問");
  });

  it("falls back to the first question when the index is out of range", () => {
    const questions = [previewQuestion("第1問"), previewQuestion("第2問")];
    expect(resolveActiveQuestion(questions, 5).question.body).toBe("第1問");
  });

  it("falls back to the sample question when there are no registered questions", () => {
    expect(resolveActiveQuestion([], 0).question.body).toBe("日本の首都はどこでしょう？");
  });
});

describe("ThemePreviewWalkthrough question picker", () => {
  it("lists every registered question as a selectable option (要件3.14)", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough
        eventTitle="Quiz Night"
        theme={theme()}
        logoImageUrl={null}
        backgroundImageUrl={null}
        questions={[
          {
            question: { id: "q1" as QuestionId, orderIndex: 0, body: "第1問の本文", imageAssetId: null, options: [] },
            correctOptionId: "o1" as OptionId,
            imageUrl: null,
          },
          {
            question: { id: "q2" as QuestionId, orderIndex: 1, body: "第2問の本文", imageAssetId: null, options: [] },
            correctOptionId: "o1" as OptionId,
            imageUrl: null,
          },
        ]}
      />,
    );
    expect(markup).toContain("第1問の本文");
    expect(markup).toContain("第2問の本文");
    expect((markup.match(/<option/g) ?? []).length).toBe(2);
  });

  it("omits the question picker when the event has no registered questions", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme()} logoImageUrl={null} backgroundImageUrl={null} questions={[]} />,
    );
    expect(markup).not.toContain("プレビューする設問");
  });
});
