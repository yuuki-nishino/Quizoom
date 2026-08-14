import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";

export interface RevealViewProps {
  readonly question: QuestionPublicView;
  readonly closed: QuestionClosedPayload;
}

/** 正解発表: 正解のハイライト・選択肢別回答分布・解説文を表示する（要件6.4, 6.7, 6.8） */
export function RevealView({ question, closed }: RevealViewProps) {
  const totalAnswers = closed.distribution.reduce((sum, d) => sum + d.count, 0);

  return (
    <div aria-label="正解発表" className="stage-reveal-view">
      <h1>{question.body}</h1>
      <ul className="stage-options">
        {question.options.map((option) => {
          const isCorrect = option.id === closed.correctOptionId;
          const entry = closed.distribution.find((d) => d.optionId === option.id);
          const count = entry?.count ?? 0;
          const pct = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
          return (
            <li key={option.id} data-correct={isCorrect} className={isCorrect ? "stage-option-correct" : undefined}>
              {option.label}
              {isCorrect && " ◎正解"}
              <span> {count}人（{pct}%）</span>
            </li>
          );
        })}
      </ul>
      {closed.explanation && <p className="stage-explanation">{closed.explanation}</p>}
    </div>
  );
}
