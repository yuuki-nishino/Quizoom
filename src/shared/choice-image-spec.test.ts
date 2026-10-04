import { describe, it, expect } from "vitest";
import type { AssetId } from "./domain-types";
import {
  CHOICE_IMAGE_ASPECT,
  CHOICE_IMAGE_MAX_LONG_EDGE_PX,
  CHOICE_IMAGE_OUTPUT_QUALITY,
  CHOICE_IMAGE_OUTPUT_TYPE,
  hasChoiceImages,
} from "./choice-image-spec";

const asset = (id: string) => id as AssetId;

describe("choice image spec constants", () => {
  it("fixes the aspect ratio to 4:3, the long edge to 800px and the output to JPEG", () => {
    expect(CHOICE_IMAGE_ASPECT).toEqual({ width: 4, height: 3 });
    expect(CHOICE_IMAGE_MAX_LONG_EDGE_PX).toBe(800);
    expect(CHOICE_IMAGE_OUTPUT_TYPE).toBe("image/jpeg");
    expect(CHOICE_IMAGE_OUTPUT_QUALITY).toBe(0.85);
  });
});

describe("hasChoiceImages", () => {
  it("is false when no option has an image", () => {
    expect(hasChoiceImages([{ imageAssetId: null }, { imageAssetId: null }])).toBe(false);
  });

  it("is true when every option has an image", () => {
    expect(hasChoiceImages([{ imageAssetId: asset("a") }, { imageAssetId: asset("b") }])).toBe(true);
  });

  it("is true when only some options have an image (mixed)", () => {
    expect(hasChoiceImages([{ imageAssetId: null }, { imageAssetId: asset("b") }, { imageAssetId: null }])).toBe(true);
  });

  it("is false for an empty option list", () => {
    expect(hasChoiceImages([])).toBe(false);
  });
});
