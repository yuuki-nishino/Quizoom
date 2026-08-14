import { describe, it, expect } from "vitest";
import { buildStageWebSocketUrl } from "./ws-url";
import type { EventId } from "../../shared/domain-types";

describe("buildStageWebSocketUrl", () => {
  it("builds a wss:// URL with eventId, role=stage, and the stage token", () => {
    const url = buildStageWebSocketUrl("e1" as EventId, "tok-123", "https://quizoom.example.com");
    expect(url).toBe("wss://quizoom.example.com/connect?eventId=e1&role=stage&token=tok-123");
  });

  it("builds a ws:// URL for an http origin (local dev)", () => {
    const url = buildStageWebSocketUrl("e1" as EventId, "tok-123", "http://localhost:5173");
    expect(url).toBe("ws://localhost:5173/connect?eventId=e1&role=stage&token=tok-123");
  });
});
