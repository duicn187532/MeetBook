// Today 分頁：依今天的預約推算每間會議室現在的狀態（純函式，不依賴 React 與 dayjs）
import { Meeting, RoomKey, roomNames } from "../types/common";
import { DAY_END_MIN, DAY_START_MIN, taipeiHHmm, taipeiMs } from "./bookingHelpers";

// 距離開始幾分鐘內算「即將開始」
export const SOON_MINUTES = 15;
// 立即預約的預設長度與最短長度
const QUICK_BOOK_MINUTES = 60;
const QUICK_BOOK_MIN_MINUTES = 15;
const MINUTE = 60_000;

// 可預約時段至少要這麼長才列出
const MIN_FREE_MINUTES = 15;

export type RoomStatusKind = "busy" | "soon" | "free" | "done";
export type DayPhase = "before" | "open" | "after";

export interface TodaySlot {
  start: number; // epoch 毫秒
  end: number;
  meeting: Meeting;
}

export interface TodayRoom {
  room: RoomKey;
  kind: RoomStatusKind;
  statusLabel: string;
  headline: string;
  detail: string;
  slots: TodaySlot[]; // 依開始時間排序
  current: Meeting | null;
  quickBook: { startTime: string; endTime: string } | null; // 沒有可預約的時段時為 null
  availability: string; // LIVE 卡片上的可預約時段文字，例如「14:00 前 · 16:30 後可預約」
}

export interface TodayOverview {
  date: string;
  phase: DayPhase;
  total: number; // 今天所有會議室的預約數
  counts: Record<RoomStatusKind, number>;
  rooms: TodayRoom[];
}

// "85 分鐘" / "1 小時 25 分" / "2 小時"
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分鐘`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`;
}

const minutesBetween = (from: number, to: number) => Math.max(1, Math.ceil((to - from) / MINUTE));
const range = (slot: TodaySlot) => `${taipeiHHmm(slot.start)}–${taipeiHHmm(slot.end)}`;
const roomLabel = (room: string) => roomNames[room as RoomKey] ?? room;
// 沒有填會議名稱時，前端會以「HH:mm ~ HH:mm」代替；狀態卡上改顯示「未命名會議」避免時間重複
const titleOf = (slot: TodaySlot) =>
  /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(slot.meeting.title) ? "未命名會議" : slot.meeting.title;

// 某間會議室在指定台北日期的預約，依開始時間排序
export function roomSlots(meetings: Meeting[], room: string, date: string): TodaySlot[] {
  return meetings
    .filter((m) => m.room === room && m.date === date)
    .map((m) => ({ start: Date.parse(m.startTime), end: Date.parse(m.endTime), meeting: m }))
    .filter((s) => !isNaN(s.start) && !isNaN(s.end) && s.start < s.end)
    .sort((a, b) => a.start - b.start);
}

// 立即預約的建議時間：從現在（5 分鐘取整）起第一段至少 15 分鐘的空檔，最長 1 小時，不超過 18:15
export function quickBookTimes(
  slots: TodaySlot[],
  date: string,
  now: number,
): { startTime: string; endTime: string } | null {
  const dayEnd = taipeiMs(date, DAY_END_MIN);
  let start = Math.max(Math.ceil(now / (5 * MINUTE)) * 5 * MINUTE, taipeiMs(date, DAY_START_MIN));
  for (let i = 0; i <= slots.length + 1; i++) {
    const covering = slots.find((s) => s.start <= start && start < s.end);
    if (covering) {
      start = covering.end;
      continue;
    }
    const next = slots.find((s) => s.start > start);
    const end = Math.min(start + QUICK_BOOK_MINUTES * MINUTE, next ? next.start : Infinity, dayEnd);
    if (end - start >= QUICK_BOOK_MIN_MINUTES * MINUTE) {
      return { startTime: taipeiHHmm(start), endTime: taipeiHHmm(end) };
    }
    if (!next || next.start >= dayEnd) return null;
    start = next.end;
  }
  return null;
}


/**
 * LIVE 卡片的可預約文字：從現在（或當天 08:45）到 18:15 之間的空檔
 * - 沒有之後的預約：「目前無預約」
 * - 空檔在最前面：「14:00 前」；在最後面：「16:30 後」；在中間：「12:00–13:30」
 * - 最多列 3 段，其餘以「…」表示
 */
/** 當天已剩不到可預約的最短時間（18:00 之後）或已過 18:15：視為下班 */
export function isAfterHours(date: string, now: number): boolean {
  return now >= taipeiMs(date, DAY_END_MIN) - MIN_FREE_MINUTES * MINUTE;
}

// 下班後摘要條的輕鬆語句，依日期輪替（同一天固定同一句）
export const AFTER_HOURS_LINES = [
  "下班囉，今天辛苦了 🌙",
  "會議室也下班了，回家好好休息 🏠",
  "今天也辛苦了，明天見 ✨",
  "下班時間到，放鬆一下吧 ☕",
];

export function afterHoursLine(date: string): string {
  const n = [...date].reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return AFTER_HOURS_LINES[n % AFTER_HOURS_LINES.length];
}

export function availabilityText(slots: TodaySlot[], date: string, now: number): string {
  const dayStart = taipeiMs(date, DAY_START_MIN);
  const dayEnd = taipeiMs(date, DAY_END_MIN);
  if (isAfterHours(date, now)) return "今日已結束";
  const from = Math.max(now, dayStart);
  const upcoming = slots.filter((s) => s.end > from);
  if (upcoming.length === 0) return "目前無預約";

  const windows: { start: number; end: number }[] = [];
  let cursor = from;
  for (const s of upcoming) {
    if (s.start > cursor) windows.push({ start: cursor, end: Math.min(s.start, dayEnd) });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < dayEnd) windows.push({ start: cursor, end: dayEnd });
  const usable = windows.filter((w) => w.end - w.start >= MIN_FREE_MINUTES * MINUTE);
  if (usable.length === 0) return "今日已滿";

  const parts = usable.slice(0, 3).map((w) => {
    if (w.start === from && w.end === dayEnd) return "全天";
    if (w.start === from) return `${taipeiHHmm(w.end)}前`;
    if (w.end === dayEnd) return `${taipeiHHmm(w.start)} 後`;
    return `${taipeiHHmm(w.start)}–${taipeiHHmm(w.end)}`;
  });
  return `${parts.join(" · ")}${usable.length > 3 ? " …" : ""}可預約`;
}

export function todayRoomStatus(room: RoomKey, slots: TodaySlot[], date: string, now: number): TodayRoom {
  const base = {
    room,
    slots,
    quickBook: quickBookTimes(slots, date, now),
    availability: availabilityText(slots, date, now),
  };
  const last = slots[slots.length - 1];

  if (now >= taipeiMs(date, DAY_END_MIN)) {
    return {
      ...base,
      kind: "done",
      statusLabel: "今日已結束",
      headline: slots.length > 0 ? "今天的會議都結束了" : "今天沒有預約",
      detail: last ? `最後一場 ${range(last)} ${titleOf(last)}` : "",
      current: null,
    };
  }

  const current = slots.find((s) => s.start <= now && now < s.end);
  if (current) {
    const next = slots.find((s) => s.start >= current.end);
    const parts = [current.meeting.user.name, range(current), `剩 ${formatDuration(minutesBetween(now, current.end))}`];
    if (current.meeting.isMulti.length > 0) {
      parts.push(`與 ${current.meeting.isMulti.map(roomLabel).join("、")} 同時預約`);
    }
    if (next && next.start === current.end) parts.push(`接著 ${taipeiHHmm(next.start)} ${titleOf(next)}`);
    return {
      ...base,
      kind: "busy",
      statusLabel: "使用中",
      headline: titleOf(current),
      detail: parts.join(" · "),
      current: current.meeting,
    };
  }

  const next = slots.find((s) => s.start > now);
  if (next && next.start - now <= SOON_MINUTES * MINUTE) {
    return {
      ...base,
      kind: "soon",
      statusLabel: `${minutesBetween(now, next.start)} 分鐘後開始`,
      headline: `${titleOf(next)} ${taipeiHHmm(next.start)} 開始`,
      detail: `${next.meeting.user.name} · ${range(next)} · 目前空閒`,
      current: null,
    };
  }

  let headline: string;
  let detail: string;
  if (next) {
    headline = `空閒至 ${taipeiHHmm(next.start)}`;
    detail = `還有 ${formatDuration(minutesBetween(now, next.start))} · 下一場 ${titleOf(next)}`;
  } else if (slots.length === 0) {
    headline = "整天空閒";
    detail = "今天沒有預約";
  } else {
    headline = "今天之後都空閒";
    detail = `最後一場 ${range(last)} ${titleOf(last)}`;
  }
  return { ...base, kind: "free", statusLabel: "空閒", headline, detail, current: null };
}

export function buildTodayOverview(meetings: Meeting[], rooms: RoomKey[], date: string, now: number): TodayOverview {
  const list = rooms.map((room) => todayRoomStatus(room, roomSlots(meetings, room, date), date, now));
  const counts: Record<RoomStatusKind, number> = { busy: 0, soon: 0, free: 0, done: 0 };
  for (const r of list) counts[r.kind] += 1;
  const phase: DayPhase = now < taipeiMs(date, DAY_START_MIN)
    ? "before"
    : now >= taipeiMs(date, DAY_END_MIN)
    ? "after"
    : "open";
  return { date, phase, total: list.reduce((n, r) => n + r.slots.length, 0), counts, rooms: list };
}
