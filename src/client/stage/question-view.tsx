import type { QuestionPublicView } from "../../shared/protocol";
import { formatRemainingSeconds } from "../shared/format";

export interface QuestionViewProps {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly answeredCount: number;
  readonly totalCount: number;
}

/** 出題表示: 問題番号・問題文・選択肢・添付画像・残り時間・回答済み割合（要件6.2, 6.3, 6.7, 11.2） */
export function QuestionView({ question, imageUrl, remainingMs, paused, answeredCount, totalCount }: QuestionViewProps) {
  const ratio = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  return (
    <div aria-label="出題中" className="stage-question-view flex min-h-screen flex-col items-center gap-6 px-12 py-10 text-center">
      <p className="stage-question-number text-2xl font-bold text-brand-accent">第{question.orderIndex + 1}問</p>
      <h1 className="max-w-5xl text-4xl font-extrabold leading-snug sm:text-5xl">{question.body}</h1>
      {imageUrl && <img src={imageUrl} alt="" className="stage-question-image max-h-72 rounded-xl object-contain shadow-lg" />}

      <ul className="stage-options grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {question.options.map((option) => (
          <li
            key={option.id}
            className="rounded-xl border-2 border-brand-primary/30 bg-white/90 px-6 py-5 text-2xl font-semibold text-slate-800 shadow"
          >
            {option.label}
          </li>
        ))}
      </ul>

      <p className="stage-countdown mt-2 text-6xl font-black tabular-nums text-brand-primary" aria-label="残り時間">
        {formatRemainingSeconds(remainingMs)}秒
        {paused && <span className="ml-3 text-2xl font-normal text-amber-500">（一時停止中）</span>}
      </p>

      <p aria-label="回答状況" className="text-xl text-brand-text/70">
        回答済み {answeredCount} / {totalCount}（{ratio}%）
      </p>
    </div>
  );
}
