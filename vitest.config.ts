import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = new URL("./migrations", import.meta.url).pathname;
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      // vitest-pool-workers はテストファイルごとに workerd ランタイムを起動し、
      // setupFiles で全マイグレーションを適用する。CI(GitHub Actions の 2コアランナー)では
      // 80以上のテストファイルが並列に走るため、ローカルで 100ms 程度の結線統合テストでも
      // ランナーの負荷次第で既定の 5000ms を超えて偽陽性のタイムアウトになる。
      // (実例: run 34863022367 で full-event-flow / alarm-lifecycle が 5000ms 超過)
      // 実際のハングは値を上げても検出できるため、余裕を持たせて偽陽性のみを防ぐ。
      testTimeout: 30_000,
      hookTimeout: 30_000,
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            // CI等 .dev.vars が存在しない環境でも決定的にテストできるよう、
            // 秘密鍵系のバインディングはここで固定値を注入する(本物の値である必要はない)
            bindings: {
              TEST_MIGRATIONS: migrations,
              PARTICIPANT_TOKEN_SECRET: "test-participant-token-secret",
              BETTER_AUTH_SECRET: "test-better-auth-secret",
              GOOGLE_CLIENT_ID: "test-google-client-id",
              GOOGLE_CLIENT_SECRET: "test-google-client-secret",
            },
          },
        },
      },
    },
  };
});
