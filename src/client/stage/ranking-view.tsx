import { useEffect, useState } from "react";
import type { RankingEntry } from "../../shared/domain-types";
import { formatElapsedMs } from "../shared/format";
import { Confetti } from "../shared/confetti";
import { StarIcon } from "../shared/icons";
import { buildRevealSchedule } from "./ranking-reveal";
import { buildRevealBatches, isFinalBatchStep } from "../../shared/ranking-batches";

export interface RankingViewProps {
  readonly entries: readonly RankingEntry[];
  readonly isFinal: boolean;
  /**
   * 最終結果発表の現在の段階（要件15.1〜15.3）。0始まりで、主催者の「次のグループを発表する」
   * 操作のたびに進む。isFinal=falseの中間ランキングでは無視される
   */
  readonly revealStep: number | null;
  /** 中間ランキング表示の上限件数（既定10件）。最終結果は全員をグループ分けして表示するため対象外 */
  readonly topN?: number;
}

function podiumStyle(rank: number): string {
  if (rank === 1) return "bg-amber-300 text-amber-950";
  if (rank === 2) return "bg-slate-200 text-slate-900";
  if (rank === 3) return "bg-orange-200 text-orange-950";
  return "bg-white/90 text-slate-800";
}

/**
 * 中間/最終ランキングの表示。最終確定時は演出付きの見出しに切り替える（要件6.5, 6.6, 6.7）。
 * 最終ランキングは、6位以下を5人単位のグループにまとめ、`revealStep`が指す1グループのみを
 * 表示する（前のグループは表示から消える。要件15.1〜15.3）。上位5位グループに達したときのみ、
 * 1人ずつ・上位ほど間を置くクライアント側タイマー演出を行う（要件15.4〜15.6）。
 */
export function RankingView({ entries, isFinal, revealStep, topN = 10 }: RankingViewProps) {
  const sorted = [...entries].sort((a, b) => a.rank - b.rank);
  const batches = isFinal ? buildRevealBatches(sorted) : [];
  const maxBatchIndex = Math.max(batches.length - 1, 0);
  const currentBatchIndex = isFinal ? Math.min(Math.max(revealStep ?? 0, 0), maxBatchIndex) : 0;
  const currentBatch = isFinal ? (batches[currentBatchIndex]?.entries ?? []) : sorted.slice(0, topN);
  const onFinalStage = isFinal && isFinalBatchStep(batches, currentBatchIndex);

  const [revealedCount, setRevealedCount] = useState(() => (onFinalStage ? 0 : currentBatch.length));

  useEffect(() => {
    if (!onFinalStage) {
      setRevealedCount(currentBatch.length);
      return;
    }
    setRevealedCount(0);
    const schedule = buildRevealSchedule(currentBatch.length);
    const timers: number[] = [];
    let elapsed = 0;
    schedule.forEach((step, stepIndex) => {
      elapsed += step.delayMs;
      timers.push(window.setTimeout(() => setRevealedCount(stepIndex + 1), elapsed));
    });
    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFinalStage, currentBatch.length, currentBatchIndex]);

  const rank1Revealed = onFinalStage && currentBatch.length > 0 && revealedCount >= currentBatch.length;

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
      <ol key={currentBatchIndex} className="quiz-phase-enter w-full max-w-2xl space-y-3">
        {currentBatch.map((entry, indexInBatch) => {
          const revealed = !onFinalStage || indexInBatch >= currentBatch.length - revealedCount;
          return (
            <li
              key={entry.participantId}
              className={`flex items-center gap-4 rounded-2xl px-6 py-4 shadow-lg ${podiumStyle(entry.rank)}`}
            >
              <span className="stage-rank inline-flex w-24 shrink-0 items-center gap-1 whitespace-nowrap text-2xl font-black">
                {entry.rank === 1 && revealed && <StarIcon className="h-6 w-6 shrink-0" />}
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
