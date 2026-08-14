import { createAuth } from "../src/server/auth/factory";
import type { Env } from "../src/server/env";

async function signCookieValue(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return encodeURIComponent(`${value}.${encodedSignature}`);
}

/** テスト専用: Better Auth の内部アダプタでユーザーとセッションを作成し、署名済みセッションCookieを返す */
export async function createHostCookie(env: Env, userId: string): Promise<string> {
  const auth = createAuth(env);
  const ctx = await auth.$context;

  const existing = await ctx.internalAdapter.findUserById(userId);
  if (!existing) {
    await ctx.internalAdapter.createUser({
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
      emailVerified: true,
    });
  }

  const session = await ctx.internalAdapter.createSession(userId);
  const signedValue = await signCookieValue(session.token, ctx.secret);
  return `${ctx.authCookies.sessionToken.name}=${signedValue}`;
}
