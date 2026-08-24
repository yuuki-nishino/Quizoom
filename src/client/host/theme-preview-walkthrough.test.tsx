import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemePreviewWalkthrough, previewFrameClassName } from "./theme-preview-walkthrough";
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

  it("displays the first (投影画面) step inside a 16:9 aspect-ratio frame, matching projector proportions (要件3.11)", () => {
    const markup = renderToStaticMarkup(
      <ThemePreviewWalkthrough eventTitle="Quiz Night" theme={theme()} logoImageUrl={null} backgroundImageUrl={null} />,
    );
    expect(markup).toMatch(/class="[^"]*aspect-video[^"]*"/);
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
        question={{
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
        }}
      />,
    );
    expect(markup).toContain("投影画面: 待機");
  });
});

describe("previewFrameClassName", () => {
  it("frames 投影画面 steps at a 16:9 aspect ratio (要件3.11)", () => {
    expect(previewFrameClassName("投影画面")).toContain("aspect-video");
  });

  it("frames 回答画面 steps at a tall, smartphone-like aspect ratio (要件3.12)", () => {
    const className = previewFrameClassName("回答画面");
    expect(className).toContain("aspect-[9/19.5]");
    expect(className).not.toContain("aspect-video");
  });
});
