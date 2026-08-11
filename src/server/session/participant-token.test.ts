import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import type { EventId, ParticipantId } from "../../shared/domain-types";
import { createParticipantTokenService, type ParticipantClaims } from "./participant-token";

function base64UrlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const claims: ParticipantClaims = {
  eventId: "event-1" as EventId,
  participantId: "participant-1" as ParticipantId,
  issuedAt: 1_700_000_000_000,
};

describe("ParticipantTokenService", () => {
  it("verifies a token it issued for the same event and returns the original claims", async () => {
    const service = createParticipantTokenService(env);

    const token = await service.issue(claims);
    const result = await service.verify(token, claims.eventId);

    expect(result).toEqual({ ok: true, value: claims });
  });

  it("rejects a token presented for a different event as EVENT_MISMATCH", async () => {
    const service = createParticipantTokenService(env);

    const token = await service.issue(claims);
    const result = await service.verify(token, "event-2" as EventId);

    expect(result).toEqual({ ok: false, error: { code: "EVENT_MISMATCH" } });
  });

  it("rejects a structurally invalid token as MALFORMED", async () => {
    const service = createParticipantTokenService(env);

    const result = await service.verify("not-a-real-token", claims.eventId);

    expect(result).toEqual({ ok: false, error: { code: "MALFORMED" } });
  });

  it("rejects a token with a tampered payload as BAD_SIGNATURE", async () => {
    const service = createParticipantTokenService(env);

    const token = await service.issue(claims);
    const [, signature] = token.split(".");
    const tamperedClaims: ParticipantClaims = { ...claims, participantId: "someone-else" as ParticipantId };
    const tamperedPayload = base64UrlEncode(JSON.stringify(tamperedClaims));
    const tamperedToken = `${tamperedPayload}.${signature}`;

    const result = await service.verify(tamperedToken, claims.eventId);

    expect(result).toEqual({ ok: false, error: { code: "BAD_SIGNATURE" } });
  });

  it("rejects a token signed with a different secret as BAD_SIGNATURE", async () => {
    const serviceA = createParticipantTokenService(env);
    const serviceB = createParticipantTokenService({ ...env, PARTICIPANT_TOKEN_SECRET: "a-different-secret-value" });

    const token = await serviceA.issue(claims);
    const result = await serviceB.verify(token, claims.eventId);

    expect(result).toEqual({ ok: false, error: { code: "BAD_SIGNATURE" } });
  });
});
