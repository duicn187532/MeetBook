// 管理後台：使用者資料驗證與使用統計（純函式，與資料庫無關，方便單元測試）
import { ensureDate } from "./booking_rules.ts";
import type { BookingDoc, LabelCode, UserDoc } from "./types.ts";

const MINUTE = 60_000;
const DAY_MS = 24 * 60 * MINUTE;
const TAIPEI_OFFSET = 8 * 60 * MINUTE;

// 可預約時段（台北時間 08:45–18:15，與前端及 LINE 快速預約相同）
export const WINDOW_START_MIN = 8 * 60 + 45;
export const WINDOW_END_MIN = 18 * 60 + 15;
// 熱力圖的小時欄位：08 代表 08:00–09:00（實際只算 08:45 之後）
export const HEAT_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
export const WEEKDAYS = ["一", "二", "三", "四", "五"];
// 統計允許的最大區間
export const MAX_STATS_DAYS = 400;

// ===== 使用者 =====

// 停用：status 為 false（既有欄位），或早期管理後台寫入的 disabled: true
export function isUserDisabled(u: { status?: boolean | null; disabled?: boolean }): boolean {
  return u.status === false || u.disabled === true;
}

// MongoDB 查詢條件：只找啟用中的使用者
export const ACTIVE_USER_FILTER = { status: { $ne: false }, disabled: { $ne: true } } as const;

export const DEFAULT_ROLE = { code: "user", label: "使用者" };

export interface UserInput {
  id?: unknown;
  name?: unknown;
  extension?: unknown;
  department?: unknown;
  group?: unknown;
  disabled?: unknown;
}

export interface NormalizedUser {
  id?: string;
  name?: string;
  extension?: string;
  department?: LabelCode;
  group?: LabelCode;
  disabled?: boolean;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") throw new Error(`${field}格式錯誤`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new Error(`${field}不可超過 ${max} 個字`);
  return trimmed;
}

// 行編只收數字，補零成 6 碼（與既有資料、預約時的比對方式一致）
export function normalizeUserId(value: unknown): string {
  const raw = typeof value === "number" ? String(value) : text(value, "行編", 10);
  if (!/^\d{1,6}$/.test(raw)) throw new Error("行編只能是 1–6 位數字");
  return raw.padStart(6, "0");
}

export function normalizeExtension(value: unknown): string {
  const raw = typeof value === "number" ? String(value) : text(value, "分機", 10);
  if (raw === "") return "";
  if (!/^\d{3,6}$/.test(raw)) throw new Error("分機只能是 3–6 位數字");
  return raw;
}

// 部門／組別：前端傳 { label }，沿用既有代碼；新的名稱以名稱當代碼
export function normalizeLabel(value: unknown, field: string, known: LabelCode[]): LabelCode {
  const label = value && typeof value === "object" ? (value as { label?: unknown }).label : value;
  const name = label === undefined || label === null ? "" : text(label, field, 30);
  if (name === "") return { code: "", label: "" };
  const existing = known.find((k) => k.label === name);
  return existing ? { code: existing.code, label: existing.label } : { code: name, label: name };
}

/**
 * 驗證新增或修改的使用者資料
 * @param partial true 時只處理有帶的欄位（修改），false 時行編與姓名為必填（新增）
 */
export function normalizeUserInput(
  input: UserInput,
  known: { departments: LabelCode[]; groups: LabelCode[] },
  partial: boolean,
): NormalizedUser {
  const out: NormalizedUser = {};
  if (!partial) out.id = normalizeUserId(input.id);
  if (!partial || input.name !== undefined) {
    out.name = text(input.name ?? "", "姓名", 30);
    if (!partial && out.name === "") throw new Error("請填寫姓名");
  }
  if (!partial || input.extension !== undefined) out.extension = normalizeExtension(input.extension ?? "");
  if (!partial || input.department !== undefined) {
    out.department = normalizeLabel(input.department, "部門", known.departments);
  }
  if (!partial || input.group !== undefined) out.group = normalizeLabel(input.group, "組別", known.groups);
  if (input.disabled !== undefined) {
    if (typeof input.disabled !== "boolean") throw new Error("停用狀態格式錯誤");
    out.disabled = input.disabled;
  }
  if (partial && Object.keys(out).length === 0) throw new Error("沒有要更新的欄位");
  return out;
}

// 從使用者名單整理出不重複的部門／組別（依名稱排序）
export function collectLabels(list: UserDoc[], field: "department" | "group"): LabelCode[] {
  const map = new Map<string, LabelCode>();
  for (const u of list) {
    const v = u[field];
    if (v?.label && !map.has(v.label)) map.set(v.label, { code: v.code || v.label, label: v.label });
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "zh-Hant"));
}

// ===== 統計 =====

// "YYYY-MM-DD"（台北日期）→ 該日 00:00 台北時間的 Date
export function taipeiDayStart(day: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`日期格式錯誤: ${day}`);
  const date = new Date(`${day}T00:00:00+08:00`);
  if (isNaN(date.getTime())) throw new Error(`日期格式錯誤: ${day}`);
  return date;
}

/** 解析統計區間（含起訖兩天），回傳 [from, to) */
export function parseStatsRange(fromDay: string | null, toDay: string | null): { from: Date; to: Date } {
  if (!fromDay || !toDay) throw new Error("請指定統計區間");
  const from = taipeiDayStart(fromDay);
  const to = new Date(taipeiDayStart(toDay).getTime() + DAY_MS);
  if (to <= from) throw new Error("結束日期不可早於開始日期");
  if (to.getTime() - from.getTime() > MAX_STATS_DAYS * DAY_MS) throw new Error(`統計區間不可超過 ${MAX_STATS_DAYS} 天`);
  return { from, to };
}

export interface RoomStat {
  room: string;
  name: string;
  count: number;
  hours: number;
  utilization: number; // 0–1
}

export interface NamedStat {
  name: string;
  count: number;
  hours: number;
}

export interface StatsResult {
  range: { from: string; to: string };
  workdays: number;
  totals: {
    bookings: number;
    hours: number;
    cancelled: number;
    cancelRate: number; // 0–1
    utilization: number; // 0–1，所有會議室合計
    bookers: number;
    avgMinutes: number;
    avgParticipants: number;
  };
  rooms: RoomStat[];
  // heatmap[weekday 0=週一][hourIndex] = 0–1 佔用率（所有會議室合計）
  heatmap: number[][];
  departments: NamedStat[];
  topBookers: NamedStat[];
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;

// 台北時間的星期（0=週日）與當天分鐘數
function taipeiParts(ms: number): { day: number; dow: number; minute: number } {
  const shifted = ms + TAIPEI_OFFSET;
  const day = Math.floor(shifted / DAY_MS);
  const minute = Math.floor((shifted - day * DAY_MS) / MINUTE);
  const dow = new Date(day * DAY_MS).getUTCDay();
  return { day, dow, minute };
}

// 計算 [from, to) 內每個平日（週一到週五）出現的次數
function countWeekdays(from: Date, to: Date): number[] {
  const counts = [0, 0, 0, 0, 0];
  for (let t = from.getTime(); t < to.getTime(); t += DAY_MS) {
    const { dow } = taipeiParts(t);
    if (dow >= 1 && dow <= 5) counts[dow - 1]++;
  }
  return counts;
}

// 每個小時欄位落在可預約時段內的分鐘數
function heatSlotMinutes(hour: number): number {
  const start = Math.max(hour * 60, WINDOW_START_MIN);
  const end = Math.min((hour + 1) * 60, WINDOW_END_MIN);
  return Math.max(0, end - start);
}

function userKey(user: BookingDoc["user"]): { key: string; name: string; dept: string } {
  if (!user || typeof user === "string") {
    const raw = typeof user === "string" ? user.trim() : "";
    return { key: `raw:${raw}`, name: raw || "（未知）", dept: "（未分類）" };
  }
  const name = user.name || (user.id ? `行編 ${user.id.slice(-4)}` : "（未知）");
  return { key: user.id || `name:${name}`, name, dept: user.department?.label || "（未分類）" };
}

/**
 * 依預約資料計算統計
 * 只計入與區間重疊的部分；使用率與熱力圖只算平日 08:45–18:15 的可預約時段
 */
export function computeStats(
  docs: BookingDoc[],
  range: { from: Date; to: Date },
  rooms: { key: string; name: string }[],
): StatsResult {
  const fromMs = range.from.getTime();
  const toMs = range.to.getTime();
  const weekdayCounts = countWeekdays(range.from, range.to);
  const workdays = weekdayCounts.reduce((a, b) => a + b, 0);
  const windowMinutes = WINDOW_END_MIN - WINDOW_START_MIN;

  const roomMap = new Map<string, { count: number; minutes: number; windowMinutes: number }>();
  for (const r of rooms) roomMap.set(r.key, { count: 0, minutes: 0, windowMinutes: 0 });
  const heatMinutes = WEEKDAYS.map(() => HEAT_HOURS.map(() => 0));
  const deptMap = new Map<string, { count: number; minutes: number }>();
  const bookerMap = new Map<string, { name: string; count: number; minutes: number }>();

  let bookings = 0;
  let cancelled = 0;
  let totalMinutes = 0;
  let durationSum = 0;
  let participantsSum = 0;
  let participantsN = 0;

  for (const doc of docs) {
    let start: Date, end: Date;
    try {
      start = ensureDate(doc.startTime);
      end = ensureDate(doc.endTime);
    } catch {
      continue;
    }
    const s = Math.max(start.getTime(), fromMs);
    const e = Math.min(end.getTime(), toMs);
    if (e <= s) continue;
    if (doc.cancelled) {
      cancelled++;
      continue;
    }

    bookings++;
    const minutes = (e - s) / MINUTE;
    totalMinutes += minutes;
    durationSum += (end.getTime() - start.getTime()) / MINUTE;
    if (typeof doc.participantsNum === "number" && doc.participantsNum > 0) {
      participantsSum += doc.participantsNum;
      participantsN++;
    }

    const room = roomMap.get(doc.room) ?? { count: 0, minutes: 0, windowMinutes: 0 };
    room.count++;
    room.minutes += minutes;
    roomMap.set(doc.room, room);

    const who = userKey(doc.user);
    const dept = deptMap.get(who.dept) ?? { count: 0, minutes: 0 };
    dept.count++;
    dept.minutes += minutes;
    deptMap.set(who.dept, dept);
    const booker = bookerMap.get(who.key) ?? { name: who.name, count: 0, minutes: 0 };
    booker.count++;
    booker.minutes += minutes;
    bookerMap.set(who.key, booker);

    // 逐分鐘段落切到每天的可預約時段，累計使用率與熱力圖
    let cursor = s;
    while (cursor < e) {
      const { day, dow } = taipeiParts(cursor);
      const dayStartMs = day * DAY_MS - TAIPEI_OFFSET;
      const segEnd = Math.min(e, dayStartMs + DAY_MS);
      if (dow >= 1 && dow <= 5) {
        const segStartMin = (cursor - dayStartMs) / MINUTE;
        const segEndMin = (segEnd - dayStartMs) / MINUTE;
        const inWindow = Math.max(0, Math.min(segEndMin, WINDOW_END_MIN) - Math.max(segStartMin, WINDOW_START_MIN));
        room.windowMinutes += inWindow;
        HEAT_HOURS.forEach((hour, i) => {
          const slotStart = Math.max(hour * 60, WINDOW_START_MIN);
          const slotEnd = Math.min((hour + 1) * 60, WINDOW_END_MIN);
          const overlap = Math.min(segEndMin, slotEnd) - Math.max(segStartMin, slotStart);
          if (overlap > 0) heatMinutes[dow - 1][i] += overlap;
        });
      }
      cursor = segEnd;
    }
  }

  const roomCapacity = workdays * windowMinutes;
  const roomStats: RoomStat[] = [...roomMap.entries()].map(([key, v]) => ({
    room: key,
    name: rooms.find((r) => r.key === key)?.name ?? key,
    count: v.count,
    hours: round(v.minutes / 60),
    utilization: roomCapacity > 0 ? round(Math.min(1, v.windowMinutes / roomCapacity), 3) : 0,
  }));
  const usedWindow = [...roomMap.values()].reduce((a, v) => a + v.windowMinutes, 0);
  const roomCount = Math.max(1, rooms.length);

  const heatmap = heatMinutes.map((row, d) =>
    row.map((minutes, i) => {
      const capacity = weekdayCounts[d] * heatSlotMinutes(HEAT_HOURS[i]) * roomCount;
      return capacity > 0 ? round(Math.min(1, minutes / capacity), 3) : 0;
    })
  );

  const toNamed = (name: string, v: { count: number; minutes: number }): NamedStat => ({
    name,
    count: v.count,
    hours: round(v.minutes / 60),
  });
  const byHours = (a: NamedStat, b: NamedStat) => b.hours - a.hours || b.count - a.count;

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    workdays,
    totals: {
      bookings,
      hours: round(totalMinutes / 60),
      cancelled,
      cancelRate: bookings + cancelled > 0 ? round(cancelled / (bookings + cancelled), 3) : 0,
      utilization: roomCapacity > 0 ? round(Math.min(1, usedWindow / (roomCapacity * roomCount)), 3) : 0,
      bookers: bookerMap.size,
      avgMinutes: bookings > 0 ? Math.round(durationSum / bookings) : 0,
      avgParticipants: participantsN > 0 ? round(participantsSum / participantsN) : 0,
    },
    rooms: roomStats,
    heatmap,
    departments: [...deptMap.entries()].map(([name, v]) => toNamed(name, v)).sort(byHours),
    topBookers: [...bookerMap.values()].map((v) => toNamed(v.name, v)).sort(byHours).slice(0, 10),
  };
}
