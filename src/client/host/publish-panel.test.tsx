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
    expect(markup).toMatch(/<button type="button"[^>]*>公開する<\/button>/);
  });

  describe("テスト問題モードの切り替え（要件1.1, 1.3, 1.4）", () => {
    function toggleTag(markup: string): string {
      const match = markup.match(/<input[^>]*id="practice-mode-toggle"[^>]*\/?>/);
      if (!match) throw new Error(`practice-mode-toggle input not found in markup: ${markup}`);
      return match[0];
    }

    it("shows the current practiceMode setting, unchecked by default", () => {
      const event = sampleEvent({ status: "draft", practiceMode: false });
      const markup = renderToStaticMarkup(
        <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
      );
      expect(markup).toContain("テスト問題モード");
      const tag = toggleTag(markup);
      expect(tag).toContain('type="checkbox"');
      expect(tag).not.toContain("checked");
    });

    it("reflects an enabled practiceMode as checked", () => {
      const event = sampleEvent({ status: "draft", practiceMode: true });
      const markup = renderToStaticMarkup(
        <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
      );
      expect(toggleTag(markup)).toContain("checked=\"\"");
    });

    it("disables the toggle while the event is live（要件1.3）", () => {
      const event = sampleEvent({ status: "live", practiceMode: false });
      const markup = renderToStaticMarkup(
        <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
      );
      expect(toggleTag(markup)).toContain("disabled=\"\"");
    });

    it("keeps the toggle enabled while the event is only published, not yet live", () => {
      const event = sampleEvent({ status: "published", practiceMode: false });
      const markup = renderToStaticMarkup(
        <PublishPanel apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
      );
      expect(toggleTag(markup)).not.toContain("disabled");
    });
  });
});
