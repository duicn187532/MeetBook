import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  computeStats,
  displayOrg,
  HEAT_HOURS,
  isUserDisabled,
  normalizeOrg,
  normalizeUserId,
  normalizeUserInput,
  parseStatsRange,
  toAdminBooking,
} from "./admin_rules.ts";
import type { BookingDoc } from "./types.ts";

const ROOMS = [{ key: "A101", name: "Alpha" }, { key: "A102", name: "Beta" }];

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

Deno.test("normalizeUserInput 新增時只有行編必填，姓名可留空", () => {
  assertEquals(normalizeUserInput({ id: "5977" }, false), {
    id: "005977",
    name: "",
    extension: "",
    department: { code: "", label: "" },
    group: { code: "", label: "" },
  });
  const user = normalizeUserInput(
    { id: "5977", name: " 祐晨 ", extension: "51164", department: { code: "strategy" }, group: { code: "company" } },
    false,
  );
  assertEquals(user.name, "祐晨");
  assertEquals(user.department, { code: "strategy", label: "數位策略部" });
  assertEquals(user.group, { code: "company", label: "法人產品" });
  assertThrows(() => normalizeUserInput({ name: "a" }, false));
  assertThrows(() => normalizeUserInput({ id: "5977", extension: "12" }, false), Error, "分機");
});

Deno.test("normalizeOrg 只接受對照表中的部門，且組別必須屬於該部門", () => {
  assertEquals(normalizeOrg({ code: "technology" }, { code: "innovation" }), {
    department: { code: "technology", label: "金融科技部" },
    group: { code: "innovation", label: "創新研發" },
  });
  assertEquals(normalizeOrg("marketing", ""), {
    department: { code: "marketing", label: "數位行銷部" },
    group: { code: "", label: "" },
  });
  assertThrows(() => normalizeOrg({ code: "technology" }, { code: "person" }), Error, "沒有這個組別");
  assertThrows(() => normalizeOrg({ code: "others" }, ""), Error, "不在可選清單");
  assertThrows(() => normalizeOrg("", { code: "person" }), Error, "請先選擇部門");
});

Deno.test("normalizeUserInput 修改時只改組別，以原本的部門檢查對應", () => {
  const current = { department: { code: "strategy", label: "數位策略" }, group: { code: "person", label: "個人產品" } };
  assertEquals(normalizeUserInput({ group: { code: "company" } }, true, current), {
    department: { code: "strategy", label: "數位策略部" },
    group: { code: "company", label: "法人產品" },
  });
  assertThrows(() => normalizeUserInput({ group: { code: "analysis" } }, true, current), Error, "沒有這個組別");
  assertEquals(normalizeUserInput({ disabled: true, id: "9999" }, true), { disabled: true });
  assertEquals(normalizeUserInput({ name: "" }, true), { name: "" });
  assertThrows(() => normalizeUserInput({}, true), Error, "沒有要更新");
  assertThrows(() => normalizeUserInput({ disabled: "yes" }, true));
});

Deno.test("displayOrg 以代碼對應名稱，不在對照表時沿用原名稱", () => {
  assertEquals(displayOrg({ code: "strategy", label: "數位策略" }, "department").label, "數位策略部");
  assertEquals(displayOrg({ code: "analysis", label: "x" }, "group").label, "數據分析");
  assertEquals(displayOrg({ code: "others", label: "其他" }, "department"), { code: "others", label: "其他" });
  assertEquals(displayOrg(undefined, "group"), { code: "", label: "" });
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

Deno.test("isUserDisabled 以 status: false 或舊的 disabled: true 判斷停用", () => {
  assertEquals(isUserDisabled({ status: false }), true);
  assertEquals(isUserDisabled({ status: true }), false);
  assertEquals(isUserDisabled({}), false);
  assertEquals(isUserDisabled({ status: null }), false);
  assertEquals(isUserDisabled({ disabled: true }), true);
  assertEquals(isUserDisabled({ status: true, disabled: true }), true);
});

Deno.test("toAdminBooking 轉成後台紀錄，不帶編輯密碼，部門以代碼對應名稱", () => {
  const doc = booking("2026-10-27T09:00:00+08:00", "2026-10-27T10:00:00+08:00", {
    room: "A102",
    isMulti: ["A101"],
    updatedCount: 2,
    updatedTime: new Date("2026-10-26T01:00:00Z"),
    editPassword: "secret",
    user: {
      id: "006812",
      name: "NeilP",
      extension: "51189",
      department: { code: "strategy", label: "數位策略" },
      group: { code: "person", label: "個人產品" },
    },
  });
  const r = toAdminBooking(doc, ROOMS);
  assertEquals(r.roomName, "Beta");
  assertEquals(r.multi, ["Alpha"]);
  assertEquals(r.department, "數位策略部");
  assertEquals(r.startTime, "2026-10-27T01:00:00.000Z");
  assertEquals(r.updatedCount, 2);
  assert(!JSON.stringify(r).includes("secret"));
  // 舊資料：user 是字串、時間是字串
  const old = toAdminBooking(
    { ...doc, user: "59773 #51164", startTime: "2026-10-27T01:00:00.000Z", updatedTime: undefined },
    ROOMS,
  );
  assertEquals(old.name, "59773 #51164");
  assertEquals(old.startTime, "2026-10-27T01:00:00.000Z");
  assertEquals(old.updatedTime, null);
});
