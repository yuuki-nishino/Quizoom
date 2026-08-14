import type { EventId } from "../../shared/domain-types";

/** 主催者ロールでの QuizSessionDO 接続URLを組み立てる。認証はセッションCookieに依拠し、トークンは付与しない */
export function buildHostWebSocketUrl(eventId: EventId, origin: string): string {
  const url = new URL("/connect", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("eventId", eventId);
  url.searchParams.set("role", "host");
  return url.toString();
}
