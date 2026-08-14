import { describe, it, expect } from "vitest";
import { buildHostWebSocketUrl } from "./ws-url";
import type { EventId } from "../../shared/domain-types";

describe("buildHostWebSocketUrl", () => {
  it("builds a wss:// URL with eventId and role=host for an https origin", () => {
    const url = buildHostWebSocketUrl("e1" as EventId, "https://quizoom.example.com");
    expect(url).toBe("wss://quizoom.example.com/connect?eventId=e1&role=host");
  });

  it("builds a ws:// URL for an http origin (local dev)", () => {
    const url = buildHostWebSocketUrl("e1" as EventId, "http://localhost:5173");
    expect(url).toBe("ws://localhost:5173/connect?eventId=e1&role=host");
  });
});
