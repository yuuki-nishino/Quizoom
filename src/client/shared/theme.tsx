import { useMemo, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { DesignTemplateId, ThemeSettings } from "../../shared/domain-types";

// Tailwind の @theme トークン名(--color-brand-*)へ直接書き込む。
// 別名の変数(--quizoom-color-*)を経由する二重参照にすると、CSSカスタムプロパティは
// 「定義された要素」でしか var() を再評価しないため、ネストした<div>でこの変数を
// 上書きしても :root 側の --color-brand-* には反映されず、常にフォールバック値の
// ままになってしまう(実際に発生していた不具合)
export const THEME_CSS_VARIABLES = {
  primaryColor: "--color-brand-primary",
  accentColor: "--color-brand-accent",
  backgroundColor: "--color-brand-bg",
  textColor: "--color-brand-text",
} as const;

export const MIN_CONTRAST_RATIO = 4.5;

/** 4色のみを要求する。ThemeSettings（画像参照込み）に加え、共有ページ用の PublicTheme もそのまま渡せる */
export type ThemeColors = Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor" | "textColor">;

/** 4色を CSS カスタムプロパティへ変換する */
export function themeToCssProperties(theme: ThemeColors): CSSProperties {
  return {
    [THEME_CSS_VARIABLES.primaryColor]: theme.primaryColor,
    [THEME_CSS_VARIABLES.accentColor]: theme.accentColor,
    [THEME_CSS_VARIABLES.backgroundColor]: theme.backgroundColor,
    [THEME_CSS_VARIABLES.textColor]: theme.textColor,
  } as CSSProperties;
}

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHexColor(hex: string): { readonly r: number; readonly g: number; readonly b: number } | null {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;
  const value = match[1] ?? "";
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function relativeLuminance(hex: string): number | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x のコントラスト比を算出する。色を16進数として解釈できない場合は null を返す */
export function contrastRatio(colorA: string, colorB: string): number | null {
  const luminanceA = relativeLuminance(colorA);
  const luminanceB = relativeLuminance(colorB);
  if (luminanceA === null || luminanceB === null) return null;

  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** 文字色と背景色のコントラスト比が 4.5:1 を下回るかどうか。保存自体はブロックしないための警告用途 */
export function isLowContrast(theme: ThemeColors): boolean {
  const ratio = contrastRatio(theme.textColor, theme.backgroundColor);
  return ratio !== null && ratio < MIN_CONTRAST_RATIO;
}

export interface ThemeProviderProps {
  readonly theme: ThemeColors;
  readonly children: ReactNode;
  /** 呼び出し側で解決済みのロゴ画像URL。未指定時は描画しない（要件3.4） */
  readonly logoImageUrl?: string | null;
  /** 呼び出し側で解決済みの背景画像URL。未指定時は背景色のみを適用する（要件3.4） */
  readonly backgroundImageUrl?: string | null;
  /** 選択中のデザインテンプレート。未指定時は既定テンプレート(standard)の装飾を適用する（要件4.3, 4.6） */
  readonly templateId?: DesignTemplateId | null;
}

/**
 * 外観設定を CSS カスタムプロパティとして子要素に適用する。ロゴ・背景画像のURL解決は呼び出し側の責務とする。
 * `data-design-template` 属性を出力するのみで、装飾の実体(グラデーション・アニメーション)は styles.css 側の
 * 属性セレクタが持つ。子コンポーネントはテンプレートの存在を意識しない（design.md「装飾スロット + CSS属性セレクタ」）
 */
export function ThemeProvider({ theme, children, logoImageUrl, backgroundImageUrl, templateId }: ThemeProviderProps): ReactElement {
  const style = useMemo(() => {
    const base = themeToCssProperties(theme);
    if (!backgroundImageUrl) return base;
    return { ...base, backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  }, [theme, backgroundImageUrl]);

  return (
    <div style={style} data-design-template={templateId ?? "standard"} className="relative min-h-full bg-brand-bg text-brand-text">
      <div aria-hidden="true" className="quiz-motif-layer pointer-events-none absolute inset-0 z-0 overflow-hidden" />
      {logoImageUrl && (
        // z-0(コンテンツのz-10より背面)に置くことで、AnswerScreen等の左上寄せの文言と空間的に重なっても
        // 文言が常にロゴの手前に描画され、ロゴが内容を隠して読みにくくすることを防ぐ
        <img src={logoImageUrl} alt="" className="absolute left-4 top-4 z-0 max-h-14 max-w-28 object-contain opacity-90" />
      )}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
