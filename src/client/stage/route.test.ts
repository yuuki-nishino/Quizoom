import { describe, it, expect } from "vitest";
import { parseStageRoute } from "./route";

describe("parseStageRoute", () => {
  it("extracts the eventId and token query param", () => {
    expect(parseStageRoute("/stage/e1", "?token=abc123")).toEqual({ eventId: "e1", token: "abc123" });
  });

  it("returns a null token when no token query param is present", () => {
    expect(parseStageRoute("/stage/e1", "")).toEqual({ eventId: "e1", token: null });
  });

  it("returns null for paths that are not /stage/:eventId", () => {
    expect(parseStageRoute("/host", "")).toBeNull();
    expect(parseStageRoute("/stage", "")).toBeNull();
    expect(parseStageRoute("/join/abc", "")).toBeNull();
  });
});
