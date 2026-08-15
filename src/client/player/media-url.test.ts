import { describe, it, expect } from "vitest";
import { buildPlayerMediaUrl } from "./media-url";
import type { AssetId, EventId } from "../../shared/domain-types";

describe("buildPlayerMediaUrl", () => {
  it("builds a participant-token-authorized media URL", () => {
    expect(buildPlayerMediaUrl("e1" as EventId, "a1" as AssetId, "tok-123")).toBe("/api/events/e1/media/a1?token=tok-123");
  });
});
