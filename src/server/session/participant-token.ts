import { err, ok, type EventId, type ParticipantId, type Result } from "../../shared/domain-types";
import type { Env } from "../env";

export interface ParticipantClaims {
  readonly eventId: EventId;
  readonly participantId: ParticipantId;
  readonly issuedAt: number;
}

export type TokenError =
  | { readonly code: "MALFORMED" }
  | { readonly code: "BAD_SIGNATURE" }
  | { readonly code: "EVENT_MISMATCH" };

export interface ParticipantTokenService {
  issue(claims: ParticipantClaims): Promise<string>;
  verify(token: string, expectedEventId: EventId): Promise<Result<ParticipantClaims, TokenError>>;
}

export function createParticipantTokenService(env: Pick<Env, "PARTICIPANT_TOKEN_SECRET">): ParticipantTokenService {
  const keyPromise = importSigningKey(env.PARTICIPANT_TOKEN_SECRET);

  return {
    async issue(claims) {
      const key = await keyPromise;
      const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
      const signature = await sign(key, payload);
      return `${payload}.${signature}`;
    },

    async verify(token, expectedEventId) {
      const parts = token.split(".");
      if (parts.length !== 2 || parts[0] === undefined || parts[1] === undefined) return err({ code: "MALFORMED" });
      const [payload, signature] = parts;

      const key = await keyPromise;
      const expectedSignature = await sign(key, payload);
      if (!timingSafeEqual(signature, expectedSignature)) return err({ code: "BAD_SIGNATURE" });

      const claims = parseClaims(payload);
      if (!claims) return err({ code: "MALFORMED" });
      if (claims.eventId !== expectedEventId) return err({ code: "EVENT_MISMATCH" });

      return ok(claims);
    },
  };
}

function parseClaims(payload: string): ParticipantClaims | null {
  try {
    const decoded = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));
    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.eventId !== "string" ||
      typeof decoded.participantId !== "string" ||
      typeof decoded.issuedAt !== "number"
    ) {
      return null;
    }
    return decoded as ParticipantClaims;
  } catch {
    return null;
  }
}

function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(key: CryptoKey, payload: string): Promise<string> {
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
