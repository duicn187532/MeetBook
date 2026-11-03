// 給 AI 助理讀的說明頁與查詢頁（純文字）：使用者在 ChatGPT、Claude 等對話中貼上 https://meetbook.pages.dev/ai，
// AI 讀取後就能查空檔，並產生「預填預約連結」讓使用者在網站上確認送出（見前端 src/utils/bookingLink.ts）。
// - GET /ai：說明、預約規則、未來 10 個工作日的空檔（不含預約者姓名），以及每天的詳細頁網址
// - GET /ai/day/:date：某天各會議室的預約與空檔（與網站公開的資料相同：預約者只顯示姓名，沒有姓名時顯示行編後 4 碼）
// 只能讀取，不能預約：AI 只產生連結，使用者自己在網站上按「預定」才會送出。
// 免費版 ChatGPT 通常只能開啟使用者貼的網址，或已讀取頁面中出現的網址，所以把每天的詳細頁網址都列在 /ai 上。
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { DAY_END, DAY_START, ROOMS, taipeiParts } from "./line_bot.ts";

type Ctx = Context<{ Bindings: Env }>;

export const WEBSITE_URL = "https://duicn187532.github.io/MeetBook/";
const MINUTE = 60_000;
const DAY = 86_400_000;
const STEP_MINUTES = 5;
const MIN_FREE_MINUTES = 15; // 短於 15 分鐘的空檔不列出
export const OVERVIEW_DAYS = 10; // /ai 列出幾個工作日的空檔
const DETAIL_LINK_DAYS = 20; // /ai 列出幾個工作日的詳細頁網址
const MAX_FUTURE_DAYS = 180;
const MAX_PAST_DAYS = 31;

// 與網站的設備說明相同（前端 EquipmentDescription.tsx）
const ROOM_DETAILS: Record<string, { seats: number; equipment: string }> = {
  A101: { seats: 10, equipment: "投影機、白板" },
  A102: { seats: 15, equipment: "投影機、白板" },
  A103: { seats: 20, equipment: "電視、白板" },
};

const WEEKDAY_NAMES = "日一二三四五六";
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const isWorkday = (date: string) => ![0, 6].includes(weekdayOf(date));
const dateLabel = (date: string) => `${date}（${WEEKDAY_NAMES[weekdayOf(date)]}）`;
const taipeiMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const hhmm = (ms: number) => taipeiParts(ms).hhmm;

/** 從今天起的 n 個工作日；今天的可預約時段已經結束時從下一個工作日開始 */
export function upcomingWorkdays(now: number, n: number): string[] {
  const out: string[] = [];
  let date = taipeiParts(now).date;
  if (taipeiMs(date, DAY_END) <= now) date = addDays(date, 1);
  while (out.length < n) {
    if (isWorkday(date)) out.push(date);
    date = addDays(date, 1);
  }
  return out;
}

const ceilToStep = (ms: number) => Math.ceil(ms / (STEP_MINUTES * MINUTE)) * STEP_MINUTES * MINUTE;

/** 某間會議室在 [dayStart, dayEnd) 內沒有被預約的時段，排除現在以前的時間 */
export function freeIntervals(
  dayStart: number,
  dayEnd: number,
  busy: { start_time: number; end_time: number }[],
  now: number,
): [number, number][] {
  const out: [number, number][] = [];
  let cursor = Math.max(dayStart, ceilToStep(now));
  for (const b of [...busy].sort((x, y) => x.start_time - y.start_time)) {
    if (b.start_time > cursor) out.push([cursor, Math.min(b.start_time, dayEnd)]);
    cursor = Math.max(cursor, b.end_time);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) out.push([cursor, dayEnd]);
  return out.filter(([s, e]) => e - s >= MIN_FREE_MINUTES * MINUTE);
}

interface Row {
  room: string;
  title: string | null;
  start_time: number;
  end_time: number;
  booker: string;
  participants: number | null;
}

// 與網站公開 API 相同的預約者顯示（toPublicUser）：姓名，沒有姓名時行編後 4 碼
const BOOKINGS_SQL = `SELECT room, title, start_time, end_time, participants_num AS participants,
  CASE WHEN user_id IS NOT NULL THEN COALESCE(NULLIF(user_name, ''), NULLIF(substr(user_id, -4), ''), '未具名') ELSE '未具名' END AS booker
  FROM bookings WHERE cancelled = 0 AND end_time > ? AND start_time < ? ORDER BY start_time, rowid`;

async function bookingsBetween(db: D1Database, from: number, to: number): Promise<Row[]> {
  return (await db.prepare(BOOKINGS_SQL).bind(from, to).all<Row>()).results;
}

// 前端沒填名稱時會存成空字串或「HH:mm ~ HH:mm」
const titleOf = (title: string | null) => !title || /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title) ? "（未命名）" : title;

function freeLines(date: string, rows: Row[], now: number): string[] {
  const dayStart = taipeiMs(date, DAY_START);
  const dayEnd = taipeiMs(date, DAY_END);
  if (dayEnd <= now) return ["- 這一天的可預約時段已經過了"];
  return ROOMS.map((r) => {
    const free = freeIntervals(dayStart, dayEnd, rows.filter((b) => b.room === r.key), now);
    const text = free.length ? free.map(([s, e]) => `${hhmm(s)}–${hhmm(e)}`).join("、") : "已滿";
    return `- ${r.name}：${text}`;
  });
}

function nowLine(now: number): string {
  const { date, hhmm: time } = taipeiParts(now);
  return `現在時間：${dateLabel(date)} ${time}（台北時間）`;
}

// 範例連結不做 URL 編碼，方便 AI 與人閱讀（瀏覽器開啟時會自動處理中文與冒號）
function exampleLink(origin: string, date: string): string {
  return `${origin}/b?room=Beta&date=${date}&start=14:00&end=15:00&title=週會&people=6&user=5977`;
}

function textResponse(c: Ctx, body: string, status = 200) {
  return c.body(body, status as 200, {
    "Content-Type": "text/plain; charset=utf-8",
    // 每次都要最新的資料；也不要被搜尋引擎收錄
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
  });
}

// ===== GET /ai =====

export async function aiGuide(c: Ctx) {
  const now = Date.now();
  const origin = new URL(c.req.url).origin;
  const days = upcomingWorkdays(now, DETAIL_LINK_DAYS);
  const overview = days.slice(0, OVERVIEW_DAYS);
  const rows = await bookingsBetween(c.env.DB, taipeiMs(overview[0], "00:00"), taipeiMs(addDays(overview.at(-1)!, 1), "00:00"));

  const lines = [
    "# 數位金融部會議室預約：給 AI 助理的說明",
    "",
    nowLine(now),
    "",
    "你是協助同事查詢與預約會議室的助理，請用繁體中文回答。所有時間都是台北時間。",
    "這一頁只能讀取，不能直接預約：請依照最後的「如何幫使用者預約」產生預約連結，讓使用者點開後在確認頁按一下送出。",
    "",
    "## 會議室（11F）",
    ...ROOMS.map((r) => `- ${r.name}（代碼 ${r.key}）：${ROOM_DETAILS[r.key].seats} 人，${ROOM_DETAILS[r.key].equipment}`),
    "",
    "## 預約規則",
    `- 只能預約週一到週五 ${DAY_START}–${DAY_END}`,
    `- 時間以 ${STEP_MINUTES} 分鐘為單位，例如 14:00、14:05`,
    "- 同一間會議室同一時段只能有一筆預約",
    "- 預約人必須是已登記的同事，需要提供行編（檢查碼可省略）",
    "",
    `## 未來 ${OVERVIEW_DAYS} 個工作日的空檔`,
    `只列出至少 ${MIN_FREE_MINUTES} 分鐘的空檔；今天只列出現在以後的時段。要看某天已經有哪些預約（會議名稱、預約者），請開啟該日的「詳細」網址。`,
  ];
  for (const date of overview) {
    lines.push("", `### ${dateLabel(date)}　詳細：${origin}/ai/day/${date}`);
    const dayRows = rows.filter((r) => r.start_time < taipeiMs(date, DAY_END) && r.end_time > taipeiMs(date, DAY_START));
    lines.push(...freeLines(date, dayRows, now));
  }
  lines.push(
    "",
    "## 之後幾天的詳細網址",
    ...days.slice(OVERVIEW_DAYS).map((date) => `- ${dateLabel(date)}：${origin}/ai/day/${date}`),
    `其他日期：${origin}/ai/day/YYYY-MM-DD`,
    "",
    "## 如何幫使用者預約",
    "你無法直接預約，請產生「預約連結」：",
    "1. 跟使用者確認會議室、日期、開始與結束時間，並確認那段時間有空（看上面的空檔或該日的詳細網址）。",
    "2. 詢問會議名稱、與會人數，以及預約人的行編。行編一定要由使用者提供，不要猜測或自己編。",
    "3. 依下面的格式產生連結，並以可點擊的連結給使用者（會議名稱有空白或 & 等符號時要做 URL 編碼）：",
    `   ${exampleLink(origin, overview[0])}`,
    "   - room：Alpha／Beta／StartUp；一次預約多間時用逗號分隔，例如 room=Alpha,Beta",
    "   - date：YYYY-MM-DD；start、end：HH:mm",
    "   - room、date、start、end 必填；title：會議名稱；people：與會人數；user：行編（不知道的可以省略，使用者會在確認頁補填）",
    "   - 不要放編輯密碼，也不要詢問使用者的編輯密碼",
    "4. 請使用者點開連結：確認頁會顯示預約內容並先檢查時段，使用者可在頁面上自行設定編輯密碼，按「確認預約」才算完成。若剛好被別人訂走，確認頁會提示。",
    "",
    `修改或取消預約：請使用者到網站 ${WEBSITE_URL} 點選該筆預約，輸入預約時設定的編輯密碼。`,
  );
  return textResponse(c, lines.join("\n") + "\n");
}

// ===== GET /ai/day/:date =====

export async function aiDay(c: Ctx) {
  const now = Date.now();
  const raw = c.req.param("date") ?? "";
  const date = raw.replace(/\//g, "-");
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid) return textResponse(c, `日期格式不正確：${raw}。請用 YYYY-MM-DD，例如 /ai/day/${taipeiParts(now).date}\n`, 400);
  const start = taipeiMs(date, "00:00");
  if (start < now - MAX_PAST_DAYS * DAY || start > now + MAX_FUTURE_DAYS * DAY) {
    return textResponse(c, `只能查詢 ${MAX_PAST_DAYS} 天前到 ${MAX_FUTURE_DAYS} 天後的日期\n`, 400);
  }

  const lines = [`# ${dateLabel(date)} 會議室預約狀況`, "", nowLine(now), ""];
  if (!isWorkday(date)) {
    lines.push("週六、週日不開放預約，請選擇週一到週五。");
    return textResponse(c, lines.join("\n") + "\n");
  }

  const rows = await bookingsBetween(c.env.DB, taipeiMs(date, DAY_START), taipeiMs(date, DAY_END));
  lines.push(`## 空檔（${DAY_START}–${DAY_END}，至少 ${MIN_FREE_MINUTES} 分鐘）`, ...freeLines(date, rows, now), "", "## 已有的預約");
  for (const r of ROOMS) {
    const list = rows.filter((b) => b.room === r.key);
    lines.push(`### ${r.name}（${ROOM_DETAILS[r.key].seats} 人）`);
    if (list.length === 0) lines.push("- 沒有預約");
    for (const b of list) {
      lines.push(`- ${hhmm(b.start_time)}–${hhmm(b.end_time)} ${titleOf(b.title)}｜預約者：${b.booker}｜${b.participants ?? 0} 人`);
    }
  }
  const origin = new URL(c.req.url).origin;
  lines.push("", `預約方式與連結格式請見 ${origin}/ai`);
  return textResponse(c, lines.join("\n") + "\n");
}

// ===== GET /robots.txt =====
// 允許 AI 助理讀取 /ai（使用者要求時），其他路徑不讓爬蟲讀取；/ai 本身另有 noindex，不會被搜尋引擎收錄
export function robotsTxt(c: Ctx) {
  return c.body("User-agent: *\nAllow: /ai\nDisallow: /\n", 200, { "Content-Type": "text/plain; charset=utf-8" });
}

