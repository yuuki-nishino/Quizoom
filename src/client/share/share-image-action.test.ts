import { describe, it, expect } from "vitest";
import { canUseWebShare } from "./share-image-action";

describe("canUseWebShare", () => {
  it("is true when both share and canShare are functions", () => {
    expect(canUseWebShare({ share: () => {}, canShare: () => true })).toBe(true);
  });

  it("is false when either function is missing", () => {
    expect(canUseWebShare({ share: () => {} })).toBe(false);
    expect(canUseWebShare({ canShare: () => true })).toBe(false);
    expect(canUseWebShare({})).toBe(false);
  });

  it("is false when the properties exist but are not functions", () => {
    expect(canUseWebShare({ share: "nope", canShare: "nope" })).toBe(false);
  });
});
