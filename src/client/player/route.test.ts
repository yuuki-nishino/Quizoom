import { describe, it, expect } from "vitest";
import { parsePlayerRoute } from "./route";

describe("parsePlayerRoute", () => {
  it("extracts the joinCode", () => {
    expect(parsePlayerRoute("/join/ABC123")).toEqual({ joinCode: "ABC123" });
  });

  it("returns null for paths that are not /join/:joinCode", () => {
    expect(parsePlayerRoute("/host")).toBeNull();
    expect(parsePlayerRoute("/join")).toBeNull();
    expect(parsePlayerRoute("/stage/e1")).toBeNull();
  });
});
