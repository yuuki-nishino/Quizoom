import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { contrastRatio, isLowContrast, themeToCssProperties, ThemeProvider, MIN_CONTRAST_RATIO } from "./theme";
import type { ThemeSettings } from "../../shared/domain-types";

function theme(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return {
    primaryColor: "#112233",
    accentColor: "#445566",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    logoAssetId: null,
    backgroundAssetId: null,
    templateId: null,
    ...overrides,
  };
}

describe("themeToCssProperties", () => {
  it("maps the four theme colors to CSS custom properties", () => {
    expect(themeToCssProperties(theme())).toEqual({
      "--color-brand-primary": "#112233",
      "--color-brand-accent": "#445566",
      "--color-brand-bg": "#ffffff",
      "--color-brand-text": "#000000",
    });
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white (maximum contrast)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
  });

  it("returns 1 for identical colors (no contrast)", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#222222", "#eeeeee");
    const b = contrastRatio("#eeeeee", "#222222");
    expect(a).toBeCloseTo(b ?? Number.NaN, 10);
  });

  it("returns null for an unparseable color", () => {
    expect(contrastRatio("not-a-color", "#ffffff")).toBeNull();
  });
});

describe("isLowContrast", () => {
  it("is false for black text on white background", () => {
    expect(isLowContrast(theme({ textColor: "#000000", backgroundColor: "#ffffff" }))).toBe(false);
  });

  it("is true for a low-contrast pairing below the 4.5:1 threshold", () => {
    const low = theme({ textColor: "#999999", backgroundColor: "#aaaaaa" });
    expect(contrastRatio(low.textColor, low.backgroundColor)).toBeLessThan(MIN_CONTRAST_RATIO);
    expect(isLowContrast(low)).toBe(true);
  });
});

describe("ThemeProvider", () => {
  it("applies the theme colors as inline CSS custom properties on the wrapper element", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme({ primaryColor: "#abcdef" })}>
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain("--color-brand-primary:#abcdef");
    expect(markup).toContain("content");
  });

  it("renders neither a background image nor a logo when the URLs are omitted", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()}>
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).not.toContain("background-image");
    expect(markup).not.toContain("<img");
  });

  it("applies a cover background image when backgroundImageUrl is provided", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()} backgroundImageUrl="https://example.test/bg.png">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain("background-image:url(https://example.test/bg.png)");
  });

  it("renders a logo image when logoImageUrl is provided", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()} logoImageUrl="https://example.test/logo.png">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain('src="https://example.test/logo.png"');
  });

  it("falls back to the standard template attribute when templateId is omitted", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()}>
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain('data-design-template="standard"');
  });

  it("falls back to the standard template attribute when templateId is null", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()} templateId={null}>
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain('data-design-template="standard"');
  });

  it("reflects the selected template as a data attribute", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme()} templateId="elegant-wedding">
        <span>content</span>
      </ThemeProvider>,
    );

    expect(markup).toContain('data-design-template="elegant-wedding"');
  });

  it("sets the brand color tokens directly on the wrapper without an indirection variable (regression for Issue #7)", () => {
    const markup = renderToStaticMarkup(
      <ThemeProvider theme={theme({ primaryColor: "#abcdef" })}>
        <span>content</span>
      </ThemeProvider>,
    );

    // 二重参照(--color-brand-primary: var(--quizoom-color-primary, ...))を再度持ち込んでいないことを保証する
    expect(markup).not.toContain("var(--quizoom-color");
  });
});
