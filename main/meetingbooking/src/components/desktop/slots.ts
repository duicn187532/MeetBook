// 電腦版：滑鼠在時間軸上的位置 → 建議預約的時段
import { DAY_END_MIN, DAY_START_MIN, taipeiHHmm, taipeiMs } from "../../utils/bookingHelpers";

const MINUTE = 60_000;
export const GRID_START_MIN = DAY_START_MIN; // 08:45
export const GRID_END_MIN = DAY_END_MIN; // 18:15
export const GRID_SPAN_MIN = GRID_END_MIN - GRID_START_MIN;

export interface Busy {
  start: number; // epoch 毫秒
  end: number;
}

export interface PickedSlot {
  start: number;
  end: number;
  startTime: string; // "HH:mm"
  endTime: string;
}

// 某天某分鐘（台北時間）在時間軸上的比例（0 ~ 1）
export function gridRatio(ms: number, date: string) {
  const ratio = (ms - taipeiMs(date, GRID_START_MIN)) / (GRID_SPAN_MIN * MINUTE);
  return Math.min(1, Math.max(0, ratio));
}

/**
 * ratio：滑鼠在時間軸上的位置（0 ~ 1）
 * 以半小時為單位取開始時間，預設 1 小時，遇到下一場會議或 18:15 就截斷；
 * 落在會議中、已經過去、或可用不到 15 分鐘時回傳 null
 */
export function pickSlot(date: string, ratio: number, busy: Busy[], now: number): PickedSlot | null {
  const minute = GRID_START_MIN + ratio * GRID_SPAN_MIN;
  const blockStart = Math.max(GRID_START_MIN, Math.floor(minute / 30) * 30);
  let start = taipeiMs(date, blockStart);
  const blockEnd = taipeiMs(date, Math.floor(minute / 30) * 30 + 30);
  if (start < now) {
    // 今天：從現在（5 分鐘取整）開始，但仍要在滑鼠所在的半小時內
    start = Math.ceil(now / (5 * MINUTE)) * 5 * MINUTE;
    if (start >= blockEnd) return null;
  }
  if (busy.some((b) => b.start <= start && start < b.end)) return null;
  const next = busy.filter((b) => b.start > start).sort((a, b) => a.start - b.start)[0];
  const end = Math.min(start + 60 * MINUTE, next ? next.start : Infinity, taipeiMs(date, GRID_END_MIN));
  if (end - start < 15 * MINUTE) return null;
  return { start, end, startTime: taipeiHHmm(start), endTime: taipeiHHmm(end) };
}
