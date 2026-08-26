import { useEffect, useState } from "react";
import type { RankingEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";
import { Confetti } from "../shared/confetti";
import { StarIcon } from "../shared/icons";
import { buildRevealSchedule } from "./ranking-reveal";

export interface RankingViewProps {
  readonly entries: readonly RankingEntry[];
  readonly isFinal: boolean;
  readonly topN?: number;
}

/**
 * 中間/最終ランキングの表示。最終確定時は演出付きの見出しに切り替える（要件6.5, 6.6, 6.7）。
 * 最終ランキングのみ、下位から1位へ向かって1件ずつ発表する演出を行う（要件15.1〜15.5）。
 * サーバー側の新しいコマンド・イベントは持たず、受け取った1回分のランキングを起点に
 * クライアント側のタイマーだけで発表を進める。
 */
export function RankingView({ entries, isFinal, topN = 10 }: RankingViewProps) {
  const top = [...entries].sort((a, b) => a.rank - b.rank).slice(0, topN);
  const [revealedCount, setRevealedCount] = useState(() => (isFinal ? 0 : top.length));

  useEffect(() => {
    if (!isFinal) {
      setRevealedCount(top.length);
      return;
    }
    setRevealedCount(0);
    const schedule = buildRevealSchedule(top.length);
    const timers: number[] = [];
    let elapsed = 0;
    schedule.forEach((step, stepIndex) => {
      elapsed += step.delayMs;
      timers.push(window.setTimeout(() => setRevealedCount(stepIndex + 1), elapsed));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFinal, top.length]);

  const rank1Revealed = isFinal && top.length > 0 && revealedCount >= top.length;

  return (
    <div
      aria-label={isFinal ? "最終ランキング" : "中間ランキング"}
      className={`${isFinal ? "stage-ranking-final" : "stage-ranking-interim"} quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-12 py-10`}
    >
      {rank1Revealed && <Confetti active={true} />}
      <h1 className="font-display inline-flex items-center gap-3 text-5xl font-extrabold">
        {isFinal && <StarIcon className="h-10 w-10 text-brand-accent" />}
        {isFinal ? "最終結果" : "中間ランキング"}
        {isFinal && <StarIcon className="h-10 w-10 text-brand-accent" />}
      </h1>
      <ol className="w-full max-w-2xl space-y-3">
        {top.map((entry, index) => {
          const revealed = index >= top.length - revealedCount;
          return (
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
              <span className="stage-rank inline-flex w-24 shrink-0 items-center gap-1 whitespace-nowrap text-2xl font-black">
                {index === 0 && revealed && <StarIcon className="h-6 w-6 shrink-0" />}
                {entry.rank}位
              </span>
              {revealed ? (
                <>
                  <span key={`${entry.participantId}-nickname`} className="stage-nickname quiz-phase-enter min-w-0 flex-1 truncate text-left text-2xl font-semibold">
                    {entry.nickname}
                  </span>
                  <span key={`${entry.participantId}-score`} className="quiz-phase-enter text-lg">
                    正解数 {entry.correctCount} / {formatElapsedMs(entry.totalElapsedMs)}
                  </span>
                </>
              ) : (
                <span aria-hidden="true" className="min-w-0 flex-1 truncate text-left text-2xl font-semibold opacity-40">
                  ？？？
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
