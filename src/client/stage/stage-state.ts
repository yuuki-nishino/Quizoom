import type { LivePhase, RankingEntry, ThemeSettings } from "../../shared/domain-types";
import type { QuestionClosedPayload, QuestionPublicView, ServerEvent } from "../../shared/protocol";

export interface StageState {
  readonly phase: LivePhase | null;
  readonly theme: ThemeSettings | null;
  readonly serverNow: number | null;
  readonly currentQuestion: QuestionPublicView | null;
  readonly answeredCount: number;
  readonly totalCount: number;
  readonly closedQuestion: QuestionClosedPayload | null;
  readonly ranking: readonly RankingEntry[] | null;
  readonly isFinalRanking: boolean;
  /** 最終結果発表の現在の段階（要件15.1〜15.3）。中間ランキングでは常にnull */
  readonly revealStep: number | null;
  readonly participantCount: number;
}

export const initialStageState: StageState = {
  phase: null,
  theme: null,
  serverNow: null,
  currentQuestion: null,
  answeredCount: 0,
  totalCount: 0,
  closedQuestion: null,
  ranking: null,
  isFinalRanking: false,
  revealStep: null,
  participantCount: 0,
};

/** ServerEvent のストリームを投影画面の表示状態へ畳み込む純粋なリデューサー（host側 hostConsoleReducer と対応） */
export function stageReducer(state: StageState, event: ServerEvent): StageState {
  switch (event.type) {
    case "stateSnapshot":
      return {
        ...state,
        phase: event.payload.phase,
        theme: event.payload.theme,
        serverNow: event.payload.serverNow,
        participantCount: event.payload.participantCount,
      };

    case "participantJoined":
      return { ...state, participantCount: event.payload.participantCount };

    case "questionOpened":
      // host側と同様、questionOpened は stateSnapshot を伴わないためこのイベントから phase を合成する
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
        answeredCount: 0,
        totalCount: state.totalCount,
        closedQuestion: null,
        ranking: null,
        isFinalRanking: false,
        revealStep: null,
      };

    case "progressUpdated":
      return { ...state, answeredCount: event.payload.answeredCount, totalCount: event.payload.totalCount };

    case "questionClosed":
      return { ...state, closedQuestion: event.payload };

    case "rankingUpdated":
      return { ...state, ranking: event.payload.entries, isFinalRanking: event.payload.isFinal, revealStep: event.payload.revealStep };

    case "themeUpdated":
      return { ...state, theme: event.payload };

    default:
      return state;
  }
}
