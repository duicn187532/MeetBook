// 與資料庫無關的純函式，方便單元測試
import type { BookingDoc, PublicBooking, PublicUser } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

// 未帶 from/to 時的預設查詢範圍（相容尚未更新的前端）
export const DEFAULT_PAST_DAYS = 90;
export const DEFAULT_FUTURE_DAYS = 180;
// 單次查詢允許的最大範圍
export const MAX_RANGE_DAYS = 400;

/**
 * 確保輸入轉換為有效的 Date 物件
 * @throws Error 如果日期格式無效
 */
export function ensureDate(dateInput: unknown): Date {
  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) throw new Error("無效的日期格式");
    return dateInput;
  }
  if (typeof dateInput !== "string" && typeof dateInput !== "number") {
    throw new Error(`無效的日期格式: ${String(dateInput)}`);
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    throw new Error(`無效的日期格式: ${dateInput}`);
  }
  return date;
}

/**
 * 驗證預訂時間的有效性
 * @throws Error 如果時間無效或順序錯誤
 */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 台北時間的星期（0 = 週日 … 6 = 週六） */
export function taipeiWeekday(date: Date): number {
  return new Date(date.getTime() + TAIPEI_OFFSET_MS).getUTCDay();
}

export const WEEKEND_MESSAGE = "週六、週日不開放預約，請選擇週一到週五";

/** 週六、週日不上班：開始時間（台北）落在週末時丟出錯誤 */
export function ensureWorkday(startTime: Date): void {
  const day = taipeiWeekday(startTime);
  if (day === 0 || day === 6) throw new Error(WEEKEND_MESSAGE);
}

export function validateBookingTimes(
  startTimeInput: unknown,
  endTimeInput: unknown,
): { startTime: Date; endTime: Date } {
  const startTime = ensureDate(startTimeInput);
  const endTime = ensureDate(endTimeInput);

  if (endTime <= startTime) {
    throw new Error("結束時間必須晚於開始時間");
  }

  return { startTime, endTime };
}

const taipeiDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// 以台北時區取得 YYYY-MM-DD，伺服器端自行計算，不再信任前端傳入的 date
export function taipeiDate(date: Date): string {
  return taipeiDateFormat.format(date);
}

/**
 * 兩個時間區間重疊的條件：start1 < end2 && start2 < end1。
 * 舊版 PATCH 曾把時間存成 ISO 字串，MongoDB 比較運算只比對相同型別，
 * 因此同時以 Date 與 ISO 字串各比一次（ISO 字串依字典序即為時間順序）。
 */
export function overlapFilter(start: Date, end: Date) {
  return {
    $or: [
      { startTime: { $lt: end }, endTime: { $gt: start } },
      { startTime: { $lt: end.toISOString() }, endTime: { $gt: start.toISOString() } },
    ],
  };
}

/**
 * 解析查詢範圍；未提供時使用預設範圍
 * @throws RangeError 格式錯誤或範圍過大
 */
export function parseRange(
  fromRaw: string | null,
  toRaw: string | null,
  now: Date = new Date(),
): { from: Date; to: Date } {
  let from: Date;
  let to: Date;
  try {
    from = fromRaw ? ensureDate(fromRaw) : new Date(now.getTime() - DEFAULT_PAST_DAYS * DAY_MS);
    to = toRaw ? ensureDate(toRaw) : new Date(now.getTime() + DEFAULT_FUTURE_DAYS * DAY_MS);
  } catch {
    throw new RangeError("from / to 必須是有效的日期");
  }
  if (to <= from) {
    throw new RangeError("to 必須晚於 from");
  }
  if (to.getTime() - from.getTime() > MAX_RANGE_DAYS * DAY_MS) {
    throw new RangeError(`查詢範圍不可超過 ${MAX_RANGE_DAYS} 天`);
  }
  return { from, to };
}

// 允許透過 PATCH 修改的欄位；其餘（user、id、editPassword、isMulti…）一律忽略
export interface BookingUpdate {
  title?: string;
  participantsNum?: number;
  room?: string;
  startTime?: string;
  endTime?: string;
  cancelled?: true;
}

export function pickBookingUpdate(body: unknown): BookingUpdate {
  if (!body || typeof body !== "object" || Array.isArray(body)) return {};
  const src = body as Record<string, unknown>;
  const update: BookingUpdate = {};
  if (typeof src.title === "string") update.title = src.title;
  if (typeof src.participantsNum === "number" && Number.isFinite(src.participantsNum)) {
    update.participantsNum = src.participantsNum;
  }
  if (typeof src.room === "string" && src.room) update.room = src.room;
  if (typeof src.startTime === "string") update.startTime = src.startTime;
  if (typeof src.endTime === "string") update.endTime = src.endTime;
  if (src.cancelled === true) update.cancelled = true;
  return update;
}

// 將 room 欄位（字串或陣列）整理成不重複的會議室清單
export function normalizeRooms(room: unknown): string[] {
  const list = Array.isArray(room) ? room : [room];
  return [...new Set(list.filter((r): r is string => typeof r === "string" && r !== ""))];
}

export function normalizeParticipants(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

const UNNAMED = "未具名";

export function toPublicUser(user: BookingDoc["user"] | undefined): PublicUser {
  if (!user || typeof user === "string") {
    return { name: UNNAMED, extension: "", department: { label: "" }, group: { label: "" } };
  }
  return {
    // 多數使用者資料沒有姓名，改以行編後 4 碼代替
    name: user.name || user.id?.slice(-4) || UNNAMED,
    extension: user.extension || "",
    department: { label: user.department?.label || "" },
    group: { label: user.group?.label || "" },
  };
}

// 只回傳畫面需要的欄位（白名單），避免把密碼、代碼等內部資料帶出去
export function toPublicBooking(doc: BookingDoc): PublicBooking {
  return {
    id: doc.id,
    title: doc.title || "",
    user: toPublicUser(doc.user),
    room: doc.room,
    participantsNum: normalizeParticipants(doc.participantsNum),
    startTime: doc.startTime,
    endTime: doc.endTime,
    date: doc.date,
    updatedCount: doc.updatedCount || 0,
    isMulti: Array.isArray(doc.isMulti) ? doc.isMulti : [],
  };
}

export function summarizeConflict(doc: BookingDoc) {
  return { id: doc.id, room: doc.room, title: doc.title, startTime: doc.startTime, endTime: doc.endTime };
}
