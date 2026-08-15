import type { RankingEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";

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
      className={`${isFinal ? "stage-ranking-final" : "stage-ranking-interim"} flex min-h-screen flex-col items-center gap-6 px-12 py-10`}
    >
      <h1 className="text-5xl font-extrabold">{isFinal ? "🎉 最終結果 🎉" : "中間ランキング"}</h1>
      <ol className="w-full max-w-2xl space-y-3">
        {top.map((entry, index) => (
          <li
            key={entry.participantId}
            className={`flex items-center gap-4 rounded-xl px-6 py-4 shadow ${
              index === 0
                ? "bg-amber-300 text-amber-950"
                : index === 1
                  ? "bg-slate-200 text-slate-900"
                  : index === 2
                    ? "bg-orange-200 text-orange-950"
                    : "bg-white/90 text-slate-800"
            }`}
          >
            <span className="stage-rank w-14 text-2xl font-black">{entry.rank}位</span>
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
