import type { LivePhase, OptionId, QuestionId, ThemeSettings } from "../../shared/domain-types";
import type { CommandRejectedPayload, PersonalRankPayload, QuestionClosedPayload, QuestionPublicView, ServerEvent } from "../../shared/protocol";

export interface PlayerState {
  readonly phase: LivePhase | null;
  readonly theme: ThemeSettings | null;
  readonly serverNow: number | null;
  readonly nickname: string | null;
  readonly answeredQuestionIds: readonly QuestionId[];
  readonly initialPhaseKind: LivePhase["kind"] | null;
  readonly currentQuestion: QuestionPublicView | null;
  readonly myAnswerOptionId: OptionId | null;
  readonly closedQuestion: QuestionClosedPayload | null;
  readonly personalRank: PersonalRankPayload | null;
  readonly lastRejection: CommandRejectedPayload | null;
}

export const initialPlayerState: PlayerState = {
  phase: null,
  theme: null,
  serverNow: null,
  nickname: null,
  answeredQuestionIds: [],
  initialPhaseKind: null,
  currentQuestion: null,
  myAnswerOptionId: null,
  closedQuestion: null,
  personalRank: null,
  lastRejection: null,
};

/** ServerEvent のストリームを回答画面の表示状態へ畳み込む純粋なリデューサー（host/stage側のreducerと対応） */
export function playerReducer(state: PlayerState, event: ServerEvent): PlayerState {
  switch (event.type) {
    case "stateSnapshot": {
      const self = event.payload.self;
      return {
        ...state,
        phase: event.payload.phase,
        theme: event.payload.theme,
        serverNow: event.payload.serverNow,
        nickname: self.role === "participant" ? self.nickname : state.nickname,
        answeredQuestionIds: self.role === "participant" ? self.answeredQuestionIds : state.answeredQuestionIds,
        // 途中参加判定は最初の stateSnapshot のフェーズのみで確定させ、以後の進行では変化させない
        initialPhaseKind: state.initialPhaseKind ?? event.payload.phase.kind,
      };
    }

    case "questionOpened": {
      // reopenQuestion は同一設問に対して questionOpened を再送する。既に回答済みの表示状態
      // （myAnswerOptionId 等）は、真に新しい設問へ進んだときのみリセットする（要件5.13）
      const isNewQuestion = state.currentQuestion?.id !== event.payload.question.id;
      return {
        ...state,
        phase: {
          kind: "questionOpen",
          questionId: event.payload.question.id,
          openedAt: event.payload.serverNow,
          deadlineAt: event.payload.deadlineAt,
        },
        currentQuestion: event.payload.question,
        serverNow: event.payload.serverNow,
        myAnswerOptionId: isNewQuestion ? null : state.myAnswerOptionId,
        closedQuestion: isNewQuestion ? null : state.closedQuestion,
        personalRank: isNewQuestion ? null : state.personalRank,
        lastRejection: null,
      };
    }

    case "answerAccepted":
      return { ...state, myAnswerOptionId: event.payload.selectedOptionId };

    case "questionClosed":
      return { ...state, closedQuestion: event.payload };

    case "personalRank":
      return { ...state, personalRank: event.payload };

    case "themeUpdated":
      return { ...state, theme: event.payload };

    case "commandRejected":
      return { ...state, lastRejection: event.payload };

    default:
      return state;
  }
}

/** 現在の設問に既に回答済みかどうか。今回の接続内での送信、または接続時点のスナップショットの両方を根拠とする */
export function hasAnsweredCurrentQuestion(state: PlayerState): boolean {
  if (state.myAnswerOptionId !== null) return true;
  if (!state.currentQuestion) return false;
  return state.answeredQuestionIds.includes(state.currentQuestion.id);
}
