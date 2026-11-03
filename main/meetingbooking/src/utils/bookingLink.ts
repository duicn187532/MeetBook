// 預填預約連結：AI 助理（或其他人）產生的網址，開啟網站時帶入內容並打開預約視窗。
// 只負責「填好表單」，使用者確認後按「預定」才會送出，送出時後端照常檢查衝突。
//
//   https://duicn187532.github.io/MeetBook/?book=1&room=Beta&date=2026-11-05&start=14:00&end=15:00&title=週會&people=6&user=5977
//
// 參數（除了 book 之外都可省略，省略或格式錯誤的欄位沿用預設值）：
// - book=1：必填，代表這是預約連結
// - room：Alpha／Beta／StartUp、A101／A102／A103 或 A／B／S；多間以逗號分隔
// - date：YYYY-MM-DD（台北時間）
// - start、end：HH:mm
// - title：會議名稱；people：與會人數；user：預約人行編
// 不接受編輯密碼，避免密碼出現在網址與瀏覽紀錄中
import { RoomKey, roomNames } from "../types/common";

export const LINK_PARAMS = ["book", "room", "date", "start", "end", "title", "people", "user"] as const;

const DAY_START = "08:45";
const DAY_END = "18:15";
const STEP_MINUTES = 5;

export interface BookingLink {
  rooms?: RoomKey[];
  date?: string;
  startTime?: string;
  endTime?: string;
  title?: string;
  participants?: number;
  user?: string;
}

const ROOM_KEYS = Object.keys(roomNames) as RoomKey[];
const ROOM_LETTERS: Record<string, RoomKey> = { a: "A101", b: "A102", s: "A103" };

function resolveRoom(raw: string): RoomKey | null {
  const s = raw.trim().toLowerCase();
  return ROOM_KEYS.find((k) => k.toLowerCase() === s || roomNames[k].toLowerCase() === s) ?? ROOM_LETTERS[s] ?? null;
}

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/\//g, "-");
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s ? s : null;
}

function parseTime(raw: string): string | null {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(raw.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/**
 * 解析網址的查詢字串；沒有 book=1 時回傳 null。
 * errors 為給使用者看的說明（哪些欄位有誤、已改用預設值）
 */
export function parseBookingLink(search: string, now: number): { link: BookingLink; errors: string[] } | null {
  const params = new URLSearchParams(search);
  if (params.get("book") !== "1") return null;
  const link: BookingLink = {};
  const errors: string[] = [];

  const roomParam = params.getAll("room").flatMap((r) => r.split(/[,，、]/)).filter((r) => r.trim());
  if (roomParam.length) {
    const rooms = roomParam.map(resolveRoom);
    if (rooms.some((r) => r === null)) errors.push("會議室名稱無法辨識");
    const valid = [...new Set(rooms.filter((r): r is RoomKey => r !== null))];
    if (valid.length) link.rooms = valid;
  }

  const dateParam = params.get("date");
  if (dateParam) {
    const date = parseDate(dateParam);
    if (!date) errors.push("日期格式有誤");
    else if ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) errors.push("週六、週日不開放預約");
    else link.date = date;
  }

  const startParam = params.get("start");
  const endParam = params.get("end");
  if (startParam || endParam) {
    const start = startParam ? parseTime(startParam) : null;
    const end = endParam ? parseTime(endParam) : null;
    if (!start || !end) errors.push("時間格式有誤");
    else if (start >= end) errors.push("結束時間必須晚於開始時間");
    else if (start < DAY_START || end > DAY_END) errors.push(`時間需在 ${DAY_START}–${DAY_END} 之間`);
    else if (+start.slice(3) % STEP_MINUTES || +end.slice(3) % STEP_MINUTES) errors.push(`時間需以 ${STEP_MINUTES} 分鐘為單位`);
    else {
      link.startTime = start;
      link.endTime = end;
      if (link.date && Date.parse(`${link.date}T${start}:00+08:00`) < now - 15 * 60_000) {
        errors.push("開始時間已經過了");
      }
    }
  }

  const title = params.get("title")?.trim();
  if (title) link.title = title.slice(0, 50);

  const people = params.get("people");
  if (people) {
    const n = Number(people);
    if (Number.isInteger(n) && n >= 0 && n <= 100) link.participants = n;
    else errors.push("人數有誤");
  }

  const user = params.get("user")?.trim();
  if (user) link.user = user.slice(0, 20);

  return { link, errors };
}

/** 從網址移除預約連結的參數（重新整理或分享網址時不會再打開預約視窗） */
export function stripBookingLink(href: string): string {
  const url = new URL(href);
  for (const key of LINK_PARAMS) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
