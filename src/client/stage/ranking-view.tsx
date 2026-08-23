import type { RankingEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";
import { Confetti } from "../shared/confetti";
import { StarIcon } from "../shared/icons";

export interface RankingViewProps {
  readonly entries: readonly RankingEntry[];
  readonly isFinal: boolean;
  readonly topN?: number;
}

/** 中間/最終ランキングの表示。最終確定時は演出付きの見出しに切り替える（要件6.5, 6.6, 6.7） */
export function RankingView({ entries, isFinal, topN = 10 }: RankingViewProps) {
  const top = [...entries].sort((a, b) => a.rank - b.rank).slice(0, topN);

  return (
    <div
      aria-label={isFinal ? "最終ランキング" : "中間ランキング"}
      className={`${isFinal ? "stage-ranking-final" : "stage-ranking-interim"} quiz-phase-enter relative flex min-h-screen flex-col items-center gap-6 px-12 py-10`}
    >
      {isFinal && <Confetti active={true} />}
      <h1 className="inline-flex items-center gap-3 text-5xl font-extrabold">
        {isFinal && <StarIcon className="h-10 w-10 text-brand-accent" />}
        {isFinal ? "最終結果" : "中間ランキング"}
        {isFinal && <StarIcon className="h-10 w-10 text-brand-accent" />}
      </h1>
      <ol className="w-full max-w-2xl space-y-3">
        {top.map((entry, index) => (
          <li
            key={entry.participantId}
            className={`flex items-center gap-4 rounded-2xl px-6 py-4 shadow-lg ${
              index === 0
                ? "bg-amber-300 text-amber-950"
                : index === 1
                  ? "bg-slate-200 text-slate-900"
                  : index === 2
                    ? "bg-orange-200 text-orange-950"
                    : "bg-white/90 text-slate-800"
            }`}
          >
            <span className="stage-rank inline-flex w-14 items-center gap-1 text-2xl font-black">
              {index === 0 && <StarIcon className="h-6 w-6" />}
              {entry.rank}位
            </span>
            <span className="stage-nickname flex-1 text-left text-2xl font-semibold">{entry.nickname}</span>
            <span className="text-lg">
              正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
