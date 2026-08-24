import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StageSafeArea } from "./safe-area";

describe("StageSafeArea", () => {
  it("renders its children", () => {
    const markup = renderToStaticMarkup(
      <StageSafeArea>
        <span>content</span>
      </StageSafeArea>,
    );
    expect(markup).toContain("<span>content</span>");
  });

  it("applies a default outer margin to guard against projector safety-zone cropping (要件3.13)", () => {
    const markup = renderToStaticMarkup(
      <StageSafeArea>
        <span>content</span>
      </StageSafeArea>,
    );
    expect(markup).toMatch(/class="[^"]*p-\[8%\][^"]*"/);
  });
});
