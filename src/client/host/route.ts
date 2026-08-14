import type { EventId } from "../../shared/domain-types";

export type HostRoute =
  | { readonly view: "list" }
  | { readonly view: "editor"; readonly eventId: EventId; readonly tab: "questions" | "theme" | "publish" | "results" }
  | { readonly view: "preflight"; readonly eventId: EventId }
  | { readonly view: "live"; readonly eventId: EventId };

/** `/host` 以下のパス名をホストコンソールの画面状態へ変換する純粋関数 */
export function parseHostRoute(pathname: string): HostRoute {
  const segments = pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  // segments[0] === "host"
  if (segments.length <= 1) return { view: "list" };

  const eventId = segments[2] as EventId | undefined;
  if (segments[1] !== "events" || !eventId) return { view: "list" };

  const sub = segments[3];
  if (sub === "live") return { view: "live", eventId };
  if (sub === "preflight") return { view: "preflight", eventId };
  if (sub === "theme" || sub === "publish" || sub === "results") return { view: "editor", eventId, tab: sub };
  return { view: "editor", eventId, tab: "questions" };
}

export function hostRoutePath(route: HostRoute): string {
  switch (route.view) {
    case "list":
      return "/host";
    case "editor":
      return route.tab === "questions" ? `/host/events/${route.eventId}` : `/host/events/${route.eventId}/${route.tab}`;
    case "preflight":
      return `/host/events/${route.eventId}/preflight`;
    case "live":
      return `/host/events/${route.eventId}/live`;
  }
}
