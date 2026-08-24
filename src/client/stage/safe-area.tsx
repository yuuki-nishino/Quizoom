import type { ReactNode } from "react";

export interface StageSafeAreaProps {
  readonly children: ReactNode;
}

/**
 * プロジェクターのセーフティゾーン(投影機によっては画面端が見切れる)を考慮し、
 * 投影画面の内容全体に既定の外側余白を持たせる薄いラッパー（要件3.13）。
 * 実画面(stage-app.tsx)とプレビュー(theme-preview-walkthrough.tsx)の双方が
 * このコンポーネントを共有することで、見た目の乖離が構造的に発生しないようにする。
 */
export function StageSafeArea({ children }: StageSafeAreaProps) {
  return <div className="flex min-h-0 flex-1 flex-col p-[8%]">{children}</div>;
}
