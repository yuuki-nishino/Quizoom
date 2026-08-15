import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { QuestionEditor } from "./question-editor";
import { unimplementedApiClient, sampleEvent } from "./test-fixtures";

describe("QuestionEditor", () => {
  it("lists existing questions with an enabled add-question control when the event is a draft", () => {
    const event = sampleEvent({ status: "draft" });
    const markup = renderToStaticMarkup(
      <QuestionEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("1 + 1 は？");
    expect(markup).not.toContain("開催中のため設問は編集できません");
    expect(markup).toMatch(/<button type="button"[^>]*>設問を追加<\/button>/);
  });

  it("disables all editing controls and shows a notice when the event is live", () => {
    const event = sampleEvent({ status: "live" });
    const markup = renderToStaticMarkup(
      <QuestionEditor apiClient={unimplementedApiClient()} eventId={event.id} event={event} onEventChange={() => {}} />,
    );
    expect(markup).toContain("開催中のため設問は編集できません");
    // すべての編集系ボタン（編集・上へ・下へ・削除・設問を追加）が disabled になっていること
    const buttonCount = (markup.match(/<button/g) ?? []).length;
    const disabledCount = (markup.match(/disabled=""/g) ?? []).length;
    expect(disabledCount).toBeGreaterThan(0);
    expect(disabledCount).toBe(buttonCount);
  });
});
