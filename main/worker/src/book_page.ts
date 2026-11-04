// 預約連結的確認頁（/b）：AI 助理產生連結，使用者點開後在這一頁按「確認預約」才會預約。
// 只有幾 KB 的單頁 HTML，不用載入整個網站；外觀沿用網站的顏色與按鈕。
//
//   GET  /b?room=Beta&date=2026-11-11&start=14:00&end=15:00&title=週會&people=6&user=1234
//        顯示預約內容並先檢查時段與預約人；打開連結本身不會預約（連結預覽、資安掃描只會讀取頁面）
//   POST /b       按「確認預約」：以網站相同的 createBooking 預約，成功後轉到 /b/ok（重新整理不會重複送出）
//   GET  /b/ok?id=…   預約結果
//
// 編輯密碼不放在連結中（會留在 AI 對話紀錄與瀏覽紀錄），由使用者在確認頁自行填寫；沒填則與網站相同，任何人都能修改。
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";
import { createBooking, findUserStrict } from "./bookings.ts";
import { DAY_END, DAY_START, ROOMS, taipeiParts } from "./line_bot.ts";
import { WEEKEND_MESSAGE } from "./booking_rules.ts";
import { site } from "./site.ts";
import { bookingEvent, googleCalendarUrl, icsFile, icsFileName } from "./calendar.ts";

type Ctx = Context<{ Bindings: Env }>;

const MINUTE = 60_000;
const DAY = 86_400_000;
const STEP_MINUTES = 5;
const PAST_GRACE_MINUTES = 15;
const MAX_FUTURE_DAYS = 180;
const MAX_TITLE = 50;
const MAX_PASSWORD = 20;

const roomName = (key: string) => ROOMS.find((r) => r.key === key)?.name ?? key;
const WEEKDAY_NAMES = "日一二三四五六";
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const taipeiMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+08:00`);

// ===== 參數 =====

export interface LinkInput {
  rooms: string[];
  date: string;
  start: string;
  end: string;
  title: string;
  people: string;
  user: string;
  password: string;
}

function resolveRoom(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return ROOMS.find((r) => [r.key, r.name, r.letter].some((v) => v.toLowerCase() === s))?.key ?? null;
}

function parseDate(raw: string): string | null {
  const s = raw.trim().replace(/\//g, "-");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
}

function parseTime(raw: string): string | null {
  const m = /^(\d{1,2})[:：](\d{2})$/.exec(raw.trim());
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** 檢查會議室、日期與時間（連結本身的內容）；回傳錯誤原因，沒有錯誤時為空陣列 */
export function readSlot(get: (k: string) => string, now: number): { slot?: { rooms: string[]; date: string; start: string; end: string }; errors: string[] } {
  const errors: string[] = [];
  const roomParts = get("room").split(/[,，、]/).map((r) => r.trim()).filter(Boolean);
  const rooms = [...new Set(roomParts.map(resolveRoom).filter((r): r is string => r !== null))];
  if (roomParts.length === 0) errors.push("缺少會議室");
  else if (rooms.length !== roomParts.length) errors.push("會議室名稱無法辨識");
  const date = parseDate(get("date"));
  if (!date) errors.push("日期格式有誤");
  const start = parseTime(get("start"));
  const end = parseTime(get("end"));
  if (!start || !end) errors.push("時間格式有誤");
  if (errors.length) return { errors };

  if ([0, 6].includes(weekdayOf(date!))) errors.push(WEEKEND_MESSAGE);
  if (start! >= end!) errors.push("結束時間必須晚於開始時間");
  else if (start! < DAY_START || end! > DAY_END) errors.push(`可預約時段為 ${DAY_START}–${DAY_END}`);
  else if (+start!.slice(3) % STEP_MINUTES || +end!.slice(3) % STEP_MINUTES) errors.push(`時間需以 ${STEP_MINUTES} 分鐘為單位`);
  const startMs = taipeiMs(date!, start!);
  if (startMs < now - PAST_GRACE_MINUTES * MINUTE) errors.push("開始時間已經過了");
  if (startMs > now + MAX_FUTURE_DAYS * DAY) errors.push(`只能預約 ${MAX_FUTURE_DAYS} 天內的時段`);
  return errors.length ? { errors } : { slot: { rooms, date: date!, start: start!, end: end! }, errors };
}

// ===== HTML =====

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const STYLE = `
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;background:#f3f4f6;color:#212529;font-family:Arial,Helvetica,"PingFang TC","Noto Sans TC","Microsoft JhengHei",sans-serif;-webkit-text-size-adjust:100%}
header{background:#fff;padding:16px 15px 8px}
header h1{margin:0;font-size:20px;line-height:1.25;font-weight:700}
header p{margin:6px 0 4px;font-size:11px;color:#495057}
header p span{color:#ff3f3f}
main{padding:16px}
.card{position:relative;background:#fff;width:100%;max-width:384px;margin:0 auto;border-radius:16px;padding:16px;box-shadow:0 10px 15px -3px rgb(0 0 0/10%),0 4px 6px -4px rgb(0 0 0/10%)}
.icon{width:48px;height:48px;margin:4px auto;border-radius:16px;background:#f08b42;color:#fff;display:flex;align-items:center;justify-content:center;font-size:36px;line-height:1}
.icon.ok{width:56px;height:56px;border-radius:12px;background:#87ca5a}
.icon.ok svg{width:32px;height:32px}
.icon.err{background:#3f3f3f;font-size:28px}
h2{margin:8px 0 16px;text-align:center;font-size:20px;font-weight:700}
.summary{background:#f7f7f7;border-radius:12px;padding:12px;margin-bottom:12px;font-size:14px;line-height:1.6}
.summary .when{font-size:16px;font-weight:700}
.pill{display:inline-block;margin:0 6px 4px 0;padding:2px 10px;border-radius:999px;color:#fff;font-size:13px;font-weight:700}
.pill.A101{background:#60aaff}.pill.A102{background:#ff3f3f}.pill.A103{background:#17c2b6}
.field{margin-bottom:8px}
label{display:block;font-size:14px;margin-bottom:4px}
input{width:100%;border:1px solid #d1d5db;border-radius:4px;padding:8px 12px;font-size:16px;font-family:inherit;outline:none;background:#fff;color:inherit}
input:focus{border-color:#f08b42}
.hint{margin:4px 0 0;font-size:12px;color:#6b7280}
.who{margin:4px 0 0;font-size:13px;color:#16a34a}
.error{margin:8px 0 0;font-size:14px;color:#ef4444;white-space:pre-line}
.warn{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fff7ed;color:#9a4a12;font-size:13px;line-height:1.5}
.buttons{display:flex;gap:16px;margin-top:16px}
.btn{flex:1;display:block;border:0;border-radius:12px;padding:10px 8px;font-size:14px;font-family:inherit;text-align:center;text-decoration:none;cursor:pointer}
.btn-primary{background:#f08b42;color:#fff}
.btn-primary:disabled{opacity:.5;cursor:default}
.btn-cancel{background:#d1d5db;color:#374151}
.btn-ok{background:#87ca5a;color:#fff}
.conflict{margin-bottom:12px}
.cal .buttons{margin-top:8px}
.btn-outline{background:#fff;border:2px solid #dfbb00;color:#374151}
`;

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

function page(c: Ctx, title: string, body: string, status = 200, script = "") {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#ffffff">
<title>${escapeHtml(title)}｜數金部會議室</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
<body>
<header><h1>數金部會議室 (11F)</h1><p>在這裡，您可以選擇合適的會議室，預訂<span>並邀請夥伴參加會議</span>。</p></header>
<main>${body}</main>
<script nonce="${nonce}">
// 送出後停用按鈕，避免連按兩次
for (const f of document.querySelectorAll("form")) f.addEventListener("submit", () => {
  const b = f.querySelector("button[type=submit]");
  if (b) { b.disabled = true; b.textContent = "預約中…"; }
});
${script}
</script>
</body>
</html>`;
  return c.body(html, status as 200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
}

function whenText(date: string, start: string, end: string) {
  return `${date.replace(/-/g, "/")}（${WEEKDAY_NAMES[weekdayOf(date)]}）${start}–${end}`;
}

function roomPills(rooms: string[]) {
  // 與網站相同的會議室顏色（前端 RoomSelector.tsx）
  return rooms.map((r) => `<span class="pill ${r}">${escapeHtml(roomName(r))}</span>`).join("");
}

function errorPage(c: Ctx, errors: string[]) {
  return page(c, "無法預約", `<div class="card">
<div class="icon err" aria-hidden="true">!</div>
<h2>這個預約連結有誤</h2>
<p class="error">${escapeHtml(errors.join("\n"))}</p>
<p class="hint">請回到 AI 助理重新產生連結，或直接到網站預約。</p>
<div class="buttons"><a class="btn btn-primary" href="${escapeHtml(site().website)}">到網站預約</a></div>
</div>`, 400);
}

interface Conflict {
  room: string;
  title: string | null;
  start_time: number;
  end_time: number;
}

async function findConflicts(db: D1Database, rooms: string[], start: number, end: number): Promise<Conflict[]> {
  const marks = rooms.map(() => "?").join(", ");
  const { results } = await db.prepare(
    `SELECT room, title, start_time, end_time FROM bookings
     WHERE room IN (${marks}) AND cancelled = 0 AND start_time < ? AND end_time > ? ORDER BY start_time`,
  ).bind(...rooms, end, start).all<Conflict>();
  return results;
}

const titleOf = (title: string | null) => !title || /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title) ? "（未命名）" : title;
const hhmm = (ms: number) => taipeiParts(ms).hhmm;

async function formPage(c: Ctx, input: LinkInput, message = "", status = 200) {
  const now = Date.now();
  const { slot, errors } = readSlot((k) => (k === "room" ? input.rooms.join(",") : input[k as keyof LinkInput] as string ?? ""), now);
  if (!slot) return errorPage(c, errors);

  const startMs = taipeiMs(slot.date, slot.start);
  const endMs = taipeiMs(slot.date, slot.end);
  const [conflicts, user] = await Promise.all([
    findConflicts(c.env.DB, slot.rooms, startMs, endMs),
    input.user.trim() ? findUserStrict(c.env.DB, input.user.trim()) : Promise.resolve(null),
  ]);

  const conflictHtml = conflicts.length
    ? `<div class="conflict"><p class="error">這個時段已被預約：\n${escapeHtml(conflicts.map((x) => `${roomName(x.room)} ${hhmm(x.start_time)}–${hhmm(x.end_time)} ${titleOf(x.title)}`).join("\n"))}</p>
<p class="hint">請回到 AI 助理換一個時段，或到網站查看空檔。</p></div>`
    : "";
  const userHint = input.user.trim()
    ? user
      ? `<p class="who">預約人：${escapeHtml(user.name || input.user.trim())}</p>`
      : `<p class="error">找不到這個行編（或已停用），請確認</p>`
    : "";

  return page(c, "確認預約", `<form class="card" method="post" action="/b">
<div class="icon" aria-hidden="true">+</div>
<h2>確認預約</h2>
<div class="summary">
<div>${roomPills(slot.rooms)}</div>
<div class="when">${escapeHtml(whenText(slot.date, slot.start, slot.end))}</div>
</div>
${conflictHtml}
<input type="hidden" name="room" value="${escapeHtml(slot.rooms.join(","))}">
<input type="hidden" name="date" value="${slot.date}">
<input type="hidden" name="start" value="${slot.start}">
<input type="hidden" name="end" value="${slot.end}">
<div class="field">
<label for="user">預約者</label>
<input id="user" name="user" value="${escapeHtml(input.user)}" placeholder="請輸入您的不含檢查碼行編" inputmode="numeric" autocomplete="off" required>
${userHint}
</div>
<div class="field">
<label for="title">會議名稱</label>
<input id="title" name="title" value="${escapeHtml(input.title)}" placeholder="請輸入會議主題" maxlength="${MAX_TITLE}" autocomplete="off">
</div>
<div class="field">
<label for="people">與會人數</label>
<input id="people" name="people" value="${escapeHtml(input.people)}" placeholder="請輸入與會人數" inputmode="numeric" autocomplete="off">
</div>
<div class="field">
<label for="password">編輯密碼</label>
<input id="password" name="password" placeholder="未輸入則任何人皆可編輯" maxlength="${MAX_PASSWORD}" autocomplete="off">
<p class="hint">之後在網站修改或取消這筆預約時使用；不會出現在網址裡</p>
</div>
${message ? `<p class="error">${escapeHtml(message)}</p>` : ""}
<div class="buttons">
<a class="btn btn-cancel" href="${escapeHtml(site().website)}">取消</a>
<button class="btn btn-primary" type="submit"${conflicts.length ? " disabled" : ""}>確認預約</button>
</div>
</form>`, status);
}

// ===== 路由 =====

/** GET /b：確認頁（不會預約） */
export function bookPage(c: Ctx) {
  const q = (k: string) => c.req.query(k) ?? "";
  return formPage(c, {
    rooms: q("room").split(/[,，、]/).filter((r) => r.trim()),
    date: q("date"),
    start: q("start"),
    end: q("end"),
    title: q("title").trim().slice(0, MAX_TITLE),
    people: q("people").trim(),
    user: q("user").trim().slice(0, 20),
    password: "",
  });
}

/** POST /b：按下「確認預約」 */
export async function bookSubmit(c: Ctx) {
  const form = await c.req.parseBody();
  const f = (k: string) => (typeof form[k] === "string" ? (form[k] as string) : "");
  const input: LinkInput = {
    rooms: f("room").split(",").filter((r) => r.trim()),
    date: f("date"),
    start: f("start"),
    end: f("end"),
    title: f("title").trim().slice(0, MAX_TITLE),
    people: f("people").trim(),
    user: f("user").trim().slice(0, 20),
    password: f("password"),
  };
  const now = Date.now();
  const { slot, errors } = readSlot((k) => (k === "room" ? input.rooms.join(",") : f(k)), now);
  if (!slot) return errorPage(c, errors);
  if (!input.user) return formPage(c, input, "請輸入預約者的行編", 400);
  let participants = 0;
  if (input.people) {
    participants = Number(input.people);
    if (!Number.isInteger(participants) || participants < 0 || participants > 100) {
      return formPage(c, input, "與會人數請輸入 0–100 的整數", 400);
    }
  }
  if (input.password.length > MAX_PASSWORD) return formPage(c, input, `編輯密碼最多 ${MAX_PASSWORD} 個字`, 400);

  const result = await createBooking(c.env.DB, {
    title: input.title,
    user: input.user,
    rooms: slot.rooms,
    startTime: new Date(taipeiMs(slot.date, slot.start)),
    endTime: new Date(taipeiMs(slot.date, slot.end)),
    participantsNum: participants,
    editPassword: input.password,
    source: "ai-link",
  });
  if (!result.ok) {
    // 衝突會在重新顯示的確認頁中列出；找不到使用者時提示確認行編
    const message = result.status === 404 ? "找不到這個行編（或已停用），請確認後再試" : result.conflicts ? "" : result.error;
    return formPage(c, input, message, result.status === 404 ? 404 : 409);
  }
  logEvent("info", "預約連結：預約成功", { module: "BookLink", details: { rooms: slot.rooms, date: slot.date } });
  return c.redirect(`/b/ok?id=${encodeURIComponent(result.ids[0])}`, 303);
}

interface BookedRow {
  id: string;
  group_id: string | null;
  room: string;
  title: string | null;
  start_time: number;
  end_time: number;
  user_name: string | null;
  user_id: string | null;
  edit_password: string;
  cancelled: number;
}

// 以預約 id 讀取這筆預約與同時預約的其他會議室（id 為隨機 UUID，無法猜測）
async function loadBooking(db: D1Database, id: string): Promise<{ first: BookedRow; group: BookedRow[]; booker: string } | null> {
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) return null;
  const first = await db.prepare("SELECT * FROM bookings WHERE id = ?").bind(id).first<BookedRow>();
  if (!first) return null;
  const group = first.group_id
    ? (await db.prepare("SELECT * FROM bookings WHERE group_id = ? ORDER BY rowid").bind(first.group_id).all<BookedRow>()).results
    : [first];
  return { first, group, booker: first.user_name || first.user_id?.slice(-4) || "" };
}

/** GET /b/ok：預約結果（以預約 id 查詢）；v=info 時標題為「預約資訊」（從網站或 LINE 開啟某筆預約時） */
export async function bookDone(c: Ctx) {
  const found = await loadBooking(c.env.DB, c.req.query("id") ?? "");
  if (!found) return errorPage(c, ["找不到這筆預約"]);
  const { first, group, booker } = found;
  const { date, hhmm: start } = taipeiParts(first.start_time);
  const noPassword = first.edit_password === "";
  const heading = c.req.query("v") === "info" ? "預約資訊" : "預約成功";
  return page(c, heading, `<div class="card">
<div class="icon ok">${CHECK_SVG}</div>
<h2>${first.cancelled ? "這筆預約已取消" : heading}</h2>
<div class="summary">
<div>${roomPills(group.map((r) => r.room))}</div>
<div class="when">${escapeHtml(whenText(date, start, hhmm(first.end_time)))}</div>
<div>${escapeHtml(titleOf(first.title))}${booker ? `｜${escapeHtml(booker)}` : ""}</div>
</div>
${noPassword
    ? `<p class="warn">沒有設定編輯密碼：任何人都能在網站上修改或取消這筆預約。</p>`
    : `<p class="hint">已設定編輯密碼，之後在網站修改或取消時使用。</p>`}
<div class="buttons"><a class="btn btn-ok" href="${escapeHtml(site().website)}">查看預約</a></div>
${first.cancelled ? "" : calendarButtons(first.id, googleCalendarUrl(eventOf(group.map((r) => r.room), first, booker)))}
</div>`, 200, first.cancelled ? "" : calendarScript(icsFile(eventOf(group.map((r) => r.room), first, booker)), icsFileName(first.start_time)));
}

// 加入行事曆、Google、分享 ics 三個按鈕（同一頁開啟；openExternalBrowser=1 讓 LINE 內建瀏覽器改用手機預設瀏覽器）
// Google 直接連到 calendar.google.com：iPhone 有安裝 Google 日曆 App 時會直接開 App
function calendarButtons(id: string, googleUrl: string) {
  const path = `/cal/${encodeURIComponent(id)}`;
  return `<div class="cal"><div class="buttons">
<a class="btn btn-outline" href="${path}.ics?openExternalBrowser=1">加入行事曆</a>
<a class="btn btn-outline" href="${escapeHtml(googleUrl)}">Google</a>
<button class="btn btn-outline" type="button" id="ics">分享 ics</button>
</div></div>`;
}

// 「分享 ics」：.ics 內容直接放在頁面中，點擊當下就能以手機的分享選單送出；不支援分享檔案時改為下載
function calendarScript(ics: string, name: string) {
  // JSON 中的 < 轉成 \u003c，避免內容提前結束 <script>
  const json = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");
  return `const ICS = ${json(ics)};
const NAME = ${json(name)};
const shareButton = document.getElementById("ics");
if (shareButton) shareButton.addEventListener("click", async () => {
  const file = new File([ICS], NAME, { type: "text/calendar" });
  let canShare = false;
  try { canShare = !!navigator.canShare && navigator.canShare({ files: [file] }); } catch {}
  if (canShare) {
    try { await navigator.share({ files: [file] }); return; }
    catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = NAME;
  document.body.append(a);
  a.click();
  a.remove();
});`;
}

// ===== 加到行事曆 =====

function eventOf(rooms: string[], row: BookedRow, booker: string) {
  return bookingEvent({
    rooms: rooms.map(roomName),
    title: row.title,
    start: row.start_time,
    end: row.end_time,
    booker,
    website: site().website,
  });
}

/**
 * GET /cal/:id/google：轉到 Google 行事曆的新增活動頁（已取消或找不到時回 404）。
 * ?format=json 時回傳 { url }：網站直接連到 Google 的網址，iPhone 才會開啟 Google 日曆 App
 * （iOS 只在點擊的連結本身就是 calendar.google.com 時開 App，經過轉址只會開網頁）。
 */
export async function calendarGoogle(c: Ctx) {
  const found = await loadBooking(c.env.DB, c.req.param("id") ?? "");
  if (!found || found.first.cancelled) {
    return c.text("找不到這筆預約（可能已取消）", 404, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  const { first, group, booker } = found;
  const url = googleCalendarUrl(eventOf(group.map((r) => r.room), first, booker));
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex");
  if (c.req.query("format") === "json") return c.json({ url });
  return c.redirect(url, 302);
}

/**
 * GET /cal/:id.ics：這筆預約的 .ics 行事曆檔。
 * 電腦下載後點開即加入 Outlook 等行事曆；部分 Android 內建行事曆可直接開啟（iPhone 由頁面以檔案內容開啟，見 calendarScript）。
 * 內容與網站公開的資料相同（會議名稱、會議室、時間、預約人），不含行編與編輯密碼；已取消的預約回 404。
 */
export async function calendarFile(c: Ctx) {
  const id = (c.req.param("file") ?? "").replace(/\.ics$/i, "");
  const found = await loadBooking(c.env.DB, id);
  if (!found || found.first.cancelled) {
    return c.text("找不到這筆預約（可能已取消）", 404, { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  }
  const { first, group, booker } = found;
  return c.body(icsFile(eventOf(group.map((r) => r.room), first, booker)), 200, {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": `inline; filename="${icsFileName(first.start_time)}"`,
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex",
    "X-Content-Type-Options": "nosniff",
  });
}
