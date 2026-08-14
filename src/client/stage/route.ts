import type { EventId } from "../../shared/domain-types";

export interface StageRoute {
  readonly eventId: EventId;
  readonly token: string | null;
}

/** `/stage/:eventId?token=...` を解析する純粋関数 */
export function parseStageRoute(pathname: string, search: string): StageRoute | null {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  if (segments.length < 2 || segments[0] !== "stage") return null;

  const eventId = segments[1] as EventId | undefined;
  if (!eventId) return null;

  const token = new URLSearchParams(search).get("token");
  return { eventId, token };
}
