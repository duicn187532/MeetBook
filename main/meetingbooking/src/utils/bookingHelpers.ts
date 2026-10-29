// 預約相關的純函式（不依賴 React 與 dayjs），台北時間固定為 UTC+8、無日光節約
import { RoomKey, roomNames } from "../types/common";

const TAIPEI_OFFSET_MIN = 8 * 60;
// 可預約時段與畫面時間軸一致：08:45 ~ 18:15
export const DAY_START_MIN = 8 * 60 + 45;
export const DAY_END_MIN = 18 * 60 + 15;
const MINUTE = 60_000;

const pad = (n: number) => String(n).padStart(2, "0");
const toHHmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

// epoch 毫秒 → 台北時間 "HH:mm"
export function taipeiHHmm(ms: number): string {
  const minutes = Math.floor(ms / MINUTE + TAIPEI_OFFSET_MIN);
  return toHHmm(((minutes % 1440) + 1440) % 1440);
}

// 台北日期 "YYYY-MM-DD" 加上當天第幾分鐘 → epoch 毫秒
export function taipeiMs(date: string, minuteOfDay: number): number {
  return Date.parse(`${date}T00:00:00+08:00`) + minuteOfDay * MINUTE;
}

const roomLabel = (room: unknown) => roomNames[room as RoomKey] ?? String(room ?? "");

// 新增預約的預設時間：下一個整點或半點、長度 1 小時；超出 09:00 ~ 17:00 的開始時間改為 09:00
export function defaultBookingTimes(now: Date): { startTime: string; endTime: string } {
  const minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + TAIPEI_OFFSET_MIN) % 1440;
  let start = Math.ceil(minutes / 30) * 30;
  if (start < 9 * 60 || start > 17 * 60) start = 9 * 60;
  return { startTime: toHHmm(start), endTime: toHHmm(start + 60) };
}

interface ConflictItem {
  room?: unknown;
  title?: unknown;
  startTime?: unknown;
  endTime?: unknown;
}

// 後端衝突回應有兩種格式：
//   新增 POST：[{ room, conflicts: [{ id, room, title, startTime, endTime }] }]
//   修改 PATCH：[{ id, room, title, startTime, endTime }]
// 轉成「Beta：週會 10:00–11:00」這樣的文字，無法辨識的項目略過
export function describeConflicts(conflicts: unknown): string[] {
  if (!Array.isArray(conflicts)) return [];
  const items: ConflictItem[] = [];
  for (const entry of conflicts) {
    if (!entry || typeof entry !== "object") continue;
    const group = entry as { room?: unknown; conflicts?: unknown };
    if (Array.isArray(group.conflicts)) {
      for (const c of group.conflicts) {
        if (c && typeof c === "object") items.push({ room: group.room, ...(c as ConflictItem) });
      }
    } else {
      items.push(entry as ConflictItem);
    }
  }
  return items.flatMap((item) => {
    const start = Date.parse(String(item.startTime));
    const end = Date.parse(String(item.endTime));
    if (isNaN(start) || isNaN(end)) return [];
    const title = typeof item.title === "string" && item.title ? item.title : "已預約";
    const room = item.room ? `${roomLabel(item.room)}：` : "";
    return [`${room}${title} ${taipeiHHmm(start)}–${taipeiHHmm(end)}`];
  });
}

export interface BusySlot {
  id: string;
  room: string;
  startTime: string;
  endTime: string;
}

interface AlternativeQuery {
  rooms: string[]; // 想預約的會議室
  date: string; // 台北日期 "YYYY-MM-DD"
  start: number; // epoch 毫秒
  end: number;
  excludeIds?: string[]; // 修改時排除自己（含同組）
  now?: number; // 不建議已經過去的時間
}

export interface Alternatives {
  freeRooms: string[]; // 同時段有空的其他會議室（只在預約單間時提供）
  nextSlot: { start: string; end: string } | null; // 同一天、同長度、所有會議室都有空的最近時段
}

// 依目前已載入的預約推算替代方案；僅供參考，是否真的能預約仍以後端檢查為準
export function findAlternatives(meetings: BusySlot[], query: AlternativeQuery, allRooms: string[]): Alternatives {
  const exclude = new Set(query.excludeIds ?? []);
  const busy = meetings
    .filter((m) => !exclude.has(m.id))
    .map((m) => ({ room: m.room, start: Date.parse(m.startTime), end: Date.parse(m.endTime) }))
    .filter((m) => !isNaN(m.start) && !isNaN(m.end));
  const isFree = (room: string, start: number, end: number) =>
    busy.every((m) => m.room !== room || !(m.start < end && start < m.end));

  const freeRooms = query.rooms.length === 1
    ? allRooms.filter((r) => !query.rooms.includes(r) && isFree(r, query.start, query.end))
    : [];

  const duration = query.end - query.start;
  const dayStart = taipeiMs(query.date, DAY_START_MIN);
  const dayEnd = taipeiMs(query.date, DAY_END_MIN);
  // 候選開始時間：每 15 分鐘一格，加上相關會議室每場會議的結束時間
  const candidates = new Set<number>();
  for (let t = taipeiMs(query.date, 9 * 60); t < dayEnd; t += 15 * MINUTE) candidates.add(t);
  for (const m of busy) if (query.rooms.includes(m.room)) candidates.add(m.end);

  let best: number | null = null;
  for (const start of candidates) {
    const end = start + duration;
    if (start === query.start || start < dayStart || end > dayEnd) continue;
    if (query.now !== undefined && start < query.now) continue;
    if (!query.rooms.every((r) => isFree(r, start, end))) continue;
    const distance = Math.abs(start - query.start);
    // 距離相同時偏好較晚的時段
    if (best === null || distance < Math.abs(best - query.start) || (distance === Math.abs(best - query.start) && start > best)) {
      best = start;
    }
  }

  return {
    freeRooms,
    nextSlot: best === null ? null : { start: taipeiHHmm(best), end: taipeiHHmm(best + duration) },
  };
}

// 組成衝突提示文字：衝突內容 + 替代建議
export function conflictMessage(conflictLines: string[], alternatives: Alternatives | null): string {
  const lines: string[] = [];
  if (conflictLines.length > 0) {
    lines.push("與以下預約重疊：", ...conflictLines.map((l) => `・${l}`));
  } else {
    lines.push("已經有人預約囉，請重新選擇時間");
  }
  if (alternatives) {
    const hints: string[] = [];
    if (alternatives.freeRooms.length > 0) {
      hints.push(`同時段 ${alternatives.freeRooms.map(roomLabel).join("、")} 目前有空`);
    }
    if (alternatives.nextSlot) {
      hints.push(`當天最近的空檔：${alternatives.nextSlot.start}–${alternatives.nextSlot.end}`);
    }
    if (hints.length > 0) lines.push("", "建議：", ...hints.map((h) => `・${h}`));
  }
  return lines.join("\n");
}
