import { describe, it, expect } from "vitest";
import type { AssetId, EventId } from "../../shared/domain-types";
import type { PreviewDraft } from "./question-preview-channel";
import {
  draftToPreviewQuestion,
  PREVIEW_TIMEOUT_MS,
  previewUnavailableMessage,
  reducePreviewSession,
  type PreviewSessionState,
} from "./question-preview-state";

const draft = (body = "どっち？"): PreviewDraft => ({
  body,
  explanation: "解説です",
  imageAssetId: "q-img" as AssetId,
  options: [
    { label: "りんご", imageAssetId: "img-1" as AssetId, isCorrect: false },
    { label: "みかん", imageAssetId: null, isCorrect: true },
  ],
});

describe("reducePreviewSession", () => {
  const waiting: PreviewSessionState = { status: "waiting" };

  it("becomes ready when a draft arrives, and keeps following newer drafts", () => {
    const first = reducePreviewSession(waiting, { type: "draft", draft: draft("v1") });
    expect(first).toEqual({ status: "ready", draft: draft("v1") });
    expect(reducePreviewSession(first, { type: "draft", draft: draft("v2") })).toEqual({ status: "ready", draft: draft("v2") });
  });

  it("becomes unavailable and drops the previous content when the editor closes", () => {
    const ready = reducePreviewSession(waiting, { type: "draft", draft: draft() });
    expect(reducePreviewSession(ready, { type: "closed" })).toEqual({ status: "unavailable", reason: "closed" });
  });

  it("times out only while still waiting for the first draft", () => {
    expect(reducePreviewSession(waiting, { type: "timeout" })).toEqual({ status: "unavailable", reason: "no-editor" });
    const ready = reducePreviewSession(waiting, { type: "draft", draft: draft() });
    expect(reducePreviewSession(ready, { type: "timeout" })).toBe(ready);
  });

  it("recovers if a draft arrives after the timeout (the editor was just slow)", () => {
    const timedOut = reducePreviewSession(waiting, { type: "timeout" });
    expect(reducePreviewSession(timedOut, { type: "draft", draft: draft() }).status).toBe("ready");
  });

  it("is unavailable when the browser lacks BroadcastChannel, whatever the previous state", () => {
    expect(reducePreviewSession(waiting, { type: "unsupported" })).toEqual({ status: "unavailable", reason: "unsupported" });
  });

  it("waits a few seconds before giving up on the editor", () => {
    expect(PREVIEW_TIMEOUT_MS).toBe(3000);
  });
});

describe("previewUnavailableMessage", () => {
  it("tells the user what to do for each reason, never showing stale content", () => {
    expect(previewUnavailableMessage("no-editor")).toContain("編集画面");
    expect(previewUnavailableMessage("closed")).toContain("閉じ");
    expect(previewUnavailableMessage("unsupported")).toContain("対応していません");
  });
});

describe("draftToPreviewQuestion", () => {
  const eventId = "e1" as EventId;

  it("maps the unsaved draft to what the real stage components render, using the host's own media URLs", () => {
    const preview = draftToPreviewQuestion(eventId, draft());
    expect(preview.question.body).toBe("どっち？");
    expect(preview.question.options.map((o) => [o.label, o.imageAssetId])).toEqual([
      ["りんご", "img-1"],
      ["みかん", null],
    ]);
    expect(preview.imageUrl).toBe("/api/events/e1/media/q-img");
    const firstId = preview.question.options[0]!.id;
    expect(preview.optionImageUrls).toEqual({ [firstId]: "/api/events/e1/media/img-1" });
    expect(preview.explanation).toBe("解説です");
  });

  it("resolves the correct option from the draft, and gives options distinct stable ids", () => {
    const preview = draftToPreviewQuestion(eventId, draft());
    expect(preview.correctOptionId).toBe(preview.question.options[1]!.id);
    const ids = preview.question.options.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(draftToPreviewQuestion(eventId, draft()).question.options.map((o) => o.id)).toEqual(ids);
  });

  it("falls back to the first option when no option is marked correct yet", () => {
    const d: PreviewDraft = { ...draft(), options: draft().options.map((o) => ({ ...o, isCorrect: false })) };
    const preview = draftToPreviewQuestion(eventId, d);
    expect(preview.correctOptionId).toBe(preview.question.options[0]!.id);
  });

  it("has no question image URL when the draft has none", () => {
    expect(draftToPreviewQuestion(eventId, { ...draft(), imageAssetId: null }).imageUrl).toBeNull();
  });

  it("shows an empty option text as it is, without inventing a label", () => {
    const d: PreviewDraft = { ...draft(), options: [{ label: "", imageAssetId: null, isCorrect: true }, draft().options[1]!] };
    expect(draftToPreviewQuestion(eventId, d).question.options[0]!.label).toBe("");
  });
});
