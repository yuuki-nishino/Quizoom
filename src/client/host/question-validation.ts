export interface QuestionFormOption {
  readonly label: string;
  readonly isCorrect: boolean;
}

export interface QuestionFormValues {
  readonly body: string;
  readonly timeLimitSec: number;
  readonly options: readonly QuestionFormOption[];
}

export type QuestionValidationField = "body" | "options" | "correctOption" | "timeLimitSec";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;
const MIN_TIME_LIMIT_SEC = 5;
const MAX_TIME_LIMIT_SEC = 300;

/**
 * サーバー側 validateQuestionInput（repository.ts）と同じ不変条件をクライアントで先回り検証する。
 * 保存前に不足項目を提示し、無駄な往復リクエストを避けるための実装であり、
 * 最終的な正としての判定は引き続きサーバー側が行う。
 */
export function validateQuestionForm(values: QuestionFormValues): readonly QuestionValidationField[] {
  const fields: QuestionValidationField[] = [];

  if (values.body.trim().length === 0) fields.push("body");
  if (values.options.length < MIN_OPTIONS || values.options.length > MAX_OPTIONS) fields.push("options");
  if (values.options.filter((o) => o.isCorrect).length !== 1) fields.push("correctOption");
  if (values.timeLimitSec < MIN_TIME_LIMIT_SEC || values.timeLimitSec > MAX_TIME_LIMIT_SEC) fields.push("timeLimitSec");

  return fields;
}

export type QuestionFormat = "two" | "four";

export function optionCountForFormat(format: QuestionFormat): number {
  return format === "two" ? 2 : 4;
}

/** 二択・四択の切り替え時に選択肢配列の長さを揃える。既存のラベル・正解指定はできる限り保持する */
export function resizeOptions(options: readonly QuestionFormOption[], format: QuestionFormat): readonly QuestionFormOption[] {
  const targetLength = optionCountForFormat(format);
  if (options.length === targetLength) return options;

  if (options.length > targetLength) {
    const trimmed = options.slice(0, targetLength);
    return trimmed.some((o) => o.isCorrect) ? trimmed : trimmed.map((o, i) => (i === 0 ? { ...o, isCorrect: true } : o));
  }

  const padding = Array.from({ length: targetLength - options.length }, () => ({ label: "", isCorrect: false }));
  return [...options, ...padding];
}
