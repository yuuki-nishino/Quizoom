import { describe, it, expect } from "vitest";
import { applyDesignTemplate, updateThemeColor } from "./theme-editor-state";
import { DESIGN_TEMPLATES } from "../../shared/design-templates";
import type { ThemeSettings } from "../../shared/domain-types";

function baseTheme(overrides: Partial<ThemeSettings> = {}): ThemeSettings {
  return {
    primaryColor: "#000000",
    accentColor: "#111111",
    backgroundColor: "#ffffff",
    textColor: "#222222",
    logoAssetId: null,
    backgroundAssetId: null,
    templateId: null,
    ...overrides,
  };
}

describe("applyDesignTemplate", () => {
  it("copies all four template colors and the template id onto the theme", () => {
    const template = DESIGN_TEMPLATES.find((t) => t.id === "fancy-party")!;
    const next = applyDesignTemplate(baseTheme(), template);

    expect(next.primaryColor).toBe(template.colors.primaryColor);
    expect(next.accentColor).toBe(template.colors.accentColor);
    expect(next.backgroundColor).toBe(template.colors.backgroundColor);
    expect(next.textColor).toBe(template.colors.textColor);
    expect(next.templateId).toBe("fancy-party");
  });

  it("preserves logo and background asset selections when switching templates", () => {
    const template = DESIGN_TEMPLATES.find((t) => t.id === "elegant-wedding")!;
    const themeWithAssets = baseTheme({ logoAssetId: "logo-1" as never, backgroundAssetId: "bg-1" as never });
    const next = applyDesignTemplate(themeWithAssets, template);

    expect(next.logoAssetId).toBe("logo-1");
    expect(next.backgroundAssetId).toBe("bg-1");
  });
});

describe("updateThemeColor", () => {
  it("updates only the targeted color field", () => {
    const next = updateThemeColor(baseTheme(), "primaryColor", "#abcdef");
    expect(next.primaryColor).toBe("#abcdef");
    expect(next.accentColor).toBe("#111111");
  });

  it("keeps the selected template id unchanged after a manual color tweak", () => {
    const template = DESIGN_TEMPLATES.find((t) => t.id === "fancy-party")!;
    const themed = applyDesignTemplate(baseTheme(), template);

    const tweaked = updateThemeColor(themed, "primaryColor", "#123123");

    expect(tweaked.templateId).toBe("fancy-party");
    expect(tweaked.primaryColor).toBe("#123123");
  });
});
