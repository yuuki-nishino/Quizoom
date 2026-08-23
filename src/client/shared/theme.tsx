import { useMemo, type CSSProperties, type ReactElement, type ReactNode } from "react";
import type { ThemeSettings } from "../../shared/domain-types";

export const THEME_CSS_VARIABLES = {
  primaryColor: "--quizoom-color-primary",
  accentColor: "--quizoom-color-accent",
  backgroundColor: "--quizoom-color-background",
  textColor: "--quizoom-color-text",
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
}

/** 外観設定を CSS カスタムプロパティとして子要素に適用する。ロゴ・背景画像のURL解決は呼び出し側の責務とする */
export function ThemeProvider({ theme, children, logoImageUrl, backgroundImageUrl }: ThemeProviderProps): ReactElement {
  const style = useMemo(() => {
    const base = themeToCssProperties(theme);
    if (!backgroundImageUrl) return base;
    return { ...base, backgroundImage: `url(${backgroundImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" };
  }, [theme, backgroundImageUrl]);

  return (
    <div style={style} className="relative min-h-full bg-brand-bg text-brand-text">
      {logoImageUrl && (
        <img src={logoImageUrl} alt="" className="absolute left-4 top-4 z-20 max-h-16 max-w-[40vw] object-contain" />
      )}
      {children}
    </div>
  );
}
