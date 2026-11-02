// 由 Deno 版 main/project/logger_test.ts 移植：測試內容不變，只改了匯入路徑
import { Deno, assertEquals  } from "./deno_shim.ts";
import { redact } from "../src/logger.ts";

Deno.test("redact 遮蔽任意層級的密碼欄位", () => {
  const date = new Date("2026-10-29T00:00:00Z");
  assertEquals(
    redact({ id: "b1", editPassword: "pw", nested: { password: "x", list: [{ editPassword: "y" }] }, at: date }),
    { id: "b1", editPassword: "***", nested: { password: "***", list: [{ editPassword: "***" }] }, at: date },
  );
});
