import { describe, it, expect, vi } from "vitest";
import {
  computeCenterCrop,
  computeOutputSize,
  processChoiceImage,
  type DecodedImage,
  type ImageCodec,
} from "./choice-image-processor";

const TARGET_RATIO = 4 / 3;

describe("computeCenterCrop", () => {
  it("crops a landscape (wider than 4:3) image on the left and right, keeping full height", () => {
    const crop = computeCenterCrop(2000, 1000);
    expect(crop.sh).toBe(1000);
    expect(crop.sy).toBe(0);
    expect(crop.sw / crop.sh).toBeCloseTo(TARGET_RATIO, 2);
    expect(crop.sx).toBe(Math.floor((2000 - crop.sw) / 2));
  });

  it("crops a portrait image on the top and bottom, keeping full width", () => {
    const crop = computeCenterCrop(1000, 2000);
    expect(crop.sw).toBe(1000);
    expect(crop.sx).toBe(0);
    expect(crop.sw / crop.sh).toBeCloseTo(TARGET_RATIO, 2);
    expect(crop.sy).toBe(Math.floor((2000 - crop.sh) / 2));
  });

  it("crops a square image to 4:3 vertically", () => {
    const crop = computeCenterCrop(900, 900);
    expect(crop.sw).toBe(900);
    expect(crop.sh).toBe(675);
    expect(crop.sy).toBe(112);
  });

  it("returns the whole image when it already is 4:3", () => {
    expect(computeCenterCrop(800, 600)).toEqual({ sx: 0, sy: 0, sw: 800, sh: 600 });
  });

  it("never exceeds the source bounds, even for very thin or tiny images", () => {
    for (const [w, h] of [[1, 1], [10000, 3], [3, 10000], [5, 4], [4, 5]] as const) {
      const c = computeCenterCrop(w, h);
      expect(c.sx).toBeGreaterThanOrEqual(0);
      expect(c.sy).toBeGreaterThanOrEqual(0);
      expect(c.sw).toBeGreaterThanOrEqual(1);
      expect(c.sh).toBeGreaterThanOrEqual(1);
      expect(c.sx + c.sw).toBeLessThanOrEqual(w);
      expect(c.sy + c.sh).toBeLessThanOrEqual(h);
    }
  });
});

describe("computeOutputSize", () => {
  it("shrinks a large crop so the long edge is 800px at 4:3", () => {
    expect(computeOutputSize({ sx: 0, sy: 0, sw: 4000, sh: 3000 })).toEqual({ width: 800, height: 600 });
  });

  it("does not enlarge a crop smaller than the long-edge limit", () => {
    expect(computeOutputSize({ sx: 0, sy: 0, sw: 400, sh: 300 })).toEqual({ width: 400, height: 300 });
  });

  it("keeps the long edge at or below the limit for any source", () => {
    for (const [w, h] of [[6000, 4000], [3000, 6000], [801, 601], [1200, 1200]] as const) {
      const out = computeOutputSize(computeCenterCrop(w, h));
      expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(800);
      expect(out.width / out.height).toBeCloseTo(TARGET_RATIO, 1);
    }
  });
});

function fakeCodec(overrides: Partial<ImageCodec> = {}, size = { width: 3000, height: 2000 }) {
  const close = vi.fn();
  const decoded: DecodedImage = { width: size.width, height: size.height, close };
  const encode = vi.fn(async () => new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
  const decode = vi.fn(async () => decoded);
  const codec: ImageCodec = { decode, encode, ...overrides };
  return { codec, decode, encode, close, decoded };
}

function file(type: string): File {
  return new File([new Uint8Array(8)], "x", { type });
}

describe("processChoiceImage", () => {
  it("decodes, crops to 4:3, shrinks and encodes as JPEG (quality 0.85), then releases the image", async () => {
    const { codec, encode, close, decoded } = fakeCodec();
    const result = await processChoiceImage(file("image/png"), codec);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.type).toBe("image/jpeg");
    expect(encode).toHaveBeenCalledTimes(1);
    const [source, crop, output, type, quality] = encode.mock.calls[0] as unknown as Parameters<ImageCodec["encode"]>;
    expect(source).toBe(decoded);
    expect(crop.sw / crop.sh).toBeCloseTo(4 / 3, 2);
    expect(output).toEqual({ width: 800, height: 600 });
    expect(type).toBe("image/jpeg");
    expect(quality).toBe(0.85);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts %s", async (type) => {
    const { codec } = fakeCodec();
    expect((await processChoiceImage(file(type), codec)).ok).toBe(true);
  });

  it.each(["image/gif", "image/svg+xml", "application/pdf", ""])("rejects unsupported type %j without decoding", async (type) => {
    const { codec, decode, encode } = fakeCodec();
    const result = await processChoiceImage(file(type), codec);
    expect(result).toEqual({ ok: false, error: { code: "UNSUPPORTED_TYPE" } });
    expect(decode).not.toHaveBeenCalled();
    expect(encode).not.toHaveBeenCalled();
  });

  it("returns DECODE_FAILED when the image cannot be read, producing no output", async () => {
    const { codec, encode } = fakeCodec({ decode: vi.fn(async () => { throw new Error("corrupt"); }) });
    const result = await processChoiceImage(file("image/png"), codec);
    expect(result).toEqual({ ok: false, error: { code: "DECODE_FAILED" } });
    expect(encode).not.toHaveBeenCalled();
  });

  it("returns ENCODE_FAILED when the canvas yields no blob, and still releases the image", async () => {
    const { codec, close } = fakeCodec({ encode: vi.fn(async () => null) });
    const result = await processChoiceImage(file("image/png"), codec);
    expect(result).toEqual({ ok: false, error: { code: "ENCODE_FAILED" } });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns ENCODE_FAILED when encoding throws", async () => {
    const { codec, close } = fakeCodec({ encode: vi.fn(async () => { throw new Error("canvas"); }) });
    const result = await processChoiceImage(file("image/webp"), codec);
    expect(result).toEqual({ ok: false, error: { code: "ENCODE_FAILED" } });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("treats an image with zero dimensions as DECODE_FAILED", async () => {
    const { codec } = fakeCodec({}, { width: 0, height: 0 });
    const result = await processChoiceImage(file("image/png"), codec);
    expect(result).toEqual({ ok: false, error: { code: "DECODE_FAILED" } });
  });
});
