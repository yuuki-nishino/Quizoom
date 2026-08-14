import type { AssetId, EventId } from "../../shared/domain-types";

/** stage_token を認可の根拠として設問添付画像のURLを組み立てる（MediaRoutesのstageトークン対応） */
export function buildStageMediaUrl(eventId: EventId, assetId: AssetId, token: string): string {
  return `/api/events/${eventId}/media/${assetId}?token=${encodeURIComponent(token)}`;
}
