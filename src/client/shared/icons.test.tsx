import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CheckCircleIcon, StarIcon } from "./icons";

describe("icons", () => {
  it("renders CheckCircleIcon as aria-hidden decorative SVG", () => {
    const markup = renderToStaticMarkup(<CheckCircleIcon />);
    expect(markup).toContain("<svg");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("renders StarIcon as aria-hidden decorative SVG", () => {
    const markup = renderToStaticMarkup(<StarIcon />);
    expect(markup).toContain("<svg");
    expect(markup).toContain('aria-hidden="true"');
  });
});
