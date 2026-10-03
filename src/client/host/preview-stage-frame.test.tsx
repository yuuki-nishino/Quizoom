import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ThemeSettings } from "../../shared/domain-types";
import { PreviewStageFrame } from "./preview-stage-frame";

const theme: ThemeSettings = {
  primaryColor: "#112233",
  accentColor: "#445566",
  backgroundColor: "#ffffff",
  textColor: "#000000",
  logoAssetId: null,
  backgroundAssetId: null,
  templateId: null,
};

function render(group: "投影画面" | "回答画面", extra: { fitViewport?: boolean } = {}) {
  return renderToStaticMarkup(
    <PreviewStageFrame group={group} theme={theme} logoImageUrl={null} backgroundImageUrl={null} {...extra}>
      <p>inner content</p>
    </PreviewStageFrame>,
  );
}

describe("PreviewStageFrame", () => {
  it("draws the children at the real 1920x1080 projector size and scales them down into a 16:9 frame", () => {
    const markup = render("投影画面");
    expect(markup).toContain("inner content");
    expect(markup).toContain("width:1920px");
    expect(markup).toContain("height:1080px");
    expect(markup).toMatch(/transform:scale\(0\.625\)/);
    expect(markup).toContain("width:1200px");
    expect(markup).toContain("height:675px");
  });

  it("draws 回答画面 at the smartphone size", () => {
    const markup = render("回答画面");
    expect(markup).toContain("width:390px");
    expect(markup).toContain("height:844px");
  });

  it("applies the event's theme colors through ThemeProvider", () => {
    expect(render("投影画面")).toContain("--color-brand-primary:#112233");
  });

  it("binds the themed content to the frame height when fitViewport is set, so a fit layout is checked against the real screen height", () => {
    expect(render("投影画面", { fitViewport: true })).toMatch(/class="[^"]*h-full[^"]*overflow-hidden/);
    expect(render("投影画面")).toContain("min-h-full");
  });

  it("scrolls the frame by default, and clips instead when clip is set (the fit layout guarantees the content fits)", () => {
    expect(render("投影画面")).toMatch(/class="[^"]*overflow-y-auto/);
    const clipped = renderToStaticMarkup(
      <PreviewStageFrame group="投影画面" theme={theme} logoImageUrl={null} backgroundImageUrl={null} clip>
        <p>inner content</p>
      </PreviewStageFrame>,
    );
    expect(clipped).toMatch(/class="[^"]*overflow-hidden/);
    expect(clipped).not.toMatch(/class="mx-auto mt-3 [^"]*overflow-y-auto/);
  });

  it("keeps the phone frame's border out of its width, so the full 390px reference width is visible", () => {
    expect(render("回答画面")).toMatch(/class="[^"]*box-content[^"]*border-8/);
  });
});
