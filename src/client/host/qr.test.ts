import { describe, it, expect } from "vitest";
import { generateQrCodeSvg } from "./qr";

describe("generateQrCodeSvg", () => {
  it("renders the given text as SVG markup", async () => {
    const svg = await generateQrCodeSvg("https://example.test/join/abc123");
    expect(svg.trimStart()).toMatch(/^<svg/);
    expect(svg).toContain("</svg>");
  });

  it("produces different markup for different input text", async () => {
    const a = await generateQrCodeSvg("https://example.test/join/aaa");
    const b = await generateQrCodeSvg("https://example.test/join/bbb");
    expect(a).not.toBe(b);
  });
});
