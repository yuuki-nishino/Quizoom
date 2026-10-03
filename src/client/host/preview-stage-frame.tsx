import type { ReactNode, Ref } from "react";
import type { ThemeSettings } from "../../shared/domain-types";
import { ThemeProvider } from "../shared/theme";

export type WalkthroughStepGroup = "投影画面" | "回答画面";

export interface PreviewFrameConfig {
  /** 実際の投影/端末を想定した描画基準サイズ(px)。フェーズ画面コンポーネントはこのサイズで実寸描画する */
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  /** プレビュー上での表示サイズ(px) */
  readonly displayWidth: number;
  readonly displayHeight: number;
  /** referenceサイズをdisplayサイズへ縮小する倍率(transform: scaleに使う) */
  readonly scale: number;
  readonly frameClassName: string;
}

/**
 * 投影画面は16:9(1920×1080=Full HDを想定)、回答画面はスマートフォン(390×844を想定)の実寸で
 * フェーズ画面コンポーネントを描画したうえで、表示サイズへ縮小する設定を返す純粋関数（要件3.11, 3.12）。
 * アスペクト比の入れ物を用意するだけでなく、実寸コンテンツを縮小表示することで、
 * 実際のサイズのままだと収まりきらず見切れてしまう問題を防ぐ。投影画面の基準解像度は、
 * 画像付き・4択の設問でもスクロールなしで全選択肢が収まる実測結果に基づき1920×1080とした
 * (1280×720では画像+4択で選択肢の一部が基準サイズ内に収まらなかった)。長い問題文等で
 * それでも基準サイズを超える場合は、表示枠自体をスクロールして続きを確認できるようにする
 * (サイレントなクリップを避ける)。
 */
export function previewFrameConfig(group: WalkthroughStepGroup): PreviewFrameConfig {
  if (group === "投影画面") {
    const referenceWidth = 1920;
    const referenceHeight = 1080;
    const displayWidth = 1200;
    return {
      referenceWidth,
      referenceHeight,
      displayWidth,
      displayHeight: Math.round((displayWidth * referenceHeight) / referenceWidth),
      scale: displayWidth / referenceWidth,
      frameClassName: "mx-auto mt-3 overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200",
    };
  }
  const referenceWidth = 390;
  const referenceHeight = 844;
  const displayWidth = 390;
  return {
    referenceWidth,
    referenceHeight,
    displayWidth,
    displayHeight: Math.round((displayWidth * referenceHeight) / referenceWidth),
    scale: displayWidth / referenceWidth,
    frameClassName: "mx-auto mt-3 overflow-y-auto overflow-x-hidden rounded-[2rem] border-8 border-slate-800",
  };
}

export interface PreviewStageFrameProps {
  readonly group: WalkthroughStepGroup;
  readonly theme: ThemeSettings;
  readonly logoImageUrl: string | null;
  readonly backgroundImageUrl: string | null;
  /** 画面高に固定してテーマ領域を描画する(選択肢画像付きのフィットレイアウトを実画面と同じ条件で確認するため) */
  readonly fitViewport?: boolean;
  readonly frameRef?: Ref<HTMLDivElement>;
  readonly children: ReactNode;
}

/**
 * フェーズ画面コンポーネントを、実際の投影(1920×1080)・端末(390×844)の基準サイズで描画したうえで、
 * 表示サイズへ縮小して見せる枠。既存の通し確認プレビューと設問単位プレビューが共有することで、
 * どちらも実画面と同じ構成・同じ縦横比で表示され、見た目の乖離が構造的に発生しない。
 * 実際のサイズのまま縮小せずに枠へ収めると内容が見切れてしまうため、内側を基準サイズで描画して scale する（要件3.11, 3.12, 5.6）
 */
export function PreviewStageFrame({ group, theme, logoImageUrl, backgroundImageUrl, fitViewport = false, frameRef, children }: PreviewStageFrameProps) {
  const frame = previewFrameConfig(group);
  return (
    <div ref={frameRef} className={frame.frameClassName} style={{ width: frame.displayWidth, height: frame.displayHeight }}>
      <div style={{ width: frame.referenceWidth, height: frame.referenceHeight, transform: `scale(${frame.scale})`, transformOrigin: "top left" }}>
        <ThemeProvider theme={theme} templateId={theme.templateId} logoImageUrl={logoImageUrl} backgroundImageUrl={backgroundImageUrl} fitViewport={fitViewport}>
          {children}
        </ThemeProvider>
      </div>
    </div>
  );
}
