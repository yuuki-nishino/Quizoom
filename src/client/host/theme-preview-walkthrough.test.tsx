import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemePreviewWalkthrough } from "./theme-preview-walkthrough";
import type { OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";

function theme(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return {
    primaryColor: "#4338ca",
    accentColor: "#f59e0b",
    backgroundColor: "#ffffff",
    textColor: "#111827",
    logoAssetId: null,
    backgroundAssetId: null,
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
