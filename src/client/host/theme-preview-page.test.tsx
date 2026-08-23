import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemePreviewPage, toPreviewQuestion } from "./theme-preview-page";
import { unimplementedApiClient, sampleEvent, sampleQuestion } from "./test-fixtures";
import type { AssetId } from "../../shared/domain-types";

describe("ThemePreviewPage", () => {
  it("shows a loading state before the event fetch resolves", () => {
    const event = sampleEvent();
    const markup = renderToStaticMarkup(<ThemePreviewPage apiClient={unimplementedApiClient()} eventId={event.id} />);
    expect(markup).toContain("読み込み中");
  });
});

describe("toPreviewQuestion", () => {
  it("returns null when the event has no questions yet", () => {
    const event = sampleEvent({ questions: [] });
    expect(toPreviewQuestion(event.id, event)).toBeNull();
  });

  it("maps the first question to a public view and resolves the correct option id", () => {
    const event = sampleEvent();
    const preview = toPreviewQuestion(event.id, event);
    expect(preview?.question.body).toBe("1 + 1 は？");
    expect(preview?.correctOptionId).toBe("o2");
    expect(preview?.imageUrl).toBeNull();
    // isCorrect must not leak into the public view passed to stage/player components
    expect(preview?.question).not.toHaveProperty("options.0.isCorrect");
  });

  it("resolves the question's image via the host-authenticated media URL", () => {
    const event = sampleEvent({ questions: [sampleQuestion({ imageAssetId: "asset-1" as AssetId })] });
    const preview = toPreviewQuestion(event.id, event);
    expect(preview?.imageUrl).toBe(`/api/events/${event.id}/media/asset-1`);
  });
});
