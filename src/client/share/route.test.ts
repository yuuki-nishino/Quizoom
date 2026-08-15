import { describe, it, expect } from "vitest";
import { parseShareRoute } from "./route";

describe("parseShareRoute", () => {
  it("extracts the shareCode", () => {
    expect(parseShareRoute("/share/ABC123")).toEqual({ shareCode: "ABC123" });
  });

  it("returns null for paths that are not /share/:shareCode", () => {
    expect(parseShareRoute("/host")).toBeNull();
    expect(parseShareRoute("/share")).toBeNull();
    expect(parseShareRoute("/join/abc")).toBeNull();
  });
});
