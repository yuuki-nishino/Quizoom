import { describe, it, expect } from "vitest";
import { formatElapsedMs, formatRemainingSeconds } from "./format";

describe("formatElapsedMs", () => {
  it("formats milliseconds as seconds with one decimal place", () => {
    expect(formatElapsedMs(1500)).toBe("1.5秒");
    expect(formatElapsedMs(0)).toBe("0.0秒");
  });
});

describe("formatRemainingSeconds", () => {
  it("rounds up to the next whole second and clamps at zero", () => {
    expect(formatRemainingSeconds(1001)).toBe(2);
    expect(formatRemainingSeconds(1000)).toBe(1);
    expect(formatRemainingSeconds(-500)).toBe(0);
  });
});
