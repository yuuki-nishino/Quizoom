import type { LivePhase, QuestionId, RankingEntry, ThemeSettings } from "../../shared/domain-types";
import type { CommandRejectedPayload, QuestionClosedPayload, QuestionPublicView, ServerEvent } from "../../shared/protocol";
import { currentDeadlineAt, pausedRemainingMs } from "../shared/live-phase";
import { PRACTICE_QUESTION_ID } from "../../shared/practice-question";
import { buildRevealBatches, maxRevealStep } from "../../shared/ranking-batches";

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
  /** 最終結果発表の現在の段階（要件15.1〜15.3, 15.8）。中間ランキングでは常にnull */
  readonly revealStep: number | null;
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
  revealStep: null,
  lastRejection: null,
};

/** ServerEvent のストリームをホストコンソールの表示状態へ畳み込む純粋なリデューサー */
export function hostConsoleReducer(state: HostConsoleState, event: ServerEvent): HostConsoleState {
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
      return { ...state, ranking: event.payload.entries, revealStep: event.payload.revealStep };

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

// --- テスト問題モードの進行判定（要件3.1, 3.7, 3.8） -----------------------
// テスト問題は新しいLivePhase種別を持たず、既存のready/questionClosed相当の
// 状態にPRACTICE_QUESTION_IDが乗るだけなので、判定はquestionId比較のみで行う。
// practiceModeが無効な開催ではPhaseMachineがPRACTICE_QUESTION_IDを一切積まないため、
// ここで別途フラグを受け取らなくても自然にfalseのままになる。

/** 出題待機がテスト問題を指しているか（trueなら「テスト問題を出題する」ボタンを表示する） */
export function isPracticeReady(phase: LivePhase | null): boolean {
  return phase?.kind === "ready" && phase.nextQuestionId === PRACTICE_QUESTION_ID;
}

/** 正解発表済みの設問がテスト問題だったか（trueなら本編開始への導線のみを表示する） */
export function isPracticeRevealed(closedQuestionId: QuestionId | null): boolean {
  return closedQuestionId === PRACTICE_QUESTION_ID;
}

// --- 最終結果発表のグループ進行判定（要件15.8, Issue #16フォローアップ） -----

/** 「次のグループを発表する」操作を提示してよいか（上位5位の発表段階に達していない間のみ） */
export function canAdvanceFinalReveal(ranking: readonly RankingEntry[] | null, revealStep: number | null): boolean {
  if (ranking === null || revealStep === null) return false;
  const sorted = [...ranking].sort((a, b) => a.rank - b.rank);
  const batches = buildRevealBatches(sorted);
  return revealStep < maxRevealStep(batches);
}
