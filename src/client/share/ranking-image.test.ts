import { describe, it, expect, vi } from "vitest";
import { drawRankingImage, generateRankingImageDataUrl } from "./ranking-image";
import type { DrawingContext, CanvasFactory, CanvasLike } from "./ranking-image";
import { computeRankingImageLayout } from "./ranking-image-layout";
import type { PublicResult } from "../../shared/domain-types";

function fakeContext(): DrawingContext & { readonly fillTextCalls: readonly [string, number, number][]; readonly fillRectCalls: readonly [number, number, number, number][] } {
  const fillTextCalls: [string, number, number][] = [];
  const fillRectCalls: [number, number, number, number][] = [];
  return {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fillRect: (x, y, w, h) => fillRectCalls.push([x, y, w, h]),
    fillText: (text, x, y) => fillTextCalls.push([text, x, y]),
    fillTextCalls,
    fillRectCalls,
  };
}

const sampleResult: PublicResult = {
  eventTitle: "Quiz Night",
  theme: { primaryColor: "#111", accentColor: "#222", backgroundColor: "#fff", textColor: "#000" },
  finalizedAt: 1700000000000,
  entries: [{ rank: 1, nickname: "alice", correctCount: 3, totalElapsedMs: 4200 }],
};

describe("drawRankingImage", () => {
  it("fills the background across the full layout dimensions using the theme's background color", () => {
    const ctx = fakeContext();
    const layout = computeRankingImageLayout(sampleResult);

    drawRankingImage(ctx, layout);

    expect(ctx.fillRectCalls).toEqual([[0, 0, layout.width, layout.height]]);
  });

  it("draws the event title and subtitle text", () => {
    const ctx = fakeContext();
    const layout = computeRankingImageLayout(sampleResult);

    drawRankingImage(ctx, layout);

    const texts = ctx.fillTextCalls.map(([text]) => text);
    expect(texts).toContain("Quiz Night");
    expect(texts).toContain("最終ランキング");
  });

  it("draws rank, nickname, and detail for every row", () => {
    const ctx = fakeContext();
    const layout = computeRankingImageLayout(sampleResult);

    drawRankingImage(ctx, layout);

    const texts = ctx.fillTextCalls.map(([text]) => text);
    expect(texts).toContain("1位");
    expect(texts).toContain("alice");
    expect(texts).toContain("正解数 3 / 4.2秒");
  });

  it("draws nothing per row when there are no entries", () => {
    const ctx = fakeContext();
    const layout = computeRankingImageLayout({ ...sampleResult, entries: [] });

    drawRankingImage(ctx, layout);

    // タイトル・サブタイトルの2件のみ
    expect(ctx.fillTextCalls).toHaveLength(2);
  });
});

describe("generateRankingImageDataUrl", () => {
  it("draws onto the canvas from the factory and returns its data URL", () => {
    const ctx = fakeContext();
    const canvas: CanvasLike = { width: 0, height: 0, getContext: () => ctx, toDataURL: () => "data:image/png;base64,FAKE" };
    const factory: CanvasFactory = vi.fn(() => canvas);
    const layout = computeRankingImageLayout(sampleResult);

    const result = generateRankingImageDataUrl(layout, factory);

    expect(factory).toHaveBeenCalledWith(layout.width, layout.height);
    expect(ctx.fillTextCalls.length).toBeGreaterThan(0);
    expect(result).toBe("data:image/png;base64,FAKE");
  });

  it("returns null when a 2D context cannot be obtained", () => {
    const canvas: CanvasLike = { width: 0, height: 0, getContext: () => null, toDataURL: () => "" };
    const factory: CanvasFactory = () => canvas;
    const layout = computeRankingImageLayout(sampleResult);

    expect(generateRankingImageDataUrl(layout, factory)).toBeNull();
  });
});
