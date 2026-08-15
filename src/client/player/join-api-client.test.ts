import { describe, it, expect, vi } from "vitest";
import { fetchJoinInfo, submitNickname } from "./join-api-client";
import type { Fetcher } from "./join-api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchJoinInfo", () => {
  it("requests the join info endpoint for the given joinCode", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(200, { eventId: "e1", eventTitle: "Quiz Night", theme: {}, accepting: true }),
    );

    const result = await fetchJoinInfo("ABC123", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/join/ABC123");
    expect(result).toEqual({ ok: true, value: { eventId: "e1", eventTitle: "Quiz Night", theme: {}, accepting: true } });
  });

  it("maps a non-2xx response to an error result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(410, { error: "EVENT_FINISHED" }));
    const result = await fetchJoinInfo("ABC123", fetcher);
    expect(result).toEqual({ ok: false, status: 410, code: "EVENT_FINISHED" });
  });

  it("maps a network failure to a NETWORK_ERROR result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("offline");
    });
    const result = await fetchJoinInfo("ABC123", fetcher);
    expect(result).toEqual({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });
});

describe("submitNickname", () => {
  it("POSTs the nickname as JSON and returns the token/participantId/eventId", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { token: "tok", participantId: "p1", eventId: "e1" }));

    const result = await submitNickname("ABC123", "alice", fetcher);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/join/ABC123",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ nickname: "alice" }) }),
    );
    expect(result).toEqual({ ok: true, value: { token: "tok", participantId: "p1", eventId: "e1" } });
  });

  it("maps a rejection (e.g. NICKNAME_TAKEN) to an error result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(409, { error: "NICKNAME_TAKEN" }));
    const result = await submitNickname("ABC123", "alice", fetcher);
    expect(result).toEqual({ ok: false, status: 409, code: "NICKNAME_TAKEN" });
  });
});
