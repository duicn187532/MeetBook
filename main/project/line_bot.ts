// LINE 官方帳號「快速查詢」「快速預約」：訊息解析與回覆文字（純函式，方便單元測試）
import type { PublicBooking } from "./types.ts";

const MINUTE = 60_000;
const TAIPEI_OFFSET = 8 * 60 * MINUTE;

// 與前端相同的可預約時段（台北時間 08:45–18:15）
export const DAY_START = "08:45";
export const DAY_END = "18:15";
// 開始時間允許比現在早幾分鐘：預設模板帶入的是傳送時間，填完送出時通常已過了一兩分鐘
const PAST_GRACE_MINUTES = 15;
const MAX_HOURS = 10;

export const ROOMS: { key: string; letter: string; name: string }[] = [
  { key: "A101", letter: "A", name: "Alpha" },
  { key: "A102", letter: "B", name: "Beta" },
  { key: "A103", letter: "S", name: "StartUp" },
];
const roomName = (key: string) => ROOMS.find((r) => r.key === key)?.name ?? key;

export const QUERY_COMMAND = "快速查詢";
export const BOOK_COMMAND = "快速預約";
const DEFAULT_TITLE = "臨時會議";

export const BOOK_INSTRUCTIONS = [
  "📝【快速預約】",
  "",
  "請填寫以下資訊並送出：",
  "",
  `1️⃣ 會議名稱：請輸入主題，如無可填「${DEFAULT_TITLE}」`,
  "2️⃣ 開始時間：24 小時制（例：14:30）",
  "3️⃣ 會議時長：半小時為單位（例：0.5hr、1hr）",
  "4️⃣ 預約人：請輸入您的行編(檢查碼可省略)",
  "5️⃣ 會議室：填寫 A / B / S（代表 Alpha / Beta / StartUp，大小寫皆可）",
  "",
  "⚠️ 請確認資料填寫完整，否則無法成功預約喔！",
].join("\n");

// ===== 時間 =====

// epoch 毫秒 → 台北 YYYY-MM-DD / HH:mm
export function taipeiParts(ms: number): { date: string; hhmm: string } {
  const iso = new Date(ms + TAIPEI_OFFSET).toISOString();
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}

function taipeiMs(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00+08:00`);
}

// 預約模板：開始時間帶入現在時間
export function bookTemplate(now: number): string {
  return [
    "📝 預約種類:臨時預約",
    `1️⃣ 會議名稱:${DEFAULT_TITLE}`,
    `2️⃣ 開始時間:${taipeiParts(now).hhmm}`,
    "3️⃣ 會議時間:1hr",
    "4️⃣ 預約人:",
    "5️⃣ 會議室:",
  ].join("\n");
}

// ===== 快速查詢 =====

// 前端沒填名稱時會存成「HH:mm ~ HH:mm」
const titleOf = (title: string) => !title || /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title) ? "未命名會議" : title;

export function formatTodayBookings(list: PublicBooking[], now: number): string {
  const { date } = taipeiParts(now);
  const lines = ["🔍【快速查詢】", "", `📅 今日（${date}）會議室預約狀況：`];
  const today = list.filter((b) => b.date === date);
  if (today.length === 0) {
    lines.push("", "今天目前沒有任何預約 🎉");
    return lines.join("\n");
  }
  for (const room of ROOMS) {
    const slots = today
      .filter((b) => b.room === room.key)
      .map((b) => ({ b, start: new Date(b.startTime).getTime(), end: new Date(b.endTime).getTime() }))
      .sort((x, y) => x.start - y.start);
    if (slots.length === 0) continue;
    lines.push("", `📋 ${room.name}會議室：`);
    for (const { b, start, end } of slots) {
      lines.push(`🕒 ${taipeiParts(start).hhmm} - ${taipeiParts(end).hhmm}｜主題：${titleOf(b.title)}`);
    }
  }
  return lines.join("\n");
}

// ===== 快速預約 =====

const FIELD_PATTERN = /^\s*(?:\d️?⃣\s*)?(預約種類|會議名稱|開始時間|會議時長|會議時間|預約人|會議室)\s*[:：]\s*(.*?)\s*$/;

type Field = "title" | "start" | "duration" | "user" | "room";
const FIELD_KEYS: Record<string, Field | undefined> = {
  會議名稱: "title",
  開始時間: "start",
  會議時長: "duration",
  會議時間: "duration",
  預約人: "user",
  會議室: "room",
};

// 回傳每個欄位填寫的值；不是預約格式（沒有預約人與會議室欄位）時回傳 null
export function parseBookingFields(text: string): Partial<Record<Field, string>> | null {
  const fields: Partial<Record<Field, string>> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(FIELD_PATTERN);
    const key = m && FIELD_KEYS[m[1]];
    if (key) fields[key] = m[2];
  }
  return "user" in fields && "room" in fields ? fields : null;
}

// "1hr" / "1.5 小時" / "0.5" / "30分" → 分鐘；不是半小時倍數時回傳 null
export function parseDuration(raw: string): number | null {
  const text = raw.replace(/\s+/g, "").toLowerCase();
  let minutes: number;
  const min = text.match(/^(\d+)(分鐘|分|min|mins|m)$/);
  const hr = text.match(/^(\d+(?:\.\d+)?)(hr|hrs|h|hour|hours|小時)?$/);
  if (min) minutes = Number(min[1]);
  else if (hr) minutes = Number(hr[1]) * 60;
  else return null;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes % 30 !== 0) return null;
  return minutes;
}

// "14:30" / "14：30" / "9:00" / "1430" → "14:30"
export function parseStartTime(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s*[:：]?\s*(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// "A" / "b" / "Beta" / "A、S" → 會議室代碼；有無法辨識的值時回傳 null
export function parseRooms(raw: string): string[] | null {
  const tokens = raw.split(/[\s,，、/／]+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const rooms: string[] = [];
  for (const token of tokens) {
    const t = token.toLowerCase();
    const room = ROOMS.find((r) =>
      t === r.letter.toLowerCase() || t === r.name.toLowerCase() || t === r.key.toLowerCase()
    );
    if (!room) return null;
    if (!rooms.includes(room.key)) rooms.push(room.key);
  }
  return rooms;
}

export interface BookingRequest {
  title: string;
  user: string;
  rooms: string[];
  startTime: Date;
  endTime: Date;
}

// 驗證欄位並換算成今天的預約時間；失敗時回傳要回覆給使用者的錯誤訊息
export function buildBookingRequest(
  fields: Partial<Record<Field, string>>,
  now: number,
): { ok: true; request: BookingRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const { date } = taipeiParts(now);

  const hhmm = fields.start ? parseStartTime(fields.start) : null;
  if (!fields.start) errors.push("2️⃣ 開始時間未填寫");
  else if (!hhmm) errors.push("2️⃣ 開始時間格式錯誤，請用 24 小時制（例：14:30）");

  const minutes = fields.duration ? parseDuration(fields.duration) : null;
  if (!fields.duration) errors.push("3️⃣ 會議時長未填寫");
  else if (!minutes) errors.push("3️⃣ 會議時長請以半小時為單位（例：0.5hr、1hr）");
  else if (minutes > MAX_HOURS * 60) errors.push(`3️⃣ 會議時長不可超過 ${MAX_HOURS} 小時`);

  const user = fields.user?.trim() ?? "";
  if (!user) errors.push("4️⃣ 預約人未填寫，請輸入您的行編");

  const rooms = fields.room ? parseRooms(fields.room) : null;
  if (!fields.room) errors.push("5️⃣ 會議室未填寫，請填 A / B / S");
  else if (!rooms) errors.push("5️⃣ 會議室請填 A / B / S（代表 Alpha / Beta / StartUp）");

  if (hhmm && minutes && minutes <= MAX_HOURS * 60) {
    const start = taipeiMs(date, hhmm);
    const end = start + minutes * MINUTE;
    if (start < taipeiMs(date, DAY_START) || end > taipeiMs(date, DAY_END)) {
      errors.push(`可預約時段為 ${DAY_START}–${DAY_END}，請調整開始時間或時長`);
    } else if (start < now - PAST_GRACE_MINUTES * MINUTE) {
      errors.push("2️⃣ 開始時間已經過了，快速預約只能預約今天接下來的時段");
    }
    if (errors.length === 0) {
      return {
        ok: true,
        request: {
          title: fields.title?.trim() || DEFAULT_TITLE,
          user,
          rooms: rooms!,
          startTime: new Date(start),
          endTime: new Date(end),
        },
      };
    }
  }
  return { ok: false, errors };
}

export function formatBookingErrors(errors: string[]): string {
  return ["❌ 預約失敗，請修正以下項目後重新送出：", "", ...errors.map((e) => `・${e}`)].join("\n");
}

export function formatBookingSuccess(
  request: BookingRequest,
  userName: string,
  editPassword: string,
): string {
  const start = taipeiParts(request.startTime.getTime());
  return [
    "✅ 預約成功！",
    "",
    `📋 會議室：${request.rooms.map(roomName).join("、")}`,
    `📌 主題：${request.title}`,
    `🕒 時間：${start.date} ${start.hhmm} - ${taipeiParts(request.endTime.getTime()).hhmm}`,
    `👤 預約人：${userName}`,
    `🔑 編輯密碼：${editPassword}（在網頁修改或取消時使用）`,
  ].join("\n");
}

export function formatBookingConflicts(
  conflicts: { room: string; conflicts: { title: string; startTime: Date | string; endTime: Date | string }[] }[],
): string {
  const lines = ["❌ 預約失敗，時段已被預約：", ""];
  for (const { room, conflicts: list } of conflicts) {
    for (const c of list) {
      const s = taipeiParts(new Date(c.startTime).getTime()).hhmm;
      const e = taipeiParts(new Date(c.endTime).getTime()).hhmm;
      lines.push(`📋 ${roomName(room)}：${s} - ${e}｜${titleOf(c.title)}`);
    }
  }
  lines.push("", "可以先輸入「快速查詢」查看今天的空檔。");
  return lines.join("\n");
}

// 4 位數編輯密碼
export function randomEditPassword(): string {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10_000).padStart(4, "0");
}

// ===== 簽章 =====

const encoder = new TextEncoder();

// X-Line-Signature = base64(HMAC-SHA256(channel secret, request body))；crypto.subtle.verify 為定時比較
export async function verifySignature(body: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    expected = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "verify",
  ]);
  return crypto.subtle.verify("HMAC", key, expected, encoder.encode(body));
}
