import type { QuestionPublicView } from "../../shared/protocol";
import { formatRemainingSeconds } from "../shared/format";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

export interface QuestionViewProps {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly answeredCount: number;
  readonly totalCount: number;
}

/**
 * 出題表示: 問題番号・問題文・選択肢・添付画像・残り時間・回答済み割合（要件6.2, 6.3, 6.7, 11.2）。
 * 添付画像がある場合は、画像の分だけ縦方向のスペースが不足しやすいため、画像の最大高さ・余白・
 * 選択肢のサイズを詰めたコンパクト表示に切り替える。画像なしの場合は従来どおりゆったり表示する
 * (投影画面は観客が能動的にスクロールできないため、要素が画面外に隠れないことを優先する)
 */
export function QuestionView({ question, imageUrl, remainingMs, paused, answeredCount, totalCount }: QuestionViewProps) {
  const ratio = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  const hasImage = imageUrl !== null;
  const isPractice = question.id === PRACTICE_QUESTION_ID;

  return (
    <div
      aria-label="出題中"
      className={`stage-question-view quiz-phase-enter flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-12 text-center ${
        hasImage ? "gap-3 py-6" : "gap-6 py-10"
      }`}
    >
      <p
        className={`stage-question-number inline-block rounded-full bg-brand-accent/15 font-bold text-brand-accent ${
          hasImage ? "px-3 py-0.5 text-xl" : "px-4 py-1 text-2xl"
        }`}
      >
        {isPractice ? "テスト問題" : `第${question.orderIndex + 1}問`}
      </p>
      <h1
        className={`max-w-5xl font-extrabold leading-snug tracking-tight ${
          hasImage ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
        }`}
      >
        {question.body}
      </h1>
      {imageUrl && <img src={imageUrl} alt="" className="stage-question-image max-h-56 rounded-2xl object-contain shadow-xl" />}

      <ul className={`stage-options grid w-full max-w-3xl grid-cols-1 sm:grid-cols-2 ${hasImage ? "gap-2" : "gap-4"}`}>
        {question.options.map((option) => (
          <li
            key={option.id}
            className={`rounded-2xl border-2 border-brand-primary/30 bg-white/95 font-semibold text-slate-800 shadow-lg ${
              hasImage ? "px-4 py-2 text-lg" : "px-6 py-5 text-2xl"
            }`}
          >
            {option.label}
          </li>
        ))}
      </ul>

      <p
        className={`stage-countdown font-black tabular-nums text-brand-primary drop-shadow-sm ${hasImage ? "text-4xl" : "mt-2 text-6xl"}`}
        aria-label="残り時間"
      >
        {formatRemainingSeconds(remainingMs)}秒
        {paused && <span className="ml-3 text-2xl font-normal text-amber-500">（一時停止中）</span>}
      </p>

      <div className="w-full max-w-md">
        <p aria-label="回答状況" className={hasImage ? "text-sm text-brand-text/70" : "text-xl text-brand-text/70"}>
          回答済み {answeredCount} / {totalCount}（{ratio}%）
        </p>
        <div aria-hidden="true" className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-text/10">
          <div className="h-full rounded-full bg-brand-accent transition-[width] duration-500 ease-out" style={{ width: `${ratio}%` }} />
        </div>
      </div>
    </div>
  );
}
