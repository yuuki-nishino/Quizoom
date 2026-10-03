import { describe, it, expect } from "vitest";
import { questionRequestSchema } from "./schema";

const base = { body: "Q?", timeLimitSec: 30 };

describe("questionRequestSchema option images (Issue #36)", () => {
  it("accepts an option with text and an image", () => {
    const parsed = questionRequestSchema.safeParse({
      ...base,
      options: [
        { label: "A", isCorrect: true, imageAssetId: "asset-a" },
        { label: "B", isCorrect: false },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a null option image", () => {
    const parsed = questionRequestSchema.safeParse({
      ...base,
      options: [
        { label: "A", isCorrect: true, imageAssetId: null },
        { label: "B", isCorrect: false, imageAssetId: null },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an image-only option: the text stays required even with an image", () => {
    const parsed = questionRequestSchema.safeParse({
      ...base,
      options: [
        { label: "", isCorrect: true, imageAssetId: "asset-a" },
        { label: "B", isCorrect: false },
      ],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-string option image id", () => {
    const parsed = questionRequestSchema.safeParse({
      ...base,
      options: [
        { label: "A", isCorrect: true, imageAssetId: 123 },
        { label: "B", isCorrect: false },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
