import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PublishPanel } from "./publish-panel";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";

describe("PublishPanel", () => {
  it("blocks publishing and shows a warning when the event has no questions", () => {
    const event = sampleEvent({ status: "draft", questions: [] });
    const markup = renderToStaticMarkup(
      <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("設問が1件も登録されていないため公開できません");
    expect(markup).toMatch(/公開する<\/button>/);
    expect(markup).toContain("disabled=\"\"");
  });

  it("enables the publish button once at least one question exists", () => {
    const event = sampleEvent({ status: "draft" });
    const markup = renderToStaticMarkup(
      <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).not.toContain("設問が1件も登録されていないため公開できません");
    expect(markup).toMatch(/<button type="button">公開する<\/button>/);
  });
});
