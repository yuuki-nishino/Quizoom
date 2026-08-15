import type { AssetId, EventId } from "../../shared/domain-types";

/** 参加者トークンを認可の根拠として設問添付画像のURLを組み立てる（MediaRoutesは参加者トークンを既に受理する） */
export function buildPlayerMediaUrl(eventId: EventId, assetId: AssetId, token: string): string {
  return `/api/events/${eventId}/media/${assetId}?token=${encodeURIComponent(token)}`;
}
