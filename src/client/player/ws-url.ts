import type { EventId } from "../../shared/domain-types";

/** 参加者トークンでの QuizSessionDO 接続URLを組み立てる */
export function buildPlayerWebSocketUrl(eventId: EventId, token: string, origin: string): string {
  const url = new URL("/connect", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.searchParams.set("eventId", eventId);
  url.searchParams.set("role", "participant");
  url.searchParams.set("token", token);
  return url.toString();
}
