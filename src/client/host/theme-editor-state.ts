import type { ThemeSettings } from "../../shared/domain-types";
import type { DesignTemplateDefinition } from "../../shared/design-templates";

export type ThemeColorKey = keyof Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor" | "textColor">;

/** テンプレート選択時に配色とテンプレートIDの両方を反映する純粋関数（要件3.5） */
export function applyDesignTemplate(theme: ThemeSettings, template: DesignTemplateDefinition): ThemeSettings {
  return {
    ...theme,
    primaryColor: template.colors.primaryColor,
    accentColor: template.colors.accentColor,
    backgroundColor: template.colors.backgroundColor,
    textColor: template.colors.textColor,
    templateId: template.id,
  };
}

/** 個別配色調整。選択中のテンプレートIDには触れないため、テンプレート選択後の微調整でもモチーフが維持される（要件3.6） */
export function updateThemeColor(theme: ThemeSettings, key: ThemeColorKey, value: string): ThemeSettings {
  return { ...theme, [key]: value };
}

export type ThemeImageKind = "logo" | "background";

/** ロゴまたは背景画像の参照をクリアする。対象以外のフィールド(配色・テンプレートID・もう一方の画像)には触れない（要件3.10） */
export function clearThemeImage(theme: ThemeSettings, kind: ThemeImageKind): ThemeSettings {
  return kind === "logo" ? { ...theme, logoAssetId: null } : { ...theme, backgroundAssetId: null };
}
