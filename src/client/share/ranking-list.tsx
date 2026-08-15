import type { PublicResultEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";

export interface RankingListProps {
  readonly entries: readonly PublicResultEntry[];
}

/** ページ本体では全員を表示する（画像化は上位者に限定する方針とは別軸） */
export function RankingList({ entries }: RankingListProps) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);

  return (
    <ol aria-label="最終ランキング" className="mt-4 w-full max-w-md space-y-2">
      {sorted.map((entry) => (
        <li
          key={entry.rank}
          className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white/90 px-4 py-3 shadow-sm"
        >
          <span className="w-10 text-lg font-bold text-brand-primary">{entry.rank}位</span>
          <span className="flex-1 font-medium text-slate-900">{entry.nickname}</span>
          <span className="text-sm text-slate-500">
            正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}
          </span>
        </li>
      ))}
    </ol>
  );
}
