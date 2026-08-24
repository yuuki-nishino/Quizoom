import { describe, it, expect } from "vitest";
import { DESIGN_TEMPLATE_IDS, DESIGN_TEMPLATES, findDesignTemplate } from "./design-templates";
import { contrastRatio, MIN_CONTRAST_RATIO } from "../client/shared/theme";

describe("DESIGN_TEMPLATES", () => {
  it("contains one definition per declared template id", () => {
    expect(DESIGN_TEMPLATES.map((template) => template.id).sort()).toEqual([...DESIGN_TEMPLATE_IDS].sort());
  });

  it("includes at least one elegant wedding oriented template and one fancy party oriented template", () => {
    expect(DESIGN_TEMPLATES.some((template) => template.id === "elegant-wedding")).toBe(true);
    expect(DESIGN_TEMPLATES.some((template) => template.id === "fancy-party")).toBe(true);
  });

  it.each(DESIGN_TEMPLATES)("$id has a default palette meeting the 4.5:1 contrast requirement", (template) => {
    const ratio = contrastRatio(template.colors.textColor, template.colors.backgroundColor);
    expect(ratio).not.toBeNull();
    expect(ratio ?? 0).toBeGreaterThanOrEqual(MIN_CONTRAST_RATIO);
  });
});

describe("findDesignTemplate", () => {
  it("resolves the standard template when given null", () => {
    expect(findDesignTemplate(null).id).toBe("standard");
  });

  it("resolves the standard template when given an unknown id", () => {
    expect(findDesignTemplate("unknown-template" as never).id).toBe("standard");
  });

  it("resolves the matching template for a known id", () => {
    expect(findDesignTemplate("fancy-party").id).toBe("fancy-party");
  });
});
