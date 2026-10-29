// LINE Messaging API webhook：驗證簽章後處理「快速查詢」「快速預約」與填好的預約表單
import type { RouterContext } from "oak";
import type { Filter } from "mongodb";
import { LINE_API_BASE, LINE_CHANNEL_ACCESS_TOKEN, LINE_CHANNEL_SECRET } from "./config.ts";
import { bookings, dbConfigured, ensureConnected } from "./db.ts";
import { logEvent } from "./logger.ts";
import { overlapFilter, toPublicBooking, toPublicUser } from "./booking_rules.ts";
import { createBooking } from "./controller.ts";
import {
  BOOK_COMMAND,
  BOOK_INSTRUCTIONS,
  bookTemplate,
  buildBookingRequest,
  formatBookingConflicts,
  formatBookingErrors,
  formatBookingSuccess,
  formatTodayBookings,
  parseBookingFields,
  QUERY_COMMAND,
  randomEditPassword,
  taipeiParts,
  verifySignature,
} from "./line_bot.ts";
import type { BookingDoc } from "./types.ts";

export const lineConfigured = LINE_CHANNEL_SECRET !== "" && LINE_CHANNEL_ACCESS_TOKEN !== "";

interface LineEvent {
  type: string;
  replyToken?: string;
  message?: { type: string; text?: string };
  deliveryContext?: { isRedelivery?: boolean };
}

async function reply(replyToken: string, texts: string[]): Promise<void> {
  const res = await fetch(`${LINE_API_BASE}/v2/bot/message/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}` },
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

async function todayBookingsText(now: number): Promise<string> {
  const { date } = taipeiParts(now);
  const from = new Date(`${date}T00:00:00+08:00`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
  const filter = { cancelled: false, ...overlapFilter(from, to) } as Filter<BookingDoc>;
  const docs = await bookings.find(filter).toArray();
  return formatTodayBookings(docs.map(toPublicBooking), now);
}

async function bookFromForm(text: string, now: number): Promise<string | null> {
  const fields = parseBookingFields(text);
  if (!fields) return null;

  const built = buildBookingRequest(fields, now);
  if (!built.ok) return formatBookingErrors(built.errors);

  const { request } = built;
  const editPassword = randomEditPassword();
  const result = await createBooking({ ...request, editPassword });
  if (result.ok) return formatBookingSuccess(request, toPublicUser(result.user).name, editPassword);
  if (result.conflicts) return formatBookingConflicts(result.conflicts);
  if (result.status === 404) return formatBookingErrors(["4️⃣ 找不到這個行編，請確認後重新輸入"]);
  return formatBookingErrors([result.error]);
}

// 回傳要回覆的訊息；不需要回覆（一般聊天、群組中的其他訊息）時回傳空陣列
async function handleText(text: string, now: number): Promise<{ action: string; texts: string[] }> {
  const command = text.trim();
  if (command === QUERY_COMMAND) {
    return { action: "query", texts: [await todayBookingsText(now)] };
  }
  if (command === BOOK_COMMAND) {
    return { action: "template", texts: [BOOK_INSTRUCTIONS, bookTemplate(now)] };
  }
  const booked = await bookFromForm(text, now);
  return booked ? { action: "book", texts: [booked] } : { action: "ignore", texts: [] };
}

async function handleEvent(event: LineEvent): Promise<void> {
  if (event.type !== "message" || event.message?.type !== "text" || !event.replyToken || !event.message.text) return;
  // LINE 重送的事件可能已經處理過，為避免重複預約直接略過
  if (event.deliveryContext?.isRedelivery) return;

  let result: { action: string; texts: string[] };
  try {
    await ensureConnected();
    result = await handleText(event.message.text, Date.now());
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

  await reply(event.replyToken, result.texts);
  logEvent("info", "LINE 訊息已回覆", {
    module: "LineWebhook",
    function: "handleEvent",
    details: { action: result.action },
  });
}

export async function lineWebhook(ctx: RouterContext<string>) {
  if (!lineConfigured || !dbConfigured) {
    ctx.response.status = 503;
    ctx.response.body = { error: "LINE 未設定" };
    logEvent("error", "LINE webhook 收到請求，但 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN 或資料庫未設定");
    return;
  }

  const body = await ctx.request.body.text();
  if (!(await verifySignature(body, ctx.request.headers.get("x-line-signature") ?? "", LINE_CHANNEL_SECRET))) {
    ctx.response.status = 401;
    ctx.response.body = { error: "簽章錯誤" };
    logEvent("warning", "LINE webhook 簽章錯誤", { module: "LineWebhook", function: "lineWebhook" });
    return;
  }

  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(body) as { events?: LineEvent[] }).events ?? [];
  } catch {
    ctx.response.status = 400;
    return;
  }

  // 依序處理，同一批中的預約不會互相搶同一個時段
  for (const event of events) {
    await handleEvent(event);
  }
  ctx.response.status = 200;
  ctx.response.body = { ok: true };
}
