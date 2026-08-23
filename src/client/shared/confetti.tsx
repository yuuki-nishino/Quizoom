import type { ReactElement } from "react";

export interface ConfettiProps {
  /** 演出を表示するかどうか。呼び出し側のコンポーネントが正解発表・最終ランキング確定等の
   * タイミングで新規マウントされることを前提に、マウントのたびに一過性のアニメーションとして再生する */
  readonly active: boolean;
}

const PIECE_COUNT = 16;
const PIECE_INDICES = Array.from({ length: PIECE_COUNT }, (_, i) => i);

/**
 * 正解発表・最終ランキング確定・自分の好結果表示で使う一過性(ループしない)の祝福演出。
 * 配色は ThemeProvider が設定する --color-brand-* トークンをCSS側で参照するため、
 * このコンポーネント自身はテンプレートごとの分岐を持たない(design.md参照)。
 * prefers-reduced-motion 環境では styles.css 側で非表示にする（要件5.2）。
 */
export function Confetti({ active }: ConfettiProps): ReactElement | null {
  if (!active) return null;

  return (
    <div aria-hidden="true" className="quiz-confetti pointer-events-none absolute inset-0 z-30 overflow-hidden">
      {PIECE_INDICES.map((index) => (
        <span key={index} className="quiz-confetti-piece" style={{ ["--quiz-confetti-index" as string]: index }} />
      ))}
    </div>
  );
}
