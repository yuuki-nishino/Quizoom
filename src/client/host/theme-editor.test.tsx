import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeEditor } from "./theme-editor";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";
import type { AssetId } from "../../shared/domain-types";

describe("ThemeEditor preview", () => {
  it("uses brand-primary/brand-accent elements so color changes are visible in the preview", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("text-brand-primary");
    expect(markup).toContain("text-brand-accent");
  });

  it("mimics the stage waiting room so the projection screen's look is recognizable", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("開始をお待ちください");
  });

  it("mimics the answer screen's option buttons with a large bg-brand-primary fill so color changes are unmistakable", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("bg-brand-primary");
  });

  it("shows the uploaded logo and background images in the preview", () => {
    const event = sampleEvent({
      theme: {
        primaryColor: "#4338ca",
        accentColor: "#f59e0b",
        backgroundColor: "#ffffff",
        textColor: "#111827",
        logoAssetId: "logo-1" as AssetId,
        backgroundAssetId: "bg-1" as AssetId,
      },
    });
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain(`/api/events/${event.id}/media/logo-1`);
    expect(markup).toContain("background-image:url(/api/events/e1/media/bg-1)");
  });

  it("omits logo and background image markup when neither asset is set", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(
      <ThemeEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("background-image");
  });
});
