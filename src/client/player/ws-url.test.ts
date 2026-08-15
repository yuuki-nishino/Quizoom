import { describe, it, expect } from "vitest";
import { buildPlayerWebSocketUrl } from "./ws-url";
import type { EventId } from "../../shared/domain-types";

describe("buildPlayerWebSocketUrl", () => {
  it("builds a wss:// URL with eventId, role=participant, and the participant token", () => {
    const url = buildPlayerWebSocketUrl("e1" as EventId, "tok-123", "https://quizoom.example.com");
    expect(url).toBe("wss://quizoom.example.com/connect?eventId=e1&role=participant&token=tok-123");
  });

  it("builds a ws:// URL for an http origin (local dev)", () => {
    const url = buildPlayerWebSocketUrl("e1" as EventId, "tok-123", "http://localhost:5173");
    expect(url).toBe("ws://localhost:5173/connect?eventId=e1&role=participant&token=tok-123");
  });
});
