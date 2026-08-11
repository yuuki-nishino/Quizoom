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
