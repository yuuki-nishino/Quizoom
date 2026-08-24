import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeEditor } from "./theme-editor";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";
import { DESIGN_TEMPLATES } from "../../shared/design-templates";

describe("ThemeEditor", () => {
  it("presents every catalog design template as a named, scene-labeled card", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    for (const template of DESIGN_TEMPLATES) {
      expect(markup).toContain(template.name);
      expect(markup).toContain(template.targetScene);
    }
  });

  it("marks the event's currently selected template as pressed", () => {
    const event = sampleEvent({ theme: { ...sampleEvent().theme, templateId: "fancy-party" } });
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    const fancyIndex = markup.indexOf("ファンシー");
    const beforeFancyCard = markup.lastIndexOf("<button", fancyIndex);
    expect(markup.slice(beforeFancyCard, fancyIndex)).toContain('aria-pressed="true"');
  });

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

  it("does not show a remove option for logo/background when neither image is set", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).not.toContain("削除");
    expect(markup).not.toContain("設定済み");
  });

  it("shows a remove option only for the image kind that is currently set (要件3.10)", () => {
    const event = sampleEvent({ theme: { ...sampleEvent().theme, logoAssetId: "logo-1" as never } });
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup.match(/設定済み/g)?.length).toBe(1);
    expect(markup.match(/削除/g)?.length).toBe(1);
  });
});
