import type { OptionId, QuestionId, QuestionSnapshot } from "./domain-types";

export const PRACTICE_QUESTION_ID = "practice-question" as QuestionId;

const OPTION_A = "practice-option-a" as OptionId;
const OPTION_B = "practice-option-b" as OptionId;
const OPTION_C = "practice-option-c" as OptionId;
const OPTION_D = "practice-option-d" as OptionId;

/**
 * テスト問題モード(要件2.1, 2.2)で使用する、あらかじめ用意された固定の1問。
 * 本編の設問一覧には決して含めないことで、採点・ランキング・結果アーカイブからの
 * 除外(既存のScoringModuleが「questionsに存在しないquestionIdは除外する」という
 * 不変条件)を成立させる。orderIndexは負の値とし、本編設問のorderIndex(0以上)と
 * 衝突しない番兵値にする。
 */
export const PRACTICE_QUESTION: QuestionSnapshot = {
  id: PRACTICE_QUESTION_ID,
  orderIndex: -1,
  body: "これはテスト問題です。操作方法を確認するため「B」を選んでください。",
  imageAssetId: null,
  timeLimitSec: 15,
  explanation: "これはテスト問題です。この回答は正解数・回答時間・順位には反映されません。",
  options: [
    { id: OPTION_A, label: "A", orderIndex: 0 },
    { id: OPTION_B, label: "B", orderIndex: 1 },
    { id: OPTION_C, label: "C", orderIndex: 2 },
    { id: OPTION_D, label: "D", orderIndex: 3 },
  ],
  correctOptionId: OPTION_B,
};
