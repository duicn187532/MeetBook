import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { fileURLToPath } from "node:url";

const migrations = await readD1Migrations(fileURLToPath(new URL("./migrations", import.meta.url)));

export default defineConfig({
  test: {
    projects: [
      {
        // 轉檔工具、比對工具與 CPU 時間量測（Node）
        test: {
          name: "node",
          include: ["atlas-import/test/**/*.test.ts", "compare/test/**/*.test.ts", "test/cpu/**/*.test.ts"],
          // 轉檔流程測試會啟動 MongoDB（mongodb-memory-server）與 wrangler 本機 D1，需要較長時間
          testTimeout: 180_000,
          hookTimeout: 300_000,
        },
      },
      {
        // Worker：在 workerd（與正式環境相同的執行環境）中執行，D1 由 Miniflare 提供
        plugins: [
          cloudflareTest({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: migrations,
                ADMIN_PASSWORD: "test-admin-password",
                LINE_CHANNEL_SECRET: "test-line-secret",
                LINE_CHANNEL_ACCESS_TOKEN: "test-line-token",
                LINE_API_BASE: "https://line.test",
                // 對外網址與萬用密碼：正式環境由部署時的設定提供，測試用假的值
                FRONTEND_ORIGIN: "https://frontend.test",
                WEBSITE_URL: "https://frontend.test/app/",
                PUBLIC_BASE_URL: "https://public.test",
                MASTER_PASSWORD: "test-master-password",
                LOG_LEVEL: "error",
              },
            },
          }),
        ],
        test: {
          name: "worker",
          include: ["test/**/*.test.ts"],
          exclude: ["test/cpu/**"],
          setupFiles: ["./test/apply-migrations.ts"],
          testTimeout: 60_000,
        },
      },
    ],
  },
});
