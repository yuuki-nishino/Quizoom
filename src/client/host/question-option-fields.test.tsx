import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { AssetId, EventId } from "../../shared/domain-types";
import { QuestionOptionFields, type QuestionOptionFieldsProps } from "./question-option-fields";

const asset = (id: string) => id as AssetId;
const noop = () => {};

function props(overrides: Partial<QuestionOptionFieldsProps> = {}): QuestionOptionFieldsProps {
  return {
    eventId: "e1" as EventId,
    options: [
      { label: "りんご", isCorrect: true, imageAssetId: asset("img-a") },
      { label: "みかん", isCorrect: false, imageAssetId: null },
    ],
    errors: {},
    uploadingIndexes: [],
    emptyLabelIndexes: [],
    disabled: false,
    onLabelChange: noop,
    onSelectCorrect: noop,
    onPickImage: noop,
    onRemoveImage: noop,
    ...overrides,
  };
}

describe("QuestionOptionFields", () => {
  it("shows the processed image in place for an option that has one, using the host's own media URL", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props()} />);
    expect(markup).toContain('src="/api/events/e1/media/img-a"');
    expect(markup).toContain("りんご");
    expect(markup).toContain("みかん");
  });

  it("offers replace and remove for an option with an image, and only add for one without", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props()} />);
    expect(markup).toContain("画像を差し替え");
    expect(markup).toContain("画像を削除");
    expect(markup).toContain("画像を追加");
    expect((markup.match(/画像を削除/g) ?? []).length).toBe(1);
  });

  it("accepts only the supported image formats in each file input", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props()} />);
    expect(markup).toContain('accept="image/jpeg,image/png,image/webp"');
  });

  it("shows an upload/processing error at the failing option's position only", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props({ errors: { 1: "画像を読み込めませんでした" } })} />);
    expect(markup).toContain("画像を読み込めませんでした");
    expect((markup.match(/画像を読み込めませんでした/g) ?? []).length).toBe(1);
  });

  it("indicates the option that is uploading", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props({ uploadingIndexes: [0] })} />);
    expect(markup).toContain("アップロード中");
  });

  it("marks options whose text is empty as invalid even when they have an image", () => {
    const markup = renderToStaticMarkup(
      <QuestionOptionFields
        {...props({
          options: [
            { label: "", isCorrect: true, imageAssetId: asset("img-a") },
            { label: "みかん", isCorrect: false, imageAssetId: null },
          ],
          emptyLabelIndexes: [0],
        })}
      />,
    );
    expect(markup).toContain('aria-invalid="true"');
    expect((markup.match(/aria-invalid="true"/g) ?? []).length).toBe(1);
    expect(markup).toContain("テキストを入力");
  });

  it("disables every control when the form is read-only", () => {
    const markup = renderToStaticMarkup(<QuestionOptionFields {...props({ disabled: true })} />);
    expect(markup).not.toMatch(/<input type="file"(?![^>]*disabled)/);
  });
});
