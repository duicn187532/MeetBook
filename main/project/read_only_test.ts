import { assert, assertEquals } from "@std/assert";
import { isBlockedWrite, READ_ONLY_MESSAGE } from "./read_only.ts";

Deno.test("未開啟唯讀模式時不擋任何請求", () => {
  assertEquals(isBlockedWrite(false, "POST", "/api/bookings"), false);
  assertEquals(isBlockedWrite(false, "PATCH", "/api/bookings/x/y"), false);
  assertEquals(isBlockedWrite(false, "POST", "/admin/api/users"), false);
});

Deno.test("唯讀模式擋下新增、修改、取消與後台寫入，查詢與登入照常", () => {
  assert(isBlockedWrite(true, "POST", "/api/bookings"));
  assert(isBlockedWrite(true, "POST", "/api/bookings/"));
  assert(isBlockedWrite(true, "PATCH", "/api/bookings/x/y"));
  assert(isBlockedWrite(true, "POST", "/admin/api/users"));
  assert(isBlockedWrite(true, "PATCH", "/admin/api/users/001234"));
  assertEquals(isBlockedWrite(true, "GET", "/api/bookings/"), false);
  assertEquals(isBlockedWrite(true, "OPTIONS", "/api/bookings/"), false);
  assertEquals(isBlockedWrite(true, "GET", "/admin/api/stats"), false);
  assertEquals(isBlockedWrite(true, "POST", "/admin/api/login"), false);
  assertEquals(isBlockedWrite(true, "POST", "/admin/api/logout"), false);
  // LINE webhook 本身不擋（要能回覆訊息），預約在 createBooking 中擋下
  assertEquals(isBlockedWrite(true, "POST", "/line/webhook"), false);
  assert(READ_ONLY_MESSAGE.includes("重新整理"));
});
