import { defineConfig } from "vitest/config";

// 目前只有轉檔工具（Node）的測試；Worker 的測試在下一個 PR 以 @cloudflare/vitest-plugin 加入
export default defineConfig({
  test: {
    include: ["atlas-import/test/**/*.test.ts"],
    // 測試會啟動 MongoDB（mongodb-memory-server）與 wrangler 本機 D1，需要較長時間
    testTimeout: 180_000,
    hookTimeout: 300_000,
  },
});
