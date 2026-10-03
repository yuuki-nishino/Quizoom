import type { AssetId, EventId } from "../../shared/domain-types";
import type { QuestionPublicView } from "../../shared/protocol";
import { hasChoiceImages } from "../../shared/choice-image-spec";
import type { StageState } from "./stage-state";

/** stage_token を認可の根拠として設問添付画像のURLを組み立てる（MediaRoutesのstageトークン対応） */
export function buildStageMediaUrl(eventId: EventId, assetId: AssetId, token: string): string {
  return `/api/events/${eventId}/media/${assetId}?token=${encodeURIComponent(token)}`;
}

/** 画像を持つ選択肢だけを対象に、選択肢IDごとの投影用画像URLを組み立てる。画像のない選択肢は含めない */
export function buildOptionImageUrls(eventId: EventId, question: QuestionPublicView | null, token: string): Readonly<Record<string, string>> {
  if (question === null) return {};
  return Object.fromEntries(
    question.options.flatMap((option) => (option.imageAssetId ? [[option.id, buildStageMediaUrl(eventId, option.imageAssetId, token)] as const] : [])),
  );
}

/**
 * 出題表示または正解発表で、選択肢画像付きのフィットレイアウトが表示されているか。
 * このとき ThemeProvider を画面高に固定し、収まらない分をページのスクロールではなくレイアウト内の縮小で吸収する
 */
export function isChoiceImageScreen(state: StageState): boolean {
  return state.ranking === null && state.currentQuestion !== null && hasChoiceImages(state.currentQuestion.options);
}
