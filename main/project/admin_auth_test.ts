import { assert, assertEquals } from "@std/assert";
import { createSession, deriveKey, LoginLimiter, passwordMatches, readCookie, verifySession } from "./admin_auth.ts";

const NOW = 1_800_000_000_000;

Deno.test("passwordMatches 只接受完全相同的密碼", async () => {
  const key = await deriveKey("correct horse battery");
  assert(await passwordMatches(key, "correct horse battery", "correct horse battery"));
  assert(!(await passwordMatches(key, "correct horse batter", "correct horse battery")));
  assert(!(await passwordMatches(key, "", "correct horse battery")));
});

Deno.test("session 可驗證、會過期、換密碼後失效、竄改無效", async () => {
  const key = await deriveKey("correct horse battery");
  const token = await createSession(key, NOW, 1000);
  assert(await verifySession(key, token, NOW + 999));
  assert(!(await verifySession(key, token, NOW + 1000)));

  const otherKey = await deriveKey("another password!!");
  assert(!(await verifySession(otherKey, token, NOW)));

  const [exp, sig] = token.split(".");
  assert(!(await verifySession(key, `${Number(exp) + 100000}.${sig}`, NOW)));
  const flipped = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
  assert(!(await verifySession(key, `${exp}.${flipped}`, NOW)));
  assert(!(await verifySession(key, null, NOW)));
  assert(!(await verifySession(key, "garbage", NOW)));
});

Deno.test("readCookie 取出指定 cookie", () => {
  assertEquals(readCookie("a=1; mb_admin=123.abc; b=2", "mb_admin"), "123.abc");
  assertEquals(readCookie("a=1", "mb_admin"), null);
  assertEquals(readCookie(null, "mb_admin"), null);
});

Deno.test("LoginLimiter 同來源 5 次失敗後鎖 15 分鐘，成功後重置", () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 5; i++) {
    assertEquals(limiter.retryAfter("1.1.1.1", NOW), 0);
    limiter.fail("1.1.1.1", NOW);
  }
  assertEquals(limiter.retryAfter("1.1.1.1", NOW), 900);
  assertEquals(limiter.retryAfter("2.2.2.2", NOW), 0);
  assertEquals(limiter.retryAfter("1.1.1.1", NOW + 15 * 60 * 1000), 0);

  limiter.fail("3.3.3.3", NOW);
  limiter.succeed("3.3.3.3");
  assertEquals(limiter.retryAfter("3.3.3.3", NOW), 0);
});

Deno.test("LoginLimiter 所有來源合計 30 次失敗後整體暫停", () => {
  const limiter = new LoginLimiter();
  for (let i = 0; i < 30; i++) limiter.fail(`10.0.0.${i}`, NOW);
  assert(limiter.retryAfter("192.168.0.1", NOW) > 0);
});
