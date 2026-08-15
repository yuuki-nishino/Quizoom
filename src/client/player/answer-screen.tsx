import type { OptionId } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { formatRemainingSeconds } from "../shared/format";
import type { AnswerSubmissionState } from "./answer-submission";

export interface AnswerScreenProps {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly alreadyAnswered: boolean;
  readonly submission: AnswerSubmissionState;
  readonly onSelect: (optionId: OptionId) => void;
  readonly onRetry: () => void;
}

const REJECTION_MESSAGES: Record<string, string> = {
  ANSWER_WINDOW_CLOSED: "受付が終了しているため、この回答は無効です。",
  ALREADY_ANSWERED: "既に回答済みです。",
};

/** 出題表示と回答送信（要件7.2, 7.3, 7.4, 7.5, 7.8, 11.1） */
export function AnswerScreen({ question, imageUrl, remainingMs, paused, alreadyAnswered, submission, onSelect, onRetry }: AnswerScreenProps) {
  const accepted = submission.status === "accepted" || (alreadyAnswered && submission.status === "idle");
  const locked = accepted || submission.status === "pending" || submission.status === "rejected";
  const selectedOptionId = submission.status !== "idle" ? submission.optionId : null;
  const selectedLabel = selectedOptionId ? question.options.find((o) => o.id === selectedOptionId)?.label : undefined;

  return (
    <section aria-label="出題中" className="player-answer-screen">
      <h1>{question.body}</h1>
      {imageUrl && <img src={imageUrl} alt="" />}

      <p aria-label="残り時間">
        {formatRemainingSeconds(remainingMs)}秒{paused && "（一時停止中）"}
      </p>

      <div className="player-options" role="group" aria-label="選択肢">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={locked || submission.status === "failed"}
            aria-pressed={option.id === selectedOptionId}
            onClick={() => onSelect(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {submission.status === "pending" && <p role="status">送信中…</p>}

      {accepted && (
        <p role="status">回答を受け付けました{selectedLabel ? `（${selectedLabel}）` : ""}</p>
      )}

      {submission.status === "rejected" && (
        <p role="alert">{REJECTION_MESSAGES[submission.code] ?? `送信できませんでした（${submission.code}）。`}</p>
      )}

      {submission.status === "failed" && (
        <div role="alert">
          <p>送信に失敗しました。通信状態をご確認のうえ、再送信してください。</p>
          <button type="button" onClick={onRetry}>
            再送信する
          </button>
        </div>
      )}
    </section>
  );
}
