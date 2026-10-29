import { assert, assertEquals } from "@std/assert";
import {
  bookTemplate,
  buildBookingRequest,
  formatBookingConflicts,
  formatTodayBookings,
  parseBookingFields,
  parseDuration,
  parseRooms,
  parseStartTime,
  randomEditPassword,
  verifySignature,
} from "./line_bot.ts";
import type { PublicBooking } from "./types.ts";

const D = "2025-10-09";
const at = (hhmm: string) => Date.parse(`${D}T${hhmm}:00+08:00`);

const booking = (room: string, start: string, end: string, title: string, date = D): PublicBooking => ({
  id: crypto.randomUUID(),
  title,
  user: { name: "1234", extension: "", department: { label: "" }, group: { label: "" } },
  room,
  participantsNum: 0,
  startTime: new Date(at(start)).toISOString(),
  endTime: new Date(at(end)).toISOString(),
  date,
  updatedCount: 0,
  isMulti: [],
});

Deno.test("快速查詢：依會議室分組、略過沒有預約的會議室", () => {
  const text = formatTodayBookings([
    booking("A102", "13:00", "14:00", "14:10 ~ 15:10"),
    booking("A102", "08:45", "10:00", "數位策略部（法）週會"),
    booking("A101", "10:00", "11:00", "明天的會", "2025-10-10"),
  ], at("09:45"));
  assertEquals(
    text,
    [
      "🔍【快速查詢】",
      "",
      "📅 今日（2025-10-09）會議室預約狀況：",
      "",
      "📋 Beta會議室：",
      "🕒 08:45 - 10:00｜主題：數位策略部（法）週會",
      "🕒 13:00 - 14:00｜主題：未命名會議",
    ].join("\n"),
  );
  assert(formatTodayBookings([], at("09:45")).endsWith("今天目前沒有任何預約 🎉"));
});

Deno.test("快速預約模板帶入現在時間", () => {
  assertEquals(
    bookTemplate(at("10:54") + 30_000),
    "📝 預約種類:臨時預約\n1️⃣ 會議名稱:臨時會議\n2️⃣ 開始時間:10:54\n3️⃣ 會議時間:1hr\n4️⃣ 預約人:\n5️⃣ 會議室:",
  );
});

Deno.test("解析填好的模板（含全形冒號與不同欄位名稱）", () => {
  const fields = parseBookingFields(
    "📝 預約種類:臨時預約\n1️⃣ 會議名稱：產品討論\n2️⃣ 開始時間:14:30\n3️⃣ 會議時長: 1.5hr\n4️⃣ 預約人:12345\n5️⃣ 會議室:b",
  );
  assertEquals(fields, { title: "產品討論", start: "14:30", duration: "1.5hr", user: "12345", room: "b" });
  // 沒有預約人與會議室欄位：一般聊天，不處理
  assertEquals(parseBookingFields("今天會議室有人嗎"), null);
  assertEquals(parseBookingFields("開始時間:10:00"), null);
});

Deno.test("欄位格式", () => {
  assertEquals([parseDuration("1hr"), parseDuration("0.5"), parseDuration("1.5 小時"), parseDuration("30分")], [
    60,
    30,
    90,
    30,
  ]);
  assertEquals([parseDuration("45分"), parseDuration("0"), parseDuration("一小時")], [null, null, null]);
  assertEquals([parseStartTime("9:00"), parseStartTime("14：30"), parseStartTime("1430")], ["09:00", "14:30", "14:30"]);
  assertEquals([parseStartTime("25:00"), parseStartTime("下午兩點")], [null, null]);
  assertEquals(parseRooms("a"), ["A101"]);
  assertEquals(parseRooms("Beta、s"), ["A102", "A103"]);
  assertEquals(parseRooms("C"), null);
});

Deno.test("建立預約：換算成今天的時間", () => {
  const r = buildBookingRequest(
    { title: "", start: "10:54", duration: "1hr", user: "001234", room: "A" },
    at("10:56"),
  );
  assert(r.ok);
  assertEquals(r.request.title, "臨時會議");
  assertEquals(r.request.rooms, ["A101"]);
  assertEquals(r.request.startTime.toISOString(), new Date(at("10:54")).toISOString());
  assertEquals(r.request.endTime.toISOString(), new Date(at("11:54")).toISOString());
});

Deno.test("建立預約：列出所有錯誤", () => {
  const r = buildBookingRequest(
    { title: "臨時會議", start: "10:54", duration: "1hr", user: "", room: "" },
    at("10:56"),
  );
  assert(!r.ok);
  assertEquals(r.errors, ["4️⃣ 預約人未填寫，請輸入您的行編", "5️⃣ 會議室未填寫，請填 A / B / S"]);

  const bad = buildBookingRequest({ start: "下午", duration: "45分", user: "1234", room: "X" }, at("10:56"));
  assert(!bad.ok);
  assertEquals(bad.errors.length, 3);
});

Deno.test("建立預約：時段限制", () => {
  const base = { duration: "1hr", user: "1234", room: "S" };
  const late = buildBookingRequest({ ...base, start: "17:30" }, at("10:00"));
  assert(!late.ok && late.errors[0].startsWith("可預約時段"));
  const past = buildBookingRequest({ ...base, start: "09:00" }, at("10:00"));
  assert(!past.ok && past.errors[0].includes("已經過了"));
  // 15 分鐘內的過去時間可以（模板帶入的是傳送時間）
  assert(buildBookingRequest({ ...base, start: "09:50" }, at("10:00")).ok);
});

Deno.test("衝突訊息", () => {
  const text = formatBookingConflicts([
    { room: "A102", conflicts: [{ title: "週會", startTime: new Date(at("10:00")), endTime: new Date(at("11:00")) }] },
  ]);
  assert(text.includes("📋 Beta：10:00 - 11:00｜週會"));
});

Deno.test("編輯密碼為 4 位數字", () => {
  for (let i = 0; i < 20; i++) assert(/^\d{4}$/.test(randomEditPassword()));
});

Deno.test("LINE 簽章驗證", async () => {
  const body = '{"events":[]}';
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode("secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = btoa(
    String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))),
  );
  assert(await verifySignature(body, sig, "secret"));
  assert(!(await verifySignature(body + " ", sig, "secret")));
  assert(!(await verifySignature(body, sig, "other")));
  assert(!(await verifySignature(body, "not base64!", "secret")));
  assert(!(await verifySignature(body, "", "secret")));
});
