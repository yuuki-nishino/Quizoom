import { describe, it, expect, vi } from "vitest";
import { fetchStageInfo } from "./stage-api-client";
import type { Fetcher } from "./stage-api-client";
import type { EventId } from "../../shared/domain-types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("fetchStageInfo", () => {
  it("requests the stage info endpoint with the token as a query param", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { eventTitle: "Quiz Night", joinCode: "ABC123", theme: {} }));

    const result = await fetchStageInfo("e1" as EventId, "tok-123", fetcher);

    expect(fetcher).toHaveBeenCalledWith("/api/stage/e1?token=tok-123");
    expect(result).toEqual({ ok: true, value: { eventTitle: "Quiz Night", joinCode: "ABC123", theme: {} } });
  });

  it("maps a non-2xx response to an error result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(403, { error: "FORBIDDEN" }));

    const result = await fetchStageInfo("e1" as EventId, "wrong-token", fetcher);

    expect(result).toEqual({ ok: false, status: 403, code: "FORBIDDEN" });
  });

  it("maps a network failure to a NETWORK_ERROR result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("offline");
    });

    const result = await fetchStageInfo("e1" as EventId, "tok-123", fetcher);

    expect(result).toEqual({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });
});
