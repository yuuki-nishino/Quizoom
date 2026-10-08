import { describe, it, expect } from "vitest";
import { normalizeEventTitle } from "./event-title";

describe("normalizeEventTitle", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeEventTitle("  新年会クイズ \n")).toBe("新年会クイズ");
  });
  it("returns null for empty or whitespace-only input", () => {
    expect(normalizeEventTitle("")).toBeNull();
    expect(normalizeEventTitle("  　 ".replace("　", " "))).toBeNull();
  });
});
