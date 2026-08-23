import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeEditor } from "./theme-editor";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";

describe("ThemeEditor", () => {
  it("links the preview button to the theme-preview route for this event, opening in a new tab", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain(`href="/host/events/${event.id}/theme-preview"`);
    expect(markup).toContain('target="_blank"');
  });

  it("no longer inlines the preview walkthrough on the edit page", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).not.toContain("開始をお待ちください");
  });
});
