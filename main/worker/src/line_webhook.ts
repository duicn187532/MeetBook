// LINE Messaging API webhook：驗證簽章後處理「快速查詢」「快速預約」「ai」與填好的預約表單
// 行為與 Deno 版 line_webhook.ts 相同
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";
import { toPublicBooking, toPublicUser } from "./booking_rules.ts";
import { createBooking } from "./bookings.ts";
import { type BookingRow, rowToBooking } from "./db.ts";
import {
  aiGuideConnector,
  aiGuideFree,
  aiTemplate,
  BOOK_COMMAND,
  BOOK_INSTRUCTIONS,
  bookTemplate,
  buildBookingRequest,
  formatBookingConflicts,
  formatBookingErrors,
  formatBookingSuccess,
  formatTodayBookings,
  helpReply,
  isAiCommand,
  isTaipeiWeekend,
  parseBookingFields,
  QUERY_COMMAND,
  randomEditPassword,
  taipeiParts,
  verifySignature,
  WEEKEND_REPLY,
} from "./line_bot.ts";

type Ctx = Context<{ Bindings: Env }>;

export function lineConfigured(env: Env): boolean {
  return !!env.LINE_CHANNEL_SECRET && !!env.LINE_CHANNEL_ACCESS_TOKEN;
}

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: { type: string; text?: string };
  // user：一對一聊天；group／room：群組
  source?: { type?: string };
  deliveryContext?: { isRedelivery?: boolean };
}

async function reply(env: Env, replyToken: string, texts: string[]): Promise<void> {
  const base = env.LINE_API_BASE || "https://api.line.me";
  const res = await fetch(`${base}/v2/bot/message/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
    body: JSON.stringify({ replyToken, messages: texts.map((text) => ({ type: "text", text })) }),
  });
  if (!res.ok) {
    logEvent("error", "LINE 回覆失敗", {
      module: "LineWebhook",
      function: "reply",
      details: { status: res.status, body: (await res.text()).slice(0, 500) },
    });
  }
}

async function todayBookingsText(db: D1Database, now: number): Promise<string> {
  const { date } = taipeiParts(now);
  const from = new Date(`${date}T00:00:00+08:00`).getTime();
  const to = from + 24 * 60 * 60 * 1000;
  const { results } = await db
    .prepare("SELECT * FROM bookings WHERE cancelled = 0 AND end_time > ? AND start_time < ? ORDER BY rowid")
    .bind(from, to)
    .all<BookingRow>();
  return formatTodayBookings(results.map(rowToBooking).map(toPublicBooking), now);
}

async function bookFromForm(db: D1Database, text: string, now: number): Promise<string | null> {
  const fields = parseBookingFields(text);
  if (!fields) return null;

  const built = buildBookingRequest(fields, now);
  if (!built.ok) return formatBookingErrors(built.errors);

  const { request } = built;
  const editPassword = randomEditPassword();
  const result = await createBooking(db, { ...request, editPassword, source: "line" });
  if (result.ok) return formatBookingSuccess(request, toPublicUser(result.user).name, editPassword);
  if (result.conflicts) return formatBookingConflicts(result.conflicts);
  if (result.status === 404) return formatBookingErrors(["4️⃣ 找不到這個行編，請確認後重新輸入"]);
  return formatBookingErrors([result.error]);
}

// 回傳要回覆的訊息；不需要回覆（群組中的一般聊天）時回傳空陣列
async function handleText(
  db: D1Database,
  text: string,
  now: number,
  direct: boolean,
): Promise<{ action: string; texts: string[] }> {
  const command = text.trim();
  if (command === QUERY_COMMAND) {
    return { action: "query", texts: [await todayBookingsText(db, now)] };
  }
  if (command === BOOK_COMMAND) {
    // 週末直接告知不開放，不必填完表單才被拒絕
    if (isTaipeiWeekend(now)) return { action: "template", texts: [WEEKEND_REPLY] };
    return { action: "template", texts: [BOOK_INSTRUCTIONS, bookTemplate(now)] };
  }
  // 「ai」：兩種用 AI 預約的設定教學；方法一之後接一則可以直接複製貼上的範本
  if (isAiCommand(command)) return { action: "ai-guide", texts: [aiGuideFree(), aiTemplate(), aiGuideConnector()] };
  const booked = await bookFromForm(db, text, now);
  if (booked) return { action: "book", texts: [booked] };
  // 一對一聊天時說明可以用的指令；群組中的一般聊天不回覆
  return direct ? { action: "help", texts: [helpReply()] } : { action: "ignore", texts: [] };
}

async function handleEvent(env: Env, event: LineEvent): Promise<void> {
  if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken || !event.message.text) return;
  // LINE 重送的事件可能已經處理過，為避免重複預約直接略過
  if (event.deliveryContext?.isRedelivery) return;

  let result: { action: string; texts: string[] };
  try {
    result = await handleText(env.DB, event.message.text, Date.now(), event.source?.type === "user");
  } catch (error) {
    const err = error as Error;
    logEvent("error", "LINE 訊息處理失敗", {
      module: "LineWebhook",
      function: "handleEvent",
      details: { error: err.message },
      errorStack: err.stack,
    });
    result = { action: "error", texts: ["⚠️ 系統暫時無法處理，請稍後再試，或改用網頁預約。"] };
  }
  if (result.texts.length === 0) return;

  await reply(env, event.replyToken, result.texts);
  logEvent("info", "LINE 訊息已回覆", {
    module: "LineWebhook",
    function: "handleEvent",
    details: { action: result.action },
  });
}

export async function lineWebhook(c: Ctx) {
  if (!lineConfigured(c.env) || !c.env.DB) {
    logEvent("error", "LINE webhook 收到請求，但 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN 或資料庫未設定");
    return c.json({ error: "LINE 未設定" }, 503);
  }

  const body = await c.req.text();
  if (!(await verifySignature(body, c.req.header("x-line-signature") ?? "", c.env.LINE_CHANNEL_SECRET!))) {
    logEvent("warning", "LINE webhook 簽章錯誤", { module: "LineWebhook", function: "lineWebhook" });
    return c.json({ error: "簽章錯誤" }, 401);
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return c.body(null, 400);
  }

  // 依序處理，同一批中的預約不會互相搶同一個時段
  for (const event of events) {
    await handleEvent(c.env, event);
  }
  return c.json({ ok: true }, 200);
}
