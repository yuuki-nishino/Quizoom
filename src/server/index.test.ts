import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("GET /api/health", () => {
  it("responds with ok status", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });
});

describe("GET /api/host/me", () => {
  it("rejects an unauthenticated request with 401", async () => {
    const res = await SELF.fetch("https://example.com/api/host/me");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHENTICATED" });
  });
});

describe("GET /connect", () => {
  it("rejects a request missing eventId as 400, without falling back to the SPA shell", async () => {
    const res = await SELF.fetch("https://example.com/connect?role=host", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(400);
  });
});

describe("client-side routes fall back to the SPA shell", () => {
  it("serves the built index.html for a non-API path such as /host", async () => {
    const res = await SELF.fetch("https://example.com/host/events/abc/live");
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('id="root"');
  });
});
