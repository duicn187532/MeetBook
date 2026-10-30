import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  DEFAULT_FUTURE_DAYS,
  DEFAULT_PAST_DAYS,
  ensureWorkday,
  normalizeParticipants,
  normalizeRooms,
  overlapFilter,
  parseRange,
  pickBookingUpdate,
  taipeiDate,
  taipeiWeekday,
  toPublicBooking,
  validateBookingTimes,
  WEEKEND_MESSAGE,
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

Deno.test("toPublicBooking 沒有姓名時以行編後 4 碼代替", () => {
  const pub = toPublicBooking({
    id: "b3",
    user: {
      id: "001234",
      name: "",
      extension: "51164",
      department: { code: "D1", label: "資訊部" },
      group: { code: "G1", label: "開發組" },
    },
  } as unknown as BookingDoc);
  assertEquals(pub.user.name, "1234");
  assert(!JSON.stringify(pub).includes("001234"));
  assert(!JSON.stringify(pub).includes("D1"));
});

Deno.test("toPublicBooking 處理舊格式的字串 user", () => {
  const pub = toPublicBooking({ id: "b2", user: "王小明 1234 #51164" } as unknown as BookingDoc);
  assertEquals(pub.user.name, "未具名");
  assert(!JSON.stringify(pub).includes("1234"));
});

Deno.test("ensureWorkday 以台北時間判斷，週六、週日不可預約", () => {
  // 2026-10-30 是週五、10-31 週六、11-01 週日、11-02 週一
  ensureWorkday(new Date("2026-10-30T09:00:00+08:00"));
  ensureWorkday(new Date("2026-11-02T08:45:00+08:00"));
  assertThrows(() => ensureWorkday(new Date("2026-10-31T10:00:00+08:00")), Error, WEEKEND_MESSAGE);
  assertThrows(() => ensureWorkday(new Date("2026-11-01T10:00:00+08:00")), Error, WEEKEND_MESSAGE);
  // UTC 還是週五、台北已是週六
  assertEquals(taipeiWeekday(new Date("2026-10-30T16:30:00Z")), 6);
  assertThrows(() => ensureWorkday(new Date("2026-10-30T16:30:00Z")), Error, WEEKEND_MESSAGE);
  // UTC 還是週日、台北已是週一
  ensureWorkday(new Date("2026-11-01T17:00:00Z"));
});
