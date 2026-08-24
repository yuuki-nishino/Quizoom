import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemePreviewPage, toPreviewQuestion, toPreviewQuestions } from "./theme-preview-page";
import { unimplementedApiClient, sampleEvent, sampleQuestion } from "./test-fixtures";
import type { AssetId, QuestionId } from "../../shared/domain-types";

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

describe("toPreviewQuestions", () => {
  it("returns an empty array when the event has no questions yet", () => {
    const event = sampleEvent({ questions: [] });
    expect(toPreviewQuestions(event.id, event)).toEqual([]);
  });

  it("maps every question in registration order (要件3.14)", () => {
    const event = sampleEvent({
      questions: [
        sampleQuestion({ id: "q1" as QuestionId, orderIndex: 0, body: "第1問" }),
        sampleQuestion({ id: "q2" as QuestionId, orderIndex: 1, body: "第2問" }),
        sampleQuestion({ id: "q3" as QuestionId, orderIndex: 2, body: "第3問" }),
      ],
    });

    const previews = toPreviewQuestions(event.id, event);

    expect(previews).toHaveLength(3);
    expect(previews.map((p) => p.question.body)).toEqual(["第1問", "第2問", "第3問"]);
  });

  it("resolves each question's correct option id and image URL independently", () => {
    const event = sampleEvent({
      questions: [
        sampleQuestion({ id: "q1" as QuestionId, imageAssetId: "asset-1" as AssetId }),
        sampleQuestion({
          id: "q2" as QuestionId,
          options: [
            { id: "o1" as never, label: "A", isCorrect: true, orderIndex: 0 },
            { id: "o2" as never, label: "B", isCorrect: false, orderIndex: 1 },
          ],
        }),
      ],
    });

    const [first, second] = toPreviewQuestions(event.id, event);

    expect(first?.imageUrl).toBe(`/api/events/${event.id}/media/asset-1`);
    expect(second?.correctOptionId).toBe("o1");
  });
});
