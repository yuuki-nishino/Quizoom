export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EventId = Brand<string, "EventId">;
export type QuestionId = Brand<string, "QuestionId">;
export type OptionId = Brand<string, "OptionId">;
export type ParticipantId = Brand<string, "ParticipantId">;
export type ResultId = Brand<string, "ResultId">;
export type AssetId = Brand<string, "AssetId">;

export type EventStatus = "draft" | "published" | "live" | "finished";

export interface ThemeSettings {
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
  readonly logoAssetId: AssetId | null;
  readonly backgroundAssetId: AssetId | null;
}

/** 共有ページ専用の配色型。画像参照を持たせないことで要件10.6の緩和を実装上不可能にする */
export interface PublicTheme {
  readonly primaryColor: string;
  readonly accentColor: string;
  readonly backgroundColor: string;
  readonly textColor: string;
}

/** 共有ページへ公開してよい参加者情報の全量。設問別正誤・参加者IDを表現できないことが要件10.8の担保そのもの */
export interface PublicResultEntry {
  readonly rank: number;
  readonly nickname: string;
  readonly correctCount: number;
  readonly totalElapsedMs: number;
}

export interface PublicResult {
  readonly eventTitle: string;
  readonly theme: PublicTheme;
  readonly finalizedAt: number;
  readonly entries: readonly PublicResultEntry[];
}

export interface OptionSnapshot {
  readonly id: OptionId;
  readonly label: string;
  readonly orderIndex: number;
}

export interface QuestionSnapshot {
  readonly id: QuestionId;
  readonly orderIndex: number;
  readonly body: string;
  readonly imageAssetId: AssetId | null;
  readonly timeLimitSec: number;
  readonly explanation: string;
  readonly options: readonly OptionSnapshot[];
  readonly correctOptionId: OptionId;
}

export type LivePhase =
  | { readonly kind: "lobby" }
  | { readonly kind: "ready"; readonly nextQuestionId: QuestionId | null }
  | {
      readonly kind: "questionOpen";
      readonly questionId: QuestionId;
      readonly openedAt: number;
      readonly deadlineAt: number;
    }
  | { readonly kind: "questionClosed"; readonly questionId: QuestionId; readonly openedAt: number }
  | { readonly kind: "revealed"; readonly questionId: QuestionId }
  | { readonly kind: "interimRanking"; readonly nextQuestionId: QuestionId | null }
  | { readonly kind: "paused"; readonly resumeTo: LivePhase; readonly remainingMs: number }
  | { readonly kind: "finalRanking" };

export type AlarmIntent = { readonly kind: "set"; readonly at: number } | { readonly kind: "clear" } | { readonly kind: "noop" };

export type TransitionError =
  | { readonly code: "INVALID_PHASE"; readonly current: LivePhase["kind"]; readonly command: string }
  | { readonly code: "NO_NEXT_QUESTION" }
  | { readonly code: "ALREADY_REVEALED" };

export type JoinRejection =
  | { readonly code: "NICKNAME_TAKEN" }
  | { readonly code: "CAPACITY_REACHED" }
  | { readonly code: "EVENT_FINISHED" };

export interface Participant {
  readonly id: ParticipantId;
  readonly nickname: string;
  readonly joinedSeq: number;
  readonly joinedAt: number;
}

export interface AnswerRecord {
  readonly participantId: ParticipantId;
  readonly questionId: QuestionId;
  readonly selectedOptionId: OptionId;
  readonly elapsedMs: number;
}

export interface ParticipantScore {
  readonly participantId: ParticipantId;
  readonly nickname: string;
  readonly correctCount: number;
  readonly totalElapsedMs: number;
  readonly joinedSeq: number;
}

export interface RankingEntry extends ParticipantScore {
  readonly rank: number;
}

/** DO SQLite の可変領域（event_meta_json）に対応。publish 時に投入され、開催中も更新されうる */
export interface EventMeta {
  readonly capacity: number;
  readonly status: EventStatus;
  readonly theme: ThemeSettings;
}

export interface SessionState {
  readonly phase: LivePhase;
  readonly eventMeta: EventMeta;
  readonly questions: readonly QuestionSnapshot[] | null;
  readonly startedAt: number | null;
}

export type AnswerOutcome =
  | { readonly kind: "recorded"; readonly record: AnswerRecord }
  | { readonly kind: "alreadyAnswered"; readonly existing: AnswerRecord };
