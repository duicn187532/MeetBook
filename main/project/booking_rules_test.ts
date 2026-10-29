import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  DEFAULT_FUTURE_DAYS,
  DEFAULT_PAST_DAYS,
  normalizeParticipants,
  normalizeRooms,
  overlapFilter,
  parseRange,
  pickBookingUpdate,
  taipeiDate,
  toPublicBooking,
  validateBookingTimes,
} from "./booking_rules.ts";
import type { BookingDoc } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

Deno.test("validateBookingTimes 接受 ISO 字串並回傳 Date", () => {
  const { startTime, endTime } = validateBookingTimes("2026-10-29T01:00:00.000Z", "2026-10-29T02:00:00.000Z");
  assert(startTime instanceof Date);
  assertEquals(endTime.getTime() - startTime.getTime(), 60 * 60 * 1000);
});

Deno.test("validateBookingTimes 拒絕結束早於開始與無效格式", () => {
  assertThrows(() => validateBookingTimes("2026-10-29T02:00:00Z", "2026-10-29T01:00:00Z"), Error, "結束時間");
  assertThrows(() => validateBookingTimes("2026-10-29T01:00:00Z", "2026-10-29T01:00:00Z"), Error, "結束時間");
  assertThrows(() => validateBookingTimes("not-a-date", "2026-10-29T01:00:00Z"), Error, "無效的日期格式");
  assertThrows(() => validateBookingTimes({}, "2026-10-29T01:00:00Z"), Error, "無效的日期格式");
});

Deno.test("taipeiDate 以台北時區換日", () => {
  // UTC 16:30 = 台北隔天 00:30
  assertEquals(taipeiDate(new Date("2026-10-28T16:30:00Z")), "2026-10-29");
  assertEquals(taipeiDate(new Date("2026-10-28T15:59:00Z")), "2026-10-28");
});

Deno.test("overlapFilter 同時比對 Date 與 ISO 字串", () => {
  const start = new Date("2026-10-29T01:00:00.000Z");
  const end = new Date("2026-10-29T02:00:00.000Z");
  assertEquals(overlapFilter(start, end), {
    $or: [
      { startTime: { $lt: end }, endTime: { $gt: start } },
      { startTime: { $lt: "2026-10-29T02:00:00.000Z" }, endTime: { $gt: "2026-10-29T01:00:00.000Z" } },
    ],
  });
});

Deno.test("parseRange 未提供時使用預設範圍", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  const { from, to } = parseRange(null, null, now);
  assertEquals(now.getTime() - from.getTime(), DEFAULT_PAST_DAYS * DAY_MS);
  assertEquals(to.getTime() - now.getTime(), DEFAULT_FUTURE_DAYS * DAY_MS);
});

Deno.test("parseRange 解析 from / to 並檢查範圍", () => {
  const { from, to } = parseRange("2026-10-01T00:00:00Z", "2026-11-15T00:00:00Z");
  assertEquals(from.toISOString(), "2026-10-01T00:00:00.000Z");
  assertEquals(to.toISOString(), "2026-11-15T00:00:00.000Z");
  assertThrows(() => parseRange("bad", null), RangeError);
  assertThrows(() => parseRange("2026-11-01T00:00:00Z", "2026-10-01T00:00:00Z"), RangeError);
  assertThrows(() => parseRange("2025-01-01T00:00:00Z", "2026-12-31T00:00:00Z"), RangeError, "不可超過");
});

Deno.test("pickBookingUpdate 只保留允許的欄位", () => {
  const update = pickBookingUpdate({
    title: "週會",
    participantsNum: 5,
    room: "A102",
    startTime: "2026-10-29T01:00:00.000Z",
    endTime: "2026-10-29T02:00:00.000Z",
    date: "2026-10-29",
    id: "other-id",
    user: { id: "000123", name: "hacker" },
    editPassword: "new",
    isMulti: ["A101"],
    updatedCount: 999,
  });
  assertEquals(update, {
    title: "週會",
    participantsNum: 5,
    room: "A102",
    startTime: "2026-10-29T01:00:00.000Z",
    endTime: "2026-10-29T02:00:00.000Z",
  });
});

Deno.test("pickBookingUpdate 型別不符或非物件時忽略", () => {
  assertEquals(pickBookingUpdate(null), {});
  assertEquals(pickBookingUpdate([1, 2]), {});
  assertEquals(pickBookingUpdate({ title: 1, participantsNum: NaN, room: "", cancelled: "true" }), {});
  assertEquals(pickBookingUpdate({ cancelled: true }), { cancelled: true });
  assertEquals(pickBookingUpdate({ cancelled: false }), {});
});

Deno.test("normalizeRooms 與 normalizeParticipants", () => {
  assertEquals(normalizeRooms("A101"), ["A101"]);
  assertEquals(normalizeRooms(["A101", "A102", "A101", "", 3]), ["A101", "A102"]);
  assertEquals(normalizeRooms(undefined), []);
  assertEquals(normalizeParticipants(4), 4);
  assertEquals(normalizeParticipants(null), 0);
  assertEquals(normalizeParticipants(-1), 0);
});

Deno.test("toPublicBooking 不帶出行編、密碼與代碼", () => {
  const doc: BookingDoc = {
    id: "b1",
    groupId: "g1",
    createdTime: new Date(),
    title: "週會",
    user: {
      id: "000123",
      name: "王小明",
      extension: "51164",
      department: { code: "D1", label: "資訊部" },
      group: { code: "G1", label: "開發組" },
    },
    room: "A101",
    participantsNum: 5,
    cancelled: false,
    startTime: new Date("2026-10-29T01:00:00Z"),
    endTime: new Date("2026-10-29T02:00:00Z"),
    editPassword: "secret",
    updatedCount: 1,
    date: "2026-10-29",
    isMulti: ["A102"],
  };
  const pub = toPublicBooking(doc);
  assertEquals(pub.user, {
    name: "王小明",
    extension: "51164",
    department: { label: "資訊部" },
    group: { label: "開發組" },
  });
  const json = JSON.stringify(pub);
  assert(!json.includes("000123"));
  assert(!json.includes("secret"));
  assert(!json.includes("D1"));
  assert(!("editPassword" in pub));
  assert(!("_id" in pub));
});

Deno.test("toPublicBooking 處理舊格式的字串 user", () => {
  const pub = toPublicBooking({ id: "b2", user: "王小明 1234 #51164" } as unknown as BookingDoc);
  assertEquals(pub.user.name, "未具名");
  assert(!JSON.stringify(pub).includes("1234"));
});
