import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssetId, EventId, ThemeSettings } from "../../shared/domain-types";
import type { PreviewDraft } from "./question-preview-channel";
import { QuestionPreviewView } from "./question-preview-page";

const theme: ThemeSettings = {
  primaryColor: "#123456",
  accentColor: "#f59e0b",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  logoAssetId: null,
  backgroundAssetId: null,
  templateId: null,
};
const draft = (withImages: boolean): PreviewDraft => ({
  body: "どっち？",
  explanation: "解説です",
  imageAssetId: null,
  options: [
    { label: "りんご", imageAssetId: withImages ? ("img-1" as AssetId) : null, isCorrect: true },
    { label: "みかん", imageAssetId: withImages ? ("img-2" as AssetId) : null, isCorrect: false },
  ],
});
const base = { eventId: "e1" as EventId, eventTitle: "Quiz", theme, logoImageUrl: null, backgroundImageUrl: null } as const;

describe("QuestionPreviewView", () => {
  it("shows the unsaved question on the real stage components inside the projector-size frame", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "ready", draft: draft(true) }} tab="question" onTabChange={() => {}} />);
    expect(markup).toContain("どっち？");
    expect(markup).toContain('src="/api/events/e1/media/img-1"');
    expect(markup).toContain("stage-question-fit");
    expect(markup).toContain("width:1920px");
    expect(markup).toContain("--color-brand-primary:#123456");
  });

  it("switches to the reveal screen with the draft's explanation and the correct option highlighted", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "ready", draft: draft(true) }} tab="reveal" onTabChange={() => {}} />);
    expect(markup).toContain("stage-reveal-fit");
    expect(markup).toContain('data-correct="true"');
    expect(markup).toContain("解説です");
  });

  it("offers both tabs and marks the active one", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "ready", draft: draft(false) }} tab="reveal" onTabChange={() => {}} />);
    expect(markup).toContain("出題");
    expect(markup).toContain("正解発表");
    expect(markup).toMatch(/aria-pressed="true"[^>]*>正解発表/);
  });

  it("makes clear that the content is unsaved", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "ready", draft: draft(false) }} tab="question" onTabChange={() => {}} />);
    expect(markup).toContain("保存前");
  });

  it("uses the existing text-only screens for a draft without option images", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "ready", draft: draft(false) }} tab="question" onTabChange={() => {}} />);
    expect(markup).not.toContain("stage-question-fit");
    expect(markup).toContain("りんご");
  });

  it("shows a connecting message while waiting, and no stale question", () => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "waiting" }} tab="question" onTabChange={() => {}} />);
    expect(markup).toContain("接続中");
    expect(markup).not.toContain("どっち？");
  });

  it.each([
    ["no-editor", "編集画面"],
    ["closed", "閉じ"],
    ["unsupported", "対応していません"],
  ] as const)("explains why the preview is unavailable (%s) and shows no question", (reason, text) => {
    const markup = renderToStaticMarkup(<QuestionPreviewView {...base} session={{ status: "unavailable", reason }} tab="question" onTabChange={() => {}} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain(text);
    expect(markup).not.toContain("どっち？");
    expect(markup).not.toContain("width:1920px");
  });
});
