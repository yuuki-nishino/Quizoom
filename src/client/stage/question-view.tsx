import type { QuestionPublicView } from "../../shared/protocol";
import { formatRemainingSeconds } from "../shared/format";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";
import { hasChoiceImages } from "../../shared/choice-image-spec";
import { OptionTile } from "./option-tile";

export interface QuestionViewProps {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  /** 選択肢IDごとの画像URL。画像のない選択肢、またはURL未解決の選択肢は含めない(省略時は全て画像なし) */
  readonly optionImageUrls?: Readonly<Record<string, string | null>>;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly answeredCount: number;
  readonly totalCount: number;
}

/**
 * 出題表示: 問題番号・問題文・選択肢・添付画像・残り時間・回答済み割合（要件6.2, 6.3, 6.7, 11.2）。
 * 添付画像がある場合は、画像の分だけ縦方向のスペースが不足しやすいため、画像の最大高さ・余白・
 * 選択肢のサイズを詰めたコンパクト表示に切り替える。画像なしの場合は従来どおりゆったり表示する
 * (投影画面は観客が能動的にスクロールできないため、要素が画面外に隠れないことを優先する)
 */
export function QuestionView({ question, imageUrl, optionImageUrls = {}, remainingMs, paused, answeredCount, totalCount }: QuestionViewProps) {
  const ratio = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;
  if (hasChoiceImages(question.options)) {
    return (
      <ChoiceImageQuestionView
        question={question}
        imageUrl={imageUrl}
        optionImageUrls={optionImageUrls}
        remainingMs={remainingMs}
        paused={paused}
        answeredCount={answeredCount}
        totalCount={totalCount}
        ratio={ratio}
      />
    );
  }
  const hasImage = imageUrl !== null;
  const isPractice = question.id === PRACTICE_QUESTION_ID;

  return (
    <div
      aria-label="出題中"
      className={`stage-question-view quiz-phase-enter flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-12 text-center ${
        hasImage ? "gap-3 py-6" : "gap-6 py-10"
      }`}
    >
      <p
        className={`stage-question-number inline-block rounded-full bg-brand-accent/15 font-bold text-brand-accent ${
          hasImage ? "px-3 py-0.5 text-xl" : "px-4 py-1 text-2xl"
        }`}
      >
        {isPractice ? "テスト問題" : `第${question.orderIndex + 1}問`}
      </p>
      <h1
        className={`max-w-5xl font-extrabold leading-snug tracking-tight ${
          hasImage ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"
        }`}
      >
        {question.body}
      </h1>
      {imageUrl && <img src={imageUrl} alt="" className="stage-question-image max-h-56 rounded-2xl object-contain shadow-xl" />}

      <ul className={`stage-options grid w-full max-w-3xl grid-cols-1 sm:grid-cols-2 ${hasImage ? "gap-2" : "gap-4"}`}>
        {question.options.map((option) => (
          <li
            key={option.id}
            className={`rounded-2xl border-2 border-brand-primary/30 bg-white/95 font-semibold text-slate-800 shadow-lg ${
              hasImage ? "px-4 py-2 text-lg" : "px-6 py-5 text-2xl"
            }`}
          >
            {option.label}
          </li>
        ))}
      </ul>

      <p
        className={`stage-countdown font-black tabular-nums text-brand-primary drop-shadow-sm ${hasImage ? "text-4xl" : "mt-2 text-6xl"}`}
        aria-label="残り時間"
      >
        {formatRemainingSeconds(remainingMs)}秒
        {paused && <span className="ml-3 text-2xl font-normal text-amber-500">（一時停止中）</span>}
      </p>

      <div className="w-full max-w-md">
        <p aria-label="回答状況" className={hasImage ? "text-sm text-brand-text/70" : "text-xl text-brand-text/70"}>
          回答済み {answeredCount} / {totalCount}（{ratio}%）
        </p>
        <div aria-hidden="true" className="mt-1 h-2 w-full overflow-hidden rounded-full bg-brand-text/10">
          <div className="h-full rounded-full bg-brand-accent transition-[width] duration-500 ease-out" style={{ width: `${ratio}%` }} />
        </div>
      </div>
    </div>
  );
}

/** 選択肢の数に対応する列数(横1列)。Tailwind が静的に検出できるよう完全なクラス名で持つ */
const OPTION_COLUMNS_CLASS: Readonly<Record<number, string>> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

interface ChoiceImageQuestionViewProps extends Required<Pick<QuestionViewProps, "optionImageUrls">> {
  readonly question: QuestionPublicView;
  readonly imageUrl: string | null;
  readonly remainingMs: number;
  readonly paused: boolean;
  readonly answeredCount: number;
  readonly totalCount: number;
  readonly ratio: number;
}

/**
 * 選択肢画像を持つ設問の出題表示(要件3)。投影画面は観客がスクロールできないため、スクロールを発生させず
 * 画面内に収まる「フィットレイアウト」にする。すべての領域を min-h-0 で縮小可能にし、画像領域が残りの高さを
 * 分け合う(設問画像 2 : 選択肢 3)。選択肢は2択=2列・4択=4列の横1列で、縮小は画像の表示サイズにのみ現れる。
 * ルートは overflow-hidden とし、仮に収まらない場合も画面外へスクロールではなくクリップになる。
 */
function ChoiceImageQuestionView({
  question,
  imageUrl,
  optionImageUrls,
  remainingMs,
  paused,
  answeredCount,
  totalCount,
  ratio,
}: ChoiceImageQuestionViewProps) {
  const isPractice = question.id === PRACTICE_QUESTION_ID;
  const columns = OPTION_COLUMNS_CLASS[question.options.length] ?? "grid-cols-4";
  const options = [...question.options].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div
      aria-label="出題中"
      className="stage-question-view stage-question-fit quiz-phase-enter flex min-h-0 flex-1 flex-col items-center gap-[1.1cqh] overflow-hidden px-[2.5cqw] py-[1.4cqh] text-center"
    >
      <p className="stage-question-number inline-block shrink-0 rounded-full bg-brand-accent/15 px-3 py-0.5 text-[max(12px,1.9cqh)] font-bold text-brand-accent">
        {isPractice ? "テスト問題" : `第${question.orderIndex + 1}問`}
      </p>
      <h1 className="line-clamp-3 max-w-5xl shrink-0 text-[max(16px,2.8cqh)] font-extrabold leading-snug tracking-tight">{question.body}</h1>
      {imageUrl && (
        <div className="stage-question-image flex min-h-0 w-full flex-[2] items-center justify-center">
          <img src={imageUrl} alt="" className="h-full max-w-full rounded-2xl object-contain shadow-xl" />
        </div>
      )}

      <ul className={`stage-options grid min-h-0 w-full flex-[3] grid-rows-1 gap-[1.1cqh] ${columns}`}>
        {options.map((option) => (
          <li key={option.id} className="min-h-0 min-w-0">
            <OptionTile label={option.label} imageUrl={optionImageUrls[option.id] ?? null} />
          </li>
        ))}
      </ul>

      <p className="stage-countdown shrink-0 text-[max(18px,3.4cqh)] font-black tabular-nums text-brand-primary drop-shadow-sm" aria-label="残り時間">
        {formatRemainingSeconds(remainingMs)}秒
        {paused && <span className="ml-3 text-2xl font-normal text-amber-500">（一時停止中）</span>}
      </p>

      <div className="w-full max-w-md shrink-0">
        <p aria-label="回答状況" className="text-[max(10px,1.3cqh)] text-brand-text/70">
          回答済み {answeredCount} / {totalCount}（{ratio}%）
        </p>
        <div aria-hidden="true" className="mt-1 h-[max(4px,0.7cqh)] w-full overflow-hidden rounded-full bg-brand-text/10">
          <div className="h-full rounded-full bg-brand-accent transition-[width] duration-500 ease-out" style={{ width: `${ratio}%` }} />
        </div>
      </div>
    </div>
  );
}
