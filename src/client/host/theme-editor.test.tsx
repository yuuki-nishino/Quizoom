import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeEditor } from "./theme-editor";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";
import type { AssetId } from "../../shared/domain-types";

describe("ThemeEditor preview", () => {
  it("passes the current title, theme, and resolved logo/background preview URLs to the walkthrough", () => {
    const event = sampleEvent({
      title: "My Quiz",
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
    expect(markup).toContain("My Quiz");
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
