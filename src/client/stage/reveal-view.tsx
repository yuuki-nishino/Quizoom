import type { QuestionPublicView, QuestionClosedPayload } from "../../shared/protocol";
import { Confetti } from "../shared/confetti";
import { CheckCircleIcon } from "../shared/icons";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";
import { buildOptionBreakdown } from "../shared/option-breakdown";
import { hasChoiceImages } from "../../shared/choice-image-spec";
import { OptionTile } from "./option-tile";

export interface RevealViewProps {
  readonly question: QuestionPublicView;
  readonly closed: QuestionClosedPayload;
  /** 選択肢IDごとの画像URL。画像のない選択肢、またはURL未解決の選択肢は含めない(省略時は全て画像なし) */
  readonly optionImageUrls?: Readonly<Record<string, string | null>>;
}

/** 選択肢の数に対応する列数(横1列)。Tailwind が静的に検出できるよう完全なクラス名で持つ */
const OPTION_COLUMNS_CLASS: Readonly<Record<number, string>> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

/** 正解発表: 正解のハイライト・選択肢別回答分布・解説文を表示する（要件6.4, 6.7, 6.8） */
export function RevealView({ question, closed, optionImageUrls = {} }: RevealViewProps) {
  if (hasChoiceImages(question.options)) {
    return <ChoiceImageRevealView question={question} closed={closed} optionImageUrls={optionImageUrls} />;
  }
  // 進行画面（LiveConsole）と変換ロジックが乖離しないよう、表示行の組み立ては共通の純粋関数に寄せる（Issue #29）
  const breakdown = buildOptionBreakdown(question, closed);
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
      <ul className="stage-options grid w-full max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2">
        {breakdown.map(({ optionId, label, count, pct, isCorrect }) => {
          return (
            <li
              key={optionId}
              data-correct={isCorrect}
              className={
                isCorrect
                  ? "stage-option-correct flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-emerald-500 bg-emerald-50 px-8 py-6 text-center text-3xl font-bold leading-snug text-emerald-900 shadow-lg"
                  : "flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white/80 px-8 py-6 text-center text-3xl leading-snug text-slate-500 shadow"
              }
            >
              {isCorrect && (
                <span className="stage-correct-badge inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-600 px-4 py-1 text-xl font-bold text-white">
                  <CheckCircleIcon className="h-6 w-6" />
                  <span>正解</span>
                </span>
              )}
              <span className="break-words">{label}</span>
              <span className="block text-xl font-normal">
                {count}人（{pct}%）
              </span>
            </li>
          );
        })}
      </ul>
      {closed.explanation && <p className="stage-explanation max-w-5xl text-3xl leading-relaxed text-brand-text/80">{closed.explanation}</p>}
    </div>
  );
}

/**
 * 選択肢画像を持つ設問の正解発表(要件4)。出題表示と同じく、スクロールを発生させず画面内に収まる
 * フィットレイアウトにする。正解の画像は既存と同じ強調で示し、各選択肢の回答数・割合も常に表示する。
 */
function ChoiceImageRevealView({ question, closed, optionImageUrls }: Required<RevealViewProps>) {
  const breakdown = buildOptionBreakdown(question, closed);
  const isPractice = question.id === PRACTICE_QUESTION_ID;
  const columns = OPTION_COLUMNS_CLASS[breakdown.length] ?? "grid-cols-4";

  return (
    <div
      aria-label="正解発表"
      className="stage-reveal-view stage-reveal-fit quiz-phase-enter relative flex min-h-0 flex-1 flex-col items-center gap-[1.1cqh] overflow-hidden px-[2.5cqw] py-[1.4cqh] text-center"
    >
      <Confetti active={true} />
      {isPractice && (
        <p className="inline-block shrink-0 rounded-full bg-brand-accent/15 px-3 py-0.5 text-[max(12px,1.9cqh)] font-bold text-brand-accent">テスト問題</p>
      )}
      <h1 className="line-clamp-3 max-w-5xl shrink-0 text-[max(16px,2.8cqh)] font-extrabold leading-snug">{question.body}</h1>
      <ul className={`stage-options grid min-h-0 w-full flex-1 grid-rows-1 gap-[1.1cqh] ${columns}`}>
        {breakdown.map(({ optionId, label, count, pct, isCorrect }) => (
          <li key={optionId} className="min-h-0 min-w-0">
            <OptionTile label={label} imageUrl={optionImageUrls[optionId] ?? null} reveal={{ isCorrect, count, pct }} />
          </li>
        ))}
      </ul>
      {closed.explanation && (
        <p className="stage-explanation line-clamp-2 max-w-3xl shrink-0 text-[max(12px,1.7cqh)] text-brand-text/80">{closed.explanation}</p>
      )}
    </div>
  );
}
