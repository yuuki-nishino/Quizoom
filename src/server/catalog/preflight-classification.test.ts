import { describe, it, expect } from "vitest";
import { classifyRoundTrip, ROUND_TRIP_OK_MS, ROUND_TRIP_WARN_MS } from "./schema";

describe("classifyRoundTrip", () => {
  it("is fail when the session itself is unreachable, regardless of the measured time", () => {
    expect(classifyRoundTrip(10, false)).toBe("fail");
  });

  it("is ok at and below the ok threshold", () => {
    expect(classifyRoundTrip(0, true)).toBe("ok");
    expect(classifyRoundTrip(ROUND_TRIP_OK_MS, true)).toBe("ok");
  });

  it("is warn between the ok and warn thresholds", () => {
    expect(classifyRoundTrip(ROUND_TRIP_OK_MS + 1, true)).toBe("warn");
    expect(classifyRoundTrip(ROUND_TRIP_WARN_MS, true)).toBe("warn");
  });

  it("is fail above the warn threshold", () => {
    expect(classifyRoundTrip(ROUND_TRIP_WARN_MS + 1, true)).toBe("fail");
    expect(classifyRoundTrip(10_000, true)).toBe("fail");
  });
});
