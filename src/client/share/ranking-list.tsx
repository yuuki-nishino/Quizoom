import type { PublicResultEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";

export interface RankingListProps {
  readonly entries: readonly PublicResultEntry[];
}

/** ページ本体では全員を表示する（画像化は上位者に限定する方針とは別軸） */
export function RankingList({ entries }: RankingListProps) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);

  return (
    <ol aria-label="最終ランキング">
      {sorted.map((entry) => (
        <li key={entry.rank}>
          <span>{entry.rank}位</span>
          <span>{entry.nickname}</span>
          <span>
            正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}
          </span>
        </li>
      ))}
    </ol>
  );
}
