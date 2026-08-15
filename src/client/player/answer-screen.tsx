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
    <section aria-label="出題中" className="player-answer-screen flex min-h-screen flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold leading-snug">{question.body}</h1>
      {imageUrl && <img src={imageUrl} alt="" className="max-h-48 w-full rounded-lg object-contain" />}

      <p aria-label="残り時間" className="text-center text-4xl font-black tabular-nums text-brand-primary">
        {formatRemainingSeconds(remainingMs)}秒{paused && <span className="ml-2 text-base font-normal text-amber-500">（一時停止中）</span>}
      </p>

      <div className="player-options grid grid-cols-1 gap-3" role="group" aria-label="選択肢">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={locked || submission.status === "failed"}
            aria-pressed={option.id === selectedOptionId}
            onClick={() => onSelect(option.id)}
            className={`min-h-16 rounded-xl border-2 px-4 py-4 text-lg font-semibold shadow-sm transition-colors disabled:opacity-60 ${
              option.id === selectedOptionId
                ? "border-brand-primary bg-brand-primary text-white"
                : "border-slate-300 bg-white text-slate-800 active:bg-slate-100"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {submission.status === "pending" && <p role="status" className="text-center text-sm text-slate-500">送信中…</p>}

      {accepted && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-4 py-2 text-center text-sm text-emerald-800">
          回答を受け付けました{selectedLabel ? `（${selectedLabel}）` : ""}
        </p>
      )}

      {submission.status === "rejected" && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-center text-sm text-red-800">
          {REJECTION_MESSAGES[submission.code] ?? `送信できませんでした（${submission.code}）。`}
        </p>
      )}

      {submission.status === "failed" && (
        <div role="alert" className="flex flex-col items-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          <p>送信に失敗しました。通信状態をご確認のうえ、再送信してください。</p>
          <button type="button" onClick={onRetry} className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            再送信する
          </button>
        </div>
      )}
    </section>
  );
}
