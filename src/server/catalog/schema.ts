import { z } from "zod";
import type { AssetId } from "../../shared/domain-types";
import { DESIGN_TEMPLATE_IDS } from "../../shared/domain-types";

// 選択肢数（2〜4）・正解ちょうど1件・制限時間（5〜300秒）の業務ルールは
// repository.ts の validateQuestionInput が唯一の実装を持つ（VALIDATION エラーの fields もそこで確定する）。
// ここでは HTTP 境界での型・必須項目のみを検証する。

const assetId = () => z.string().transform((v): AssetId => v as AssetId);

export const createEventRequestSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  capacity: z.number().int().positive().nullable().optional(),
});
export type CreateEventRequest = z.infer<typeof createEventRequestSchema>;

export const updateEventRequestSchema = z.object({
  title: z.string().min(1).optional(),
  subtitle: z.string().optional(),
  capacity: z.number().int().positive().nullable().optional(),
});
export type UpdateEventRequest = z.infer<typeof updateEventRequestSchema>;

export const questionOptionInputSchema = z.object({
  label: z.string().min(1),
  isCorrect: z.boolean(),
});

export const questionRequestSchema = z.object({
  body: z.string().min(1),
  imageAssetId: assetId().nullable().optional(),
  timeLimitSec: z.number().int(),
  explanation: z.string().optional(),
  options: z.array(questionOptionInputSchema),
});
export type QuestionRequest = z.infer<typeof questionRequestSchema>;

export const reorderQuestionsRequestSchema = z.object({
  questionIds: z.array(z.string()),
});

export const themeSettingsRequestSchema = z.object({
  primaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  backgroundColor: z.string().min(1),
  textColor: z.string().min(1),
  logoAssetId: assetId().nullable(),
  backgroundAssetId: assetId().nullable(),
  // 後方互換のため省略可能とし、未送信の場合は未選択(null)として扱う（既存クライアントの回帰防止）
  templateId: z.enum(DESIGN_TEMPLATE_IDS).nullable().default(null),
});
export type ThemeSettingsRequest = z.infer<typeof themeSettingsRequestSchema>;

// --- Preflight -------------------------------------------------------------
// レスポンス専用の契約（要件12.3, 12.4）。項目を固定することが目的のため実装者の裁量で増減させない。

export type PreflightStatus = "ok" | "warn" | "fail";

export type PreflightCheck =
  | { readonly id: "authValid"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "sessionReachable"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "roundTripMs"; readonly status: PreflightStatus; readonly measuredMs: number }
  | { readonly id: "stageUrlReachable"; readonly status: PreflightStatus; readonly detail: string }
  | { readonly id: "questionsReady"; readonly status: PreflightStatus; readonly questionCount: number };

export interface PreflightReport {
  readonly overall: PreflightStatus;
  readonly checkedAt: number;
  readonly checks: readonly PreflightCheck[];
}

export const ROUND_TRIP_OK_MS = 300;
export const ROUND_TRIP_WARN_MS = 800;

/** DOへの往復遅延をしきい値に基づき ok/warn/fail へ分類する純粋関数（要件12.3, 12.4） */
export function classifyRoundTrip(measuredMs: number, sessionReachable: boolean): PreflightStatus {
  if (!sessionReachable) return "fail";
  if (measuredMs <= ROUND_TRIP_OK_MS) return "ok";
  if (measuredMs <= ROUND_TRIP_WARN_MS) return "warn";
  return "fail";
}
