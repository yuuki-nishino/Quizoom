import { z } from "zod";
import type {
  AssetId,
  EventId,
  OptionId,
  ParticipantId,
  QuestionId,
  LivePhase,
  ThemeSettings,
  RankingEntry,
} from "./domain-types";

const questionId = () => z.string().transform((v): QuestionId => v as QuestionId);
const optionId = () => z.string().transform((v): OptionId => v as OptionId);

// --- ClientCommand -------------------------------------------------------

/** 主催者専用コマンド。submitAnswer / resync を除く進行操作 */
export const hostCommandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("startSession") }),
  z.object({ type: z.literal("openQuestion") }),
  z.object({ type: z.literal("closeQuestion") }),
  z.object({ type: z.literal("revealAnswer") }),
  z.object({ type: z.literal("nextQuestion") }),
  z.object({ type: z.literal("reopenQuestion") }),
  z.object({ type: z.literal("showRanking") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("finalize") }),
]);
export type HostCommand = z.infer<typeof hostCommandSchema>;

const submitAnswerSchema = z.object({
  type: z.literal("submitAnswer"),
  questionId: questionId(),
  optionId: optionId(),
});

const resyncSchema = z.object({ type: z.literal("resync") });

export const clientCommandSchema = z.discriminatedUnion("type", [
  ...hostCommandSchema.options,
  submitAnswerSchema,
  resyncSchema,
]);
export type ClientCommand = z.infer<typeof clientCommandSchema>;

// --- ServerEvent -----------------------------------------------------------

export interface QuestionPublicView {
  readonly id: QuestionId;
  readonly orderIndex: number;
  readonly body: string;
  readonly imageAssetId: AssetId | null;
  readonly options: readonly { readonly id: OptionId; readonly label: string; readonly orderIndex: number }[];
}

export type SelfState =
  | { readonly role: "host" }
  | { readonly role: "stage" }
  | {
      readonly role: "participant";
      readonly participantId: ParticipantId;
      readonly nickname: string;
      readonly answeredQuestionIds: readonly QuestionId[];
    };

export interface StateSnapshotPayload {
  readonly eventId: EventId;
  readonly phase: LivePhase;
  readonly theme: ThemeSettings;
  readonly serverNow: number;
  readonly self: SelfState;
}

export interface ParticipantJoinedPayload {
  readonly participantCount: number;
  readonly nickname: string;
}

export interface QuestionOpenedPayload {
  readonly question: QuestionPublicView;
  readonly deadlineAt: number;
  readonly serverNow: number;
}

export interface ProgressUpdatedPayload {
  readonly answeredCount: number;
  readonly totalCount: number;
}

export interface AnswerAcceptedPayload {
  readonly questionId: QuestionId;
  readonly selectedOptionId: OptionId;
}

export interface OptionDistributionEntry {
  readonly optionId: OptionId;
  readonly count: number;
}

export interface PersonalResult {
  readonly isCorrect: boolean;
  readonly correctCount: number;
  readonly rank: number;
}

export interface QuestionClosedPayload {
  readonly questionId: QuestionId;
  readonly correctOptionId: OptionId;
  readonly distribution: readonly OptionDistributionEntry[];
  readonly explanation: string;
  readonly personalResult: PersonalResult | null;
}

export interface RankingUpdatedPayload {
  readonly entries: readonly RankingEntry[];
  /** finalize による確定ランキングか、showRanking による中間ランキングかをクライアントが区別するためのフラグ */
  readonly isFinal: boolean;
}

export interface PersonalRankPayload {
  readonly rank: number;
  readonly correctCount: number;
  readonly totalElapsedMs: number;
  /** finalize による最終順位確定か、showRanking による中間順位かを参加者クライアントが区別するためのフラグ */
  readonly isFinal: boolean;
}

export interface CommandRejectedPayload {
  readonly code: string;
  readonly message: string;
}

export type ServerEvent =
  | { readonly type: "stateSnapshot"; readonly payload: StateSnapshotPayload }
  | { readonly type: "participantJoined"; readonly payload: ParticipantJoinedPayload }
  | { readonly type: "questionOpened"; readonly payload: QuestionOpenedPayload }
  | { readonly type: "progressUpdated"; readonly payload: ProgressUpdatedPayload }
  | { readonly type: "answerAccepted"; readonly payload: AnswerAcceptedPayload }
  | { readonly type: "questionClosed"; readonly payload: QuestionClosedPayload }
  | { readonly type: "rankingUpdated"; readonly payload: RankingUpdatedPayload }
  | { readonly type: "personalRank"; readonly payload: PersonalRankPayload }
  | { readonly type: "themeUpdated"; readonly payload: ThemeSettings }
  | { readonly type: "commandRejected"; readonly payload: CommandRejectedPayload };
