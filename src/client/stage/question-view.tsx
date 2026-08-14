import type { QuestionPublicView } from "../../shared/protocol";
import { formatRemainingSeconds } from "../shared/format";

export interface QuestionViewProps {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly answeredCount: number;
  readonly totalCount: number;
}

/** 出題表示: 問題番号・問題文・選択肢・添付画像・残り時間・回答済み割合（要件6.2, 6.3, 6.7, 11.2） */
export function QuestionView({ question, imageUrl, remainingMs, paused, answeredCount, totalCount }: QuestionViewProps) {
  const ratio = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  return (
    <div aria-label="出題中" className="stage-question-view">
      <p className="stage-question-number">第{question.orderIndex + 1}問</p>
      <h1>{question.body}</h1>
      {imageUrl && <img src={imageUrl} alt="" className="stage-question-image" />}

      <ul className="stage-options">
        {question.options.map((option) => (
          <li key={option.id}>{option.label}</li>
        ))}
      </ul>

      <p className="stage-countdown" aria-label="残り時間">
        {formatRemainingSeconds(remainingMs)}秒{paused && "（一時停止中）"}
      </p>

      <p aria-label="回答状況">
        回答済み {answeredCount} / {totalCount}（{ratio}%）
      </p>
    </div>
  );
}
