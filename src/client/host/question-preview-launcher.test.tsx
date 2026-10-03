import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssetId, EventId } from "../../shared/domain-types";
import { formToPreviewDraft, newPreviewSessionKey, QuestionPreviewLauncher } from "./question-preview-launcher";

describe("formToPreviewDraft", () => {
  const options = [
    { label: "りんご", isCorrect: true, imageAssetId: "img-1" as AssetId },
    { label: "みかん", isCorrect: false, imageAssetId: null },
    { label: "ぶどう", isCorrect: false, imageAssetId: "img-3" as AssetId },
    { label: "もも", isCorrect: false, imageAssetId: null },
  ];
  const form = { body: "どれ？", explanation: "解説", imageAssetId: "q-img" as AssetId, options };

  it("copies the unsaved text, explanation, question image and options of a four-option form", () => {
    const draft = formToPreviewDraft({ ...form, format: "four" });
    expect(draft.body).toBe("どれ？");
    expect(draft.explanation).toBe("解説");
    expect(draft.imageAssetId).toBe("q-img");
    expect(draft.options.map((o) => [o.label, o.imageAssetId, o.isCorrect])).toEqual([
      ["りんご", "img-1", true],
      ["みかん", null, false],
      ["ぶどう", "img-3", false],
      ["もも", null, false],
    ]);
  });

  it("previews only the options the current format shows", () => {
    expect(formToPreviewDraft({ ...form, format: "two" }).options.map((o) => o.label)).toEqual(["りんご", "みかん"]);
  });
});

describe("newPreviewSessionKey", () => {
  it("returns a non-empty URL-safe key, different on every call", () => {
    const a = newPreviewSessionKey();
    const b = newPreviewSessionKey();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).not.toBe(b);
  });
});

describe("QuestionPreviewLauncher", () => {
  const eventId = "e1" as EventId;

  it("opens the question-only preview in a new tab for this editing session", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewLauncher eventId={eventId} sessionKey="s-1" supported={true} />);
    expect(markup).toContain('href="/host/events/e1/question-preview/s-1"');
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('rel="noopener noreferrer"');
    expect(markup).toContain("プレビューを開く");
  });

  it("is disabled with a reason when the browser cannot pass the draft to another tab", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewLauncher eventId={eventId} sessionKey="s-1" supported={false} />);
    expect(markup).not.toContain("<a ");
    expect(markup).toMatch(/<button[^>]*disabled/);
    expect(markup).toContain("対応していません");
  });
});
