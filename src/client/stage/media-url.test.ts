import { describe, it, expect } from "vitest";
import { buildStageMediaUrl } from "./media-url";
import type { AssetId, EventId } from "../../shared/domain-types";

describe("buildStageMediaUrl", () => {
  it("builds a token-authorized media URL", () => {
    expect(buildStageMediaUrl("e1" as EventId, "a1" as AssetId, "tok-123")).toBe("/api/events/e1/media/a1?token=tok-123");
  });
});
