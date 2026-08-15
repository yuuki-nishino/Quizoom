import type { OptionId, QuestionId } from "../../shared/domain-types";

export type AnswerSubmissionState =
  | { readonly status: "idle" }
  | { readonly status: "pending"; readonly questionId: QuestionId; readonly optionId: OptionId }
  | { readonly status: "accepted"; readonly questionId: QuestionId; readonly optionId: OptionId }
  | { readonly status: "rejected"; readonly questionId: QuestionId; readonly optionId: OptionId; readonly code: string }
  | { readonly status: "failed"; readonly questionId: QuestionId; readonly optionId: OptionId };

export type AnswerSubmissionAction =
  | { readonly type: "submit"; readonly questionId: QuestionId; readonly optionId: OptionId }
  | { readonly type: "accepted"; readonly questionId: QuestionId; readonly optionId: OptionId }
  | { readonly type: "rejected"; readonly questionId: QuestionId; readonly code: string }
  | { readonly type: "sendFailed"; readonly questionId: QuestionId }
  | { readonly type: "reset" };

export const initialAnswerSubmissionState: AnswerSubmissionState = { status: "idle" };

/**
 * 回答送信の状態機械。「送信中」を明示的な状態として持つことで、二重タップからの
 * 2件目送信を UI 側で機械的に防ぐ（要件7.4）。「failed」は通信エラーによる送信失敗のみを表し、
 * 再送を許可する（要件9.6）。サーバーからの業務的な拒否（rejected）は再送対象としない。
 */
export function answerSubmissionReducer(state: AnswerSubmissionState, action: AnswerSubmissionAction): AnswerSubmissionState {
  switch (action.type) {
    case "submit": {
      const canSubmit = state.status === "idle" || (state.status === "failed" && state.questionId === action.questionId);
      if (!canSubmit) return state;
      return { status: "pending", questionId: action.questionId, optionId: action.optionId };
    }

    case "accepted": {
      if (state.status !== "pending" || state.questionId !== action.questionId || state.optionId !== action.optionId) return state;
      return { status: "accepted", questionId: action.questionId, optionId: action.optionId };
    }

    case "rejected": {
      if (state.status !== "pending" || state.questionId !== action.questionId) return state;
      return { status: "rejected", questionId: state.questionId, optionId: state.optionId, code: action.code };
    }

    case "sendFailed": {
      if (state.status !== "pending" || state.questionId !== action.questionId) return state;
      return { status: "failed", questionId: state.questionId, optionId: state.optionId };
    }

    case "reset":
      return { status: "idle" };
  }
}

export function canSubmitAnswer(state: AnswerSubmissionState, questionId: QuestionId): boolean {
  if (state.status === "idle") return true;
  if (state.status === "failed") return state.questionId === questionId;
  return false;
}
