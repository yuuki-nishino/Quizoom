import type { PersonalRankPayload, PersonalResult } from "../../shared/protocol";
import { formatElapsedMs } from "../shared/format";
import { Confetti } from "../shared/confetti";
import { CheckCircleIcon, StarIcon } from "../shared/icons";

export interface ResultScreenProps {
  readonly personalResult: PersonalResult | null;
  readonly personalRank: PersonalRankPayload | null;
  /** テスト問題の正解発表かどうか。trueの場合、正誤のみを示し、採点数値は表示しない（要件3.3, 3.6） */
  readonly isPractice: boolean;
}

/** 正誤・順位・最終結果の表示（要件7.6, 7.7, 7.9）。最終順位が確定していればそちらを優先表示する */
export function ResultScreen({ personalResult, personalRank, isPractice }: ResultScreenProps) {
  if (isPractice && personalResult) {
    return (
      <section
        aria-label="回答結果"
        className="quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="inline-block rounded-full bg-brand-accent/15 px-3 py-0.5 text-sm font-semibold text-brand-accent">テスト問題</p>
        <p
          className={`inline-flex items-center gap-1.5 text-2xl font-bold ${personalResult.isCorrect ? "text-emerald-600" : "text-slate-600"}`}
        >
          {personalResult.isCorrect && <CheckCircleIcon className="h-6 w-6" />}
          {personalResult.isCorrect ? "正解です！" : "不正解でした"}
        </p>
        <p className="text-lg text-brand-text/80">これはテスト問題です。正解数・順位には反映されません。</p>
      </section>
    );
  }

  if (personalRank?.isFinal) {
    return (
      <section aria-label="最終結果" className="quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <Confetti active={true} />
        <h1 className="font-display inline-flex items-center gap-2 text-3xl font-extrabold text-brand-primary">
          <StarIcon className="h-7 w-7 text-brand-accent" />
          最終結果
        </h1>
        <p className="text-2xl font-bold">あなたの順位: {personalRank.rank}位</p>
        <p className="text-lg text-brand-text/80">正解数: {personalRank.correctCount}</p>
        <p className="text-lg text-brand-text/80">合計回答時間: {formatElapsedMs(personalRank.totalElapsedMs)}</p>
      </section>
    );
  }

  if (personalResult) {
    return (
      <section
        aria-label="回答結果"
        className="quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
      >
        {personalResult.isCorrect && <Confetti active={true} />}
        <p
          className={`inline-flex items-center gap-1.5 text-2xl font-bold ${personalResult.isCorrect ? "text-emerald-600" : "text-slate-600"}`}
        >
          {personalResult.isCorrect && <CheckCircleIcon className="h-6 w-6" />}
          {personalResult.isCorrect ? "正解です！" : "不正解でした"}
        </p>
        <p className="text-lg text-brand-text/80">現在の正解数: {personalResult.correctCount}</p>
        <p className="text-lg text-brand-text/80">現在の順位: {personalResult.rank}位</p>
      </section>
    );
  }

  return null;
}
