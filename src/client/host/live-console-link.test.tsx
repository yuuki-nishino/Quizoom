import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LiveConsoleLink } from "./live-console-link";
import type { EventId } from "../../shared/domain-types";

describe("LiveConsoleLink（要件5.14, Issue #37）", () => {
  const markup = renderToStaticMarkup(<LiveConsoleLink eventId={"ev1" as EventId} />);

  it("links to the live console of the event", () => {
    expect(markup).toContain('href="/host/events/ev1/live"');
  });

  it("opens in a new tab without leaking the opener", () => {
    expect(markup).toContain('target="_blank"');
    expect(markup).toMatch(/rel="[^"]*noopener[^"]*"/);
  });

  it("keeps the 進行画面を開く label", () => {
    expect(markup).toContain("進行画面を開く");
  });
});
