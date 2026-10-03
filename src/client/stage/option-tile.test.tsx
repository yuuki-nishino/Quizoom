import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OptionTileView } from "./option-tile";

describe("OptionTileView (question variant)", () => {
  it("shows the image and the text together in the same tile", () => {
    const markup = renderToStaticMarkup(
      <OptionTileView label="りんご" imageUrl="/m/a?token=t" imageFailed={false} onImageError={() => {}} />,
    );
    expect(markup).toContain('src="/m/a?token=t"');
    expect(markup).toContain("りんご");
    // 画像は装飾(alt空)。選択肢の名前はテキストが担う
    expect(markup).toContain('alt=""');
  });

  it("reserves the image area with a flexible box and fits the image without cropping", () => {
    const markup = renderToStaticMarkup(
      <OptionTileView label="りんご" imageUrl="/m/a" imageFailed={false} onImageError={() => {}} />,
    );
    expect(markup).toMatch(/<div class="[^"]*stage-option-image[^"]*min-h-0[^"]*flex-1[^"]*"/);
    expect(markup).toMatch(/<img[^>]*class="[^"]*h-full[^"]*w-full[^"]*object-contain[^"]*"/);
  });

  it("renders text only, without an image area, for an option without an image", () => {
    const markup = renderToStaticMarkup(
      <OptionTileView label="みかん" imageUrl={null} imageFailed={false} onImageError={() => {}} />,
    );
    expect(markup).toContain("みかん");
    expect(markup).not.toContain("<img");
    expect(markup).not.toContain("stage-option-image");
  });

  it("hides only the image and keeps the text when the image failed to load", () => {
    const markup = renderToStaticMarkup(
      <OptionTileView label="りんご" imageUrl="/m/a" imageFailed={true} onImageError={() => {}} />,
    );
    expect(markup).not.toContain("<img");
    expect(markup).toContain("りんご");
  });

  it("clamps long text so it cannot push the tile beyond the screen", () => {
    const markup = renderToStaticMarkup(
      <OptionTileView label={"とても長い選択肢".repeat(20)} imageUrl="/m/a" imageFailed={false} onImageError={() => {}} />,
    );
    expect(markup).toMatch(/class="[^"]*line-clamp-2[^"]*"/);
  });
});

describe("OptionTileView (reveal variant)", () => {
  const base = { label: "りんご", imageUrl: "/m/a", imageFailed: false, onImageError: () => {} };

  it("emphasizes the correct option with the existing correct styling and a 正解 mark, and shows the count and percentage", () => {
    const markup = renderToStaticMarkup(<OptionTileView {...base} reveal={{ isCorrect: true, count: 3, pct: 75 }} />);
    expect(markup).toMatch(/data-correct="true" class="stage-option-correct[^"]*border-emerald-500[^"]*"/);
    expect(markup).toContain("正解");
    expect(markup).toContain("<svg");
    expect(markup).toContain("3人（75%）");
    expect(markup).toContain('src="/m/a"');
  });

  it("dims an incorrect option but still shows its image, text, count and percentage", () => {
    const markup = renderToStaticMarkup(<OptionTileView {...base} label="みかん" reveal={{ isCorrect: false, count: 1, pct: 25 }} />);
    expect(markup).toMatch(/data-correct="false" class="[^"]*opacity-60[^"]*"/);
    expect(markup).not.toContain("stage-option-correct");
    expect(markup).not.toContain("正解");
    expect(markup).toContain("みかん");
    expect(markup).toContain("1人（25%）");
    expect(markup).toContain('src="/m/a"');
  });

  it("keeps the count and text visible when the image failed to load", () => {
    const markup = renderToStaticMarkup(<OptionTileView {...base} imageFailed={true} reveal={{ isCorrect: true, count: 2, pct: 50 }} />);
    expect(markup).not.toContain("<img");
    expect(markup).toContain("りんご");
    expect(markup).toContain("2人（50%）");
  });
});

