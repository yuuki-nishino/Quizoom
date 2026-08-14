import { describe, it, expect, vi } from "vitest";
import { createApiClient } from "./api-client";
import type { Fetcher } from "./api-client";
import type { EventId, QuestionId } from "../../shared/domain-types";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("createApiClient", () => {
  it("sends GET requests with credentials included and parses the JSON body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, [{ id: "e1", title: "quiz", status: "draft", questionCount: 0 }]));
    const client = createApiClient(fetcher);

    const result = await client.listEvents();

    expect(fetcher).toHaveBeenCalledWith("/api/events", expect.objectContaining({ method: "GET", credentials: "include" }));
    expect(result).toEqual({ ok: true, value: [{ id: "e1", title: "quiz", status: "draft", questionCount: 0 }] });
  });

  it("sends POST requests with a JSON-encoded body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(201, { id: "e1", title: "new quiz" }));
    const client = createApiClient(fetcher);

    await client.createEvent({ title: "new quiz" });

    expect(fetcher).toHaveBeenCalledWith(
      "/api/events",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ title: "new quiz" }),
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  it("treats a 204 response as a successful result with no value", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, { status: 204 }));
    const client = createApiClient(fetcher);

    const result = await client.deleteEvent("e1" as EventId);

    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("maps a non-2xx JSON error body to an ApiError with status/code/fields", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(400, { error: "VALIDATION", fields: ["options"] }));
    const client = createApiClient(fetcher);

    const result = await client.upsertQuestion("e1" as EventId, {
      body: "q",
      timeLimitSec: 30,
      options: [],
    });

    expect(result).toEqual({ ok: false, status: 400, code: "VALIDATION", fields: ["options"] });
  });

  it("maps a network failure to a NETWORK_ERROR result", async () => {
    const fetcher = vi.fn<Fetcher>(async () => {
      throw new Error("offline");
    });
    const client = createApiClient(fetcher);

    const result = await client.listEvents();

    expect(result).toEqual({ ok: false, status: 0, code: "NETWORK_ERROR" });
  });

  it("PATCHes an existing question when a questionId is supplied", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { id: "q1" }));
    const client = createApiClient(fetcher);

    await client.upsertQuestion(
      "e1" as EventId,
      { body: "q", timeLimitSec: 30, options: [{ label: "a", isCorrect: true }] },
      "q1" as QuestionId,
    );

    expect(fetcher).toHaveBeenCalledWith("/api/events/e1/questions/q1", expect.objectContaining({ method: "PATCH" }));
  });

  it("POSTs a new question when no questionId is supplied", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(201, { id: "q1" }));
    const client = createApiClient(fetcher);

    await client.upsertQuestion("e1" as EventId, { body: "q", timeLimitSec: 30, options: [] });

    expect(fetcher).toHaveBeenCalledWith("/api/events/e1/questions", expect.objectContaining({ method: "POST" }));
  });

  it("uploads media as multipart form data without a JSON content-type header", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(201, { assetId: "a1" }));
    const client = createApiClient(fetcher);
    const file = new File(["binary"], "logo.png", { type: "image/png" });

    const result = await client.uploadMedia("e1" as EventId, file);

    expect(result).toEqual({ ok: true, value: { assetId: "a1" } });
    const [, init] = fetcher.mock.calls[0]!;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("enables sharing via POST and returns the share URL", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { shareCode: "abc", shareUrl: "https://example.test/share/abc" }));
    const client = createApiClient(fetcher);

    const result = await client.enableSharing("e1" as EventId);

    expect(fetcher).toHaveBeenCalledWith("/api/events/e1/share", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual({ ok: true, value: { shareCode: "abc", shareUrl: "https://example.test/share/abc" } });
  });

  it("requests a Google sign-in URL with the given callback", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, { url: "https://accounts.google.com/authorize", redirect: true }));
    const client = createApiClient(fetcher);

    const result = await client.requestGoogleSignInUrl("/host");

    expect(fetcher).toHaveBeenCalledWith(
      "/api/auth/sign-in/social",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ provider: "google", callbackURL: "/host" }) }),
    );
    expect(result).toEqual({ ok: true, value: { url: "https://accounts.google.com/authorize", redirect: true } });
  });

  it("deletes participant data via DELETE", async () => {
    const fetcher = vi.fn<Fetcher>(async () => new Response(null, { status: 204 }));
    const client = createApiClient(fetcher);

    const result = await client.deleteParticipantData("e1" as EventId);

    expect(fetcher).toHaveBeenCalledWith("/api/events/e1/participant-data", expect.objectContaining({ method: "DELETE" }));
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it("reorders questions via PUT with a questionIds body", async () => {
    const fetcher = vi.fn<Fetcher>(async () => jsonResponse(200, []));
    const client = createApiClient(fetcher);

    await client.reorderQuestions("e1" as EventId, ["q2" as QuestionId, "q1" as QuestionId]);

    expect(fetcher).toHaveBeenCalledWith(
      "/api/events/e1/questions/order",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ questionIds: ["q2", "q1"] }) }),
    );
  });
});
