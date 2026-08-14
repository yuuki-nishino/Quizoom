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
    <div aria-label={isFinal ? "最終ランキング" : "中間ランキング"} className={isFinal ? "stage-ranking-final" : "stage-ranking-interim"}>
      <h1>{isFinal ? "🎉 最終結果 🎉" : "中間ランキング"}</h1>
      <ol>
        {top.map((entry) => (
          <li key={entry.participantId}>
            <span className="stage-rank">{entry.rank}位</span>
            <span className="stage-nickname">{entry.nickname}</span>
            <span>
              正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
