import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrationsPath = new URL("./migrations", import.meta.url).pathname;
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
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
