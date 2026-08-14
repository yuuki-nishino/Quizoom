import type { LivePhase, RankingEntry, ThemeSettings } from "../../shared/domain-types";
import type { CommandRejectedPayload, QuestionClosedPayload, QuestionPublicView, ServerEvent } from "../../shared/protocol";
import { currentDeadlineAt, pausedRemainingMs } from "../shared/live-phase";

export { currentDeadlineAt, pausedRemainingMs };

export interface HostConsoleState {
  readonly phase: LivePhase | null;
  readonly theme: ThemeSettings | null;
  readonly serverNow: number | null;
  readonly participantCount: number;
  readonly participantNicknames: readonly string[];
  readonly answeredCount: number;
  readonly totalCount: number;
  readonly currentQuestion: QuestionPublicView | null;
  readonly closedQuestion: QuestionClosedPayload | null;
  readonly ranking: readonly RankingEntry[] | null;
  readonly lastRejection: CommandRejectedPayload | null;
}

export const initialHostConsoleState: HostConsoleState = {
  phase: null,
  theme: null,
  serverNow: null,
  participantCount: 0,
  participantNicknames: [],
  answeredCount: 0,
  totalCount: 0,
  currentQuestion: null,
  closedQuestion: null,
  ranking: null,
  lastRejection: null,
};

/** ServerEvent のストリームをホストコンソールの表示状態へ畳み込む純粋なリデューサー */
export function hostConsoleReducer(state: HostConsoleState, event: ServerEvent): HostConsoleState {
  switch (event.type) {
    case "stateSnapshot":
      return { ...state, phase: event.payload.phase, theme: event.payload.theme, serverNow: event.payload.serverNow };

    case "participantJoined":
      return {
        ...state,
        participantCount: event.payload.participantCount,
        participantNicknames: [...state.participantNicknames, event.payload.nickname],
      };

    case "questionOpened":
      // questionOpened は stateSnapshot を伴わないため、questionOpen フェーズをこのイベントから合成する。
      // openedAt はペイロードに含まれないため、受信時刻に最も近い serverNow で近似する（表示専用の用途に限る）
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
        totalCount: state.participantCount,
        closedQuestion: null,
        ranking: null,
      };

    case "progressUpdated":
      return { ...state, answeredCount: event.payload.answeredCount, totalCount: event.payload.totalCount };

    case "questionClosed":
      // revealAnswer 実行時にのみ送られるペイロード（正解・分布・解説）。
      // revealAnswer 自体は stateSnapshot を伴わないため、phase.kind は "questionClosed" のまま更新しない。
      // UI 側は phase ではなく closedQuestion !== null を「revealed 相当」の判定に用いる
      return { ...state, closedQuestion: event.payload };

    case "rankingUpdated":
      return { ...state, ranking: event.payload.entries };

    case "themeUpdated":
      return { ...state, theme: event.payload };

    case "commandRejected":
      return { ...state, lastRejection: event.payload };

    default:
      return state;
  }
}

// --- フェーズからUI操作の可否を導出する純粋関数 ------------------------------
// PhaseMachine の遷移規則（design.md 状態機械図）と1対1に対応させ、UIが不正な操作を提示しないようにする。

export function canStartSession(phase: LivePhase | null): boolean {
  return phase?.kind === "lobby";
}

export function canOpenQuestion(phase: LivePhase | null): boolean {
  return phase?.kind === "ready";
}

export function canCloseQuestion(phase: LivePhase | null): boolean {
  return phase?.kind === "questionOpen";
}

export function canPause(phase: LivePhase | null): boolean {
  return phase?.kind === "questionOpen";
}

export function canResume(phase: LivePhase | null): boolean {
  return phase?.kind === "paused";
}

export function canReopenQuestion(phase: LivePhase | null): boolean {
  return phase?.kind === "questionClosed";
}

export function canRevealAnswer(phase: LivePhase | null): boolean {
  return phase?.kind === "questionClosed";
}

// revealAnswer / showRanking / finalize は stateSnapshot を伴わないため、phase.kind は
// "questionClosed" のまま更新されない（上記リデューサーのコメント参照）。
// このため revealed 以降の操作可否は phase ではなく「reveal 済みか（closedQuestion !== null）」
// と「既に中間ランキングを表示済みか」を呼び出し側から明示的に渡させて判定する。

export function canShowRanking(revealed: boolean, rankingShown: boolean): boolean {
  return revealed && !rankingShown;
}

export function canFinalize(revealed: boolean): boolean {
  return revealed;
}

/** 現在表示中の設問が最終設問かどうか。凍結済みスナップショットの件数と現在の orderIndex から判定する */
export function isLastQuestion(currentOrderIndex: number | null, totalQuestions: number): boolean {
  if (currentOrderIndex === null) return false;
  return currentOrderIndex >= totalQuestions - 1;
}

export function canShowNextQuestion(revealed: boolean, lastQuestion: boolean): boolean {
  return revealed && !lastQuestion;
}
