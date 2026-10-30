import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  collectLabels,
  computeStats,
  HEAT_HOURS,
  normalizeUserId,
  normalizeUserInput,
  parseStatsRange,
} from "./admin_rules.ts";
import type { BookingDoc, UserDoc } from "./types.ts";

const ROOMS = [{ key: "A101", name: "Alpha" }, { key: "A102", name: "Beta" }];
const known = {
  departments: [{ code: "strategy", label: "數位策略部" }],
  groups: [{ code: "company", label: "法人產品" }],
};

function booking(start: string, end: string, extra: Partial<BookingDoc> = {}): BookingDoc {
  return {
    id: crypto.randomUUID(),
    createdTime: new Date(start),
    title: "t",
    user: {
      id: "005977",
      name: "祐晨",
      extension: "51164",
      department: { code: "strategy", label: "數位策略部" },
      group: { code: "company", label: "法人產品" },
    },
    room: "A101",
    participantsNum: 4,
    cancelled: false,
    startTime: new Date(start),
    endTime: new Date(end),
    editPassword: "",
    updatedCount: 0,
    date: start.slice(0, 10),
    isMulti: [],
    ...extra,
  };
}

Deno.test("normalizeUserId 補零成 6 碼並拒絕非數字", () => {
  assertEquals(normalizeUserId("5977"), "005977");
  assertEquals(normalizeUserId(" 6812 "), "006812");
  assertThrows(() => normalizeUserId("59a7"));
  assertThrows(() => normalizeUserId("1234567"));
});

Deno.test("normalizeUserInput 新增時必填，部門沿用既有代碼", () => {
  const user = normalizeUserInput(
    { id: "5977", name: " 祐晨 ", extension: "51164", department: { label: "數位策略部" }, group: "新組別" },
    known,
    false,
  );
  assertEquals(user, {
    id: "005977",
    name: "祐晨",
    extension: "51164",
    department: { code: "strategy", label: "數位策略部" },
    group: { code: "新組別", label: "新組別" },
  });
  assertThrows(() => normalizeUserInput({ id: "5977", name: "" }, known, false), Error, "姓名");
  assertThrows(() => normalizeUserInput({ id: "5977", name: "a", extension: "12" }, known, false), Error, "分機");
});

Deno.test("normalizeUserInput 修改時只處理有帶的欄位，且不能改行編", () => {
  assertEquals(normalizeUserInput({ disabled: true, id: "9999" }, known, true), { disabled: true });
  assertEquals(normalizeUserInput({ extension: "" }, known, true), { extension: "" });
  assertThrows(() => normalizeUserInput({}, known, true), Error, "沒有要更新");
  assertThrows(() => normalizeUserInput({ disabled: "yes" }, known, true));
});

Deno.test("collectLabels 去除重複與空白", () => {
  const list: UserDoc[] = [
    { id: "1", department: { code: "b", label: "乙部" } },
    { id: "2", department: { code: "a", label: "甲部" } },
    { id: "3", department: { code: "b", label: "乙部" } },
    { id: "4" },
  ];
  assertEquals(collectLabels(list, "department").map((d) => d.label).length, 2);
});

Deno.test("parseStatsRange 以台北日期為界，包含結束日", () => {
  const { from, to } = parseStatsRange("2026-10-01", "2026-10-31");
  assertEquals(from.toISOString(), "2026-09-30T16:00:00.000Z");
  assertEquals(to.toISOString(), "2026-10-31T16:00:00.000Z");
  assertThrows(() => parseStatsRange("2026-10-31", "2026-10-01"));
  assertThrows(() => parseStatsRange("2025-01-01", "2026-10-01"), Error, "400");
  assertThrows(() => parseStatsRange(null, "2026-10-01"));
});

Deno.test("computeStats 計算使用率、取消率與熱力圖", () => {
  // 2026-10-26 是週一；區間一週 = 5 個工作天
  const range = parseStatsRange("2026-10-26", "2026-11-01");
  const docs = [
    booking("2026-10-26T09:00:00+08:00", "2026-10-26T11:00:00+08:00"),
    // 舊資料：字串時間
    booking("2026-10-27T14:00:00+08:00", "2026-10-27T15:00:00+08:00", {
      room: "A102",
      startTime: "2026-10-27T06:00:00.000Z",
      endTime: "2026-10-27T07:00:00.000Z",
    }),
    booking("2026-10-28T09:00:00+08:00", "2026-10-28T10:00:00+08:00", { cancelled: true }),
    // 很舊的資料：user 是字串
    booking("2026-10-29T10:00:00+08:00", "2026-10-29T10:30:00+08:00", { user: "59773 #51164", participantsNum: 0 }),
    // 區間外
    booking("2026-11-02T09:00:00+08:00", "2026-11-02T10:00:00+08:00"),
  ];
  const stats = computeStats(docs, range, ROOMS);

  assertEquals(stats.workdays, 5);
  assertEquals(stats.totals.bookings, 3);
  assertEquals(stats.totals.cancelled, 1);
  assertEquals(stats.totals.cancelRate, 0.25);
  assertEquals(stats.totals.hours, 3.5);
  assertEquals(stats.totals.bookers, 2);
  assertEquals(stats.totals.avgMinutes, 70);
  assertEquals(stats.totals.avgParticipants, 4);

  const alpha = stats.rooms.find((r) => r.room === "A101")!;
  assertEquals(alpha.count, 2);
  assertEquals(alpha.hours, 2.5);
  // 2.5 小時 / (5 天 × 9.5 小時)
  assertEquals(alpha.utilization, Math.round((2.5 / 47.5) * 1000) / 1000);

  // 週一 09:00–10:00 只有 Alpha 有人用：1 / 2 間會議室
  const nine = HEAT_HOURS.indexOf(9);
  assertEquals(stats.heatmap[0][nine], 0.5);
  // 週三那筆已取消，不計入
  assertEquals(stats.heatmap[2][nine], 0);
  assertEquals(stats.departments[0].name, "數位策略部");
  assert(stats.departments.some((d) => d.name === "（未分類）"));
});

Deno.test("computeStats 只把可預約時段計入使用率，週末不計", () => {
  const range = parseStatsRange("2026-10-31", "2026-11-01"); // 週六、週日
  const stats = computeStats([booking("2026-10-31T09:00:00+08:00", "2026-10-31T12:00:00+08:00")], range, ROOMS);
  assertEquals(stats.workdays, 0);
  assertEquals(stats.totals.hours, 3);
  assertEquals(stats.totals.utilization, 0);

  const early = computeStats(
    [booking("2026-10-26T08:00:00+08:00", "2026-10-26T09:00:00+08:00")],
    parseStatsRange("2026-10-26", "2026-10-26"),
    ROOMS,
  );
  // 08:00–08:45 不在可預約時段，只算 15 分鐘；08 點欄位容量 15 分鐘 × 2 間
  assertEquals(early.heatmap[0][HEAT_HOURS.indexOf(8)], 0.5);
  assertEquals(early.rooms[0].utilization, Math.round((15 / 570) * 1000) / 1000);
});
