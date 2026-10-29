// Today 分頁：依今天的預約推算每間會議室現在的狀態（純函式，不依賴 React 與 dayjs）
import { Meeting, RoomKey, roomNames } from "../types/common";
import { DAY_END_MIN, DAY_START_MIN, taipeiHHmm, taipeiMs } from "./bookingHelpers";

// 距離開始幾分鐘內算「即將開始」
export const SOON_MINUTES = 15;
// 立即預約的預設長度與最短長度
const QUICK_BOOK_MINUTES = 60;
const QUICK_BOOK_MIN_MINUTES = 15;
const MINUTE = 60_000;

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

export function todayRoomStatus(room: RoomKey, slots: TodaySlot[], date: string, now: number): TodayRoom {
  const base = { room, slots, quickBook: quickBookTimes(slots, date, now) };
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
