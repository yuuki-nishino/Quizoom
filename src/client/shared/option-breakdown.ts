import type { OptionId } from "../../shared/domain-types";
import type { QuestionClosedPayload, QuestionPublicView } from "../../shared/protocol";

export interface OptionBreakdownRow {
  readonly optionId: OptionId;
  /** 選択肢の文言。question が null のときは「選択肢N」の代替ラベル */
  readonly label: string;
  readonly count: number;
  /** 回答総数に対する整数パーセント。回答総数が0のときは0 */
  readonly pct: number;
  readonly isCorrect: boolean;
}

/**
 * 正解発表の表示行（ラベル・件数・割合・正誤）を組み立てる（要件5.6, 6.4）。
 *
 * 進行画面（LiveConsole）と投影画面（RevealView）は同じ questionClosed ペイロードを描画するため、
 * optionId からラベルを解決する計算をここに集約し、各画面はレンダリングのみを担う。
 * 以前はこの変換が各画面に散在し、進行画面だけが解決を行っていなかったため、
 * 選択肢IDのUUIDがそのまま表示されていた（Issue #29）。
 *
 * question が null になるのは、主催者が「回答受付終了」から「正解発表」までの間に再接続した場合。
 * QuestionClosedPayload は stateSnapshot に含まれず currentQuestion が復元されないため、
 * ラベルを解決できない。この場合は distribution の並び順から「選択肢N」を割り当てる
 * （サーバーは distribution を question.options の順で構築するため、実際の並びと対応する）。
 */
export function buildOptionBreakdown(question: QuestionPublicView | null, closed: QuestionClosedPayload): readonly OptionBreakdownRow[] {
  const totalAnswers = closed.distribution.reduce((sum, d) => sum + d.count, 0);
  const toPct = (count: number) => (totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0);
  const isCorrect = (optionId: OptionId) => optionId === closed.correctOptionId;

  if (question === null) {
    return closed.distribution.map((d, index) => ({
      optionId: d.optionId,
      label: `選択肢${index + 1}`,
      count: d.count,
      pct: toPct(d.count),
      isCorrect: isCorrect(d.optionId),
    }));
  }

  return [...question.options]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((option) => {
      // 回答が0件の選択肢は distribution に現れないことがあるため、欠落は0人として扱う（要件5.6）
      const count = closed.distribution.find((d) => d.optionId === option.id)?.count ?? 0;
      return {
        optionId: option.id,
        label: option.label,
        count,
        pct: toPct(count),
        isCorrect: isCorrect(option.id),
      };
    });
}
