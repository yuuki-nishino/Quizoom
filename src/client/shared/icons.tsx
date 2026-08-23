import type { ReactElement } from "react";

export interface IconProps {
  readonly className?: string;
}

/**
 * 正誤・達成を示す装飾アイコン群。絵文字ではなくアウトラインSVGアイコンを使う方針
 * (ui-ux-pro-max icons ドメイン: check-circle / star)に従い、視覚テキストに併記される
 * 装飾用途を前提に常に aria-hidden を付与する。新規パッケージを追加せず、
 * Heroicons outline 相当のパスをインライン化している。
 */
export function CheckCircleIcon({ className }: IconProps): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

export function StarIcon({ className }: IconProps): ReactElement {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
    </svg>
  );
}
