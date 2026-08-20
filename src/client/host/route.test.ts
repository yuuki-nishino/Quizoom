import { describe, it, expect } from "vitest";
import { parseHostRoute, hostRoutePath } from "./route";
import type { HostRoute } from "./route";
import type { EventId } from "../../shared/domain-types";

describe("parseHostRoute", () => {
  it("parses the bare /host path as the list view", () => {
    expect(parseHostRoute("/host")).toEqual({ view: "list" });
    expect(parseHostRoute("/host/")).toEqual({ view: "list" });
  });

  it("parses /host/events/:id as the editor questions tab by default", () => {
    expect(parseHostRoute("/host/events/e1")).toEqual({ view: "editor", eventId: "e1", tab: "questions" });
  });

  it("parses /host/events/:id/theme and /publish and /results as editor tabs", () => {
    expect(parseHostRoute("/host/events/e1/theme")).toEqual({ view: "editor", eventId: "e1", tab: "theme" });
    expect(parseHostRoute("/host/events/e1/publish")).toEqual({ view: "editor", eventId: "e1", tab: "publish" });
    expect(parseHostRoute("/host/events/e1/results")).toEqual({ view: "editor", eventId: "e1", tab: "results" });
  });

  it("parses /host/events/:id/live and /preflight as their own views", () => {
    expect(parseHostRoute("/host/events/e1/live")).toEqual({ view: "live", eventId: "e1" });
    expect(parseHostRoute("/host/events/e1/preflight")).toEqual({ view: "preflight", eventId: "e1" });
  });

  it("falls back to list for malformed paths", () => {
    expect(parseHostRoute("/host/events")).toEqual({ view: "list" });
    expect(parseHostRoute("/host/unknown/e1")).toEqual({ view: "list" });
  });

  it("parses /host/events/:id/collaborators as an editor tab", () => {
    expect(parseHostRoute("/host/events/e1/collaborators")).toEqual({ view: "editor", eventId: "e1", tab: "collaborators" });
  });

  it("parses /host/invite/:token as the invite view", () => {
    expect(parseHostRoute("/host/invite/tok-123")).toEqual({ view: "invite", token: "tok-123" });
  });

  it("falls back to list for /host/invite with no token", () => {
    expect(parseHostRoute("/host/invite")).toEqual({ view: "list" });
  });
});

describe("hostRoutePath", () => {
  it("round-trips every route variant through parseHostRoute", () => {
    const routes: HostRoute[] = [
      { view: "list" },
      { view: "editor", eventId: "e1" as EventId, tab: "questions" },
      { view: "editor", eventId: "e1" as EventId, tab: "theme" },
      { view: "editor", eventId: "e1" as EventId, tab: "publish" },
      { view: "editor", eventId: "e1" as EventId, tab: "results" },
      { view: "editor", eventId: "e1" as EventId, tab: "collaborators" },
      { view: "live", eventId: "e1" as EventId },
      { view: "preflight", eventId: "e1" as EventId },
      { view: "invite", token: "tok-123" },
    ];

    for (const route of routes) {
      expect(parseHostRoute(hostRoutePath(route))).toEqual(route);
    }
  });
});
