import { describe, it, expect, vi } from "vitest";
import { fetchPublicResult } from "./share-api-client";
import type { Fetcher } from "./share-api-client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchPublicResult", () => {
  it("requests the share endpoint for the given shareCode with no credentials required", async () => {
    const fetcher = vi.fn<Fetcher>(async () =>
      jsonResponse(200, {
        eventTitle: "Quiz Night",
        theme: { primaryColor: "#000", accentColor: "#111", backgroundColor: "#fff", textColor: "#000" },
        finalizedAt: 1700000000000,
        entries: [{ rank: 1, nickname: "alice", correctCount: 3, totalElapsedMs: 4200 }],
      }),
    );

    const result = await fetchPublicResult("ABC123", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/share/ABC123");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.eventTitle).toBe("Quiz Night");
      expect(result.value.entries).toHaveLength(1);
    }
  });

  it("maps a 410 (sharing disabled) response to an error result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(410, { error: "SHARING_DISABLED" }));
    const result = await fetchPublicResult("ABC123", fetcher);
    expect(result).toEqual({ ok: false, status: 410, code: "SHARING_DISABLED" });
  });

  it("maps a 404 (unknown share code) response to an error result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(404, { error: "NOT_FOUND" }));
    const result = await fetchPublicResult("unknown", fetcher);
    expect(result).toEqual({ ok: false, status: 404, code: "NOT_FOUND" });
  });

  it("maps a network failure to a NETWORK_ERROR result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("offline");
    });
    const result = await fetchPublicResult("ABC123", fetcher);
    expect(result).toEqual({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });
});
