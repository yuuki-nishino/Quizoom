import { betterAuth } from "better-auth";
import type { Env } from "../env";

/**
 * Workers はリクエストごとに D1 バインディングを受け取るため、
 * betterAuth のシングルトンをモジュールスコープでエクスポートできない。
 * 必ず Env を引数に取るファクトリとして構成し、リクエストスコープで生成する。
 */
export function createAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts: ["localhost:*", "127.0.0.1:*", "*.workers.dev"],
      // 実リクエストは常に Host ヘッダを持つため通常は使われない。
      // auth.api.* への直接呼び出しで Host を解決できない場合のみのフォールバック
      fallback: "http://localhost:8787",
    },
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        scope: ["email", "profile"],
      },
    },
  });
}

export type AuthInstance = ReturnType<typeof createAuth>;
