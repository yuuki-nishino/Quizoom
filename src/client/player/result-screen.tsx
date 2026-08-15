import type { PersonalRankPayload, PersonalResult } from "../../shared/protocol";
import { formatElapsedMs } from "../shared/format";

export interface ResultScreenProps {
  readonly personalResult: PersonalResult | null;
  readonly personalRank: PersonalRankPayload | null;
}

/** 正誤・順位・最終結果の表示（要件7.6, 7.7, 7.9）。最終順位が確定していればそちらを優先表示する */
export function ResultScreen({ personalResult, personalRank }: ResultScreenProps) {
  if (personalRank?.isFinal) {
    return (
      <section aria-label="最終結果">
        <h1>最終結果</h1>
        <p>あなたの順位: {personalRank.rank}位</p>
        <p>正解数: {personalRank.correctCount}</p>
        <p>合計回答時間: {formatElapsedMs(personalRank.totalElapsedMs)}</p>
      </section>
    );
  }

  if (personalResult) {
    return (
      <section aria-label="回答結果">
        <p>{personalResult.isCorrect ? "正解です！" : "不正解でした"}</p>
        <p>現在の正解数: {personalResult.correctCount}</p>
        <p>現在の順位: {personalResult.rank}位</p>
      </section>
    );
  }

  return null;
}
