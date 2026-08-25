import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import { Confetti } from "../shared/confetti";
import { CheckCircleIcon } from "../shared/icons";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";

export interface RevealViewProps {
  readonly question: QuestionPublicView;
  readonly closed: QuestionClosedPayload;
}

/** 正解発表: 正解のハイライト・選択肢別回答分布・解説文を表示する（要件6.4, 6.7, 6.8） */
export function RevealView({ question, closed }: RevealViewProps) {
  const totalAnswers = closed.distribution.reduce((sum, d) => sum + d.count, 0);
  const isPractice = question.id === PRACTICE_QUESTION_ID;

  return (
    <div
      aria-label="正解発表"
      className="stage-reveal-view quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center gap-6 overflow-y-auto px-12 py-10 text-center"
    >
      <Confetti active={true} />
      {isPractice && (
        <p className="inline-block rounded-full bg-brand-accent/15 px-4 py-1 text-2xl font-bold text-brand-accent">テスト問題</p>
      )}
      <h1 className="max-w-5xl text-4xl font-extrabold leading-snug sm:text-5xl">{question.body}</h1>
      <ul className="stage-options grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
        {question.options.map((option) => {
          const isCorrect = option.id === closed.correctOptionId;
          const entry = closed.distribution.find((d) => d.optionId === option.id);
          const count = entry?.count ?? 0;
          const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
          return (
            <li
              key={option.id}
              data-correct={isCorrect}
              className={
                isCorrect
                  ? "stage-option-correct rounded-2xl border-2 border-emerald-500 bg-emerald-50 px-6 py-5 text-left text-2xl font-bold text-emerald-900 shadow-lg"
                  : "rounded-2xl border-2 border-slate-200 bg-white/80 px-6 py-5 text-left text-2xl text-slate-500 shadow"
              }
            >
              <span className="inline-flex items-center gap-1.5">
                {option.label}
                {isCorrect && (
                  <>
                    <CheckCircleIcon className="h-6 w-6 text-emerald-600" />
                    <span>正解</span>
                  </>
                )}
              </span>
              <span className="mt-1 block text-base font-normal">
                {count}人（{pct}%）
              </span>
            </li>
          );
        })}
      </ul>
      {closed.explanation && <p className="stage-explanation max-w-3xl text-xl text-brand-text/80">{closed.explanation}</p>}
    </div>
  );
}
