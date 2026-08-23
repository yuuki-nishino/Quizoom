import { DESIGN_TEMPLATE_IDS, type DesignTemplateId, type ThemeSettings } from "./domain-types";

export { DESIGN_TEMPLATE_IDS };
export type { DesignTemplateId };

export type DesignTemplateColors = Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor" | "textColor">;

export interface DesignTemplateDefinition {
  readonly id: DesignTemplateId;
  readonly name: string;
  readonly targetScene: string;
  readonly colors: DesignTemplateColors;
}

const STANDARD_TEMPLATE: DesignTemplateDefinition = {
  id: "standard",
  name: "スタンダード",
  targetScene: "汎用・お任せ",
  colors: {
    primaryColor: "#2563eb",
    accentColor: "#f59e0b",
    backgroundColor: "#eff6ff",
    textColor: "#0f172a",
  },
};

const ELEGANT_WEDDING_TEMPLATE: DesignTemplateDefinition = {
  id: "elegant-wedding",
  name: "エレガント",
  targetScene: "結婚式・二次会などフォーマルで華やかな場向け",
  colors: {
    primaryColor: "#9f1d46",
    accentColor: "#d4af6a",
    backgroundColor: "#241019",
    textColor: "#f8efe3",
  },
};

const FANCY_PARTY_TEMPLATE: DesignTemplateDefinition = {
  id: "fancy-party",
  name: "ファンシー",
  targetScene: "社内イベント・懇親会などカジュアルで楽しい場向け",
  colors: {
    primaryColor: "#7c3aed",
    accentColor: "#fbbf24",
    backgroundColor: "#1b1533",
    textColor: "#fdf4ff",
  },
};

export const DESIGN_TEMPLATES: readonly DesignTemplateDefinition[] = [STANDARD_TEMPLATE, ELEGANT_WEDDING_TEMPLATE, FANCY_PARTY_TEMPLATE];

/** 未知の識別子または null は既定テンプレート(standard)として解決する。表示側が例外で落ちないための安全弁 */
export function findDesignTemplate(id: DesignTemplateId | null | undefined): DesignTemplateDefinition {
  return DESIGN_TEMPLATES.find((template) => template.id === id) ?? STANDARD_TEMPLATE;
}
