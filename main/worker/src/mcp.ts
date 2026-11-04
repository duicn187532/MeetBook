// MCP（Model Context Protocol）伺服器：讓 AI 助理（例如 Claude）查詢會議室與預約
// 端點 POST /mcp，Streamable HTTP 傳輸的無狀態模式：每個請求回一個 JSON，不建立 session、不使用 SSE。
// 第一階段只提供查詢與新增；修改、取消請到網站操作。
// 與網站相同不需登入；新增預約一樣要提供已登記的行編，並沿用網站的防止重複預約（createBooking）。
// 回傳的預約資料與網站公開的 API 相同（預約者只顯示姓名，沒有姓名時顯示行編後 4 碼），不含編輯密碼。
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";
import { createBooking } from "./bookings.ts";
import { DAY_END, DAY_START, ROOMS, taipeiParts } from "./line_bot.ts";
import { WEEKEND_MESSAGE } from "./booking_rules.ts";
import { site } from "./site.ts";

type Ctx = Context<{ Bindings: Env }>;

// 支援的協定版本（新的在前）；用戶端要求的版本在清單中就沿用，否則回傳最新的版本
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
const SERVER_INFO = { name: "meetbook", title: "數位金融部會議室預約", version: "1.0.0" };

const MINUTE = 60_000;
const DAY = 86_400_000;
const STEP_MINUTES = 5; // 與網站相同，時間以 5 分鐘為單位
const PAST_GRACE_MINUTES = 15; // 與 LINE 快速預約相同：開始時間可比現在早 15 分鐘內
const MAX_FUTURE_DAYS = 180;
const MAX_LIST_DAYS = 14;
const MAX_BATCH = 20;

// 與網站的設備說明相同（前端 EquipmentDescription.tsx）
const ROOM_DETAILS: Record<string, { seats: number; equipment: string[] }> = {
  A101: { seats: 10, equipment: ["投影機", "白板"] },
  A102: { seats: 15, equipment: ["投影機", "白板"] },
  A103: { seats: 20, equipment: ["電視", "白板"] },
};

const rules = () => [
  `只能預約週一到週五（台北時間）${DAY_START}–${DAY_END} 之間的時段`,
  `時間以 ${STEP_MINUTES} 分鐘為單位，例如 14:00、14:05`,
  "同一間會議室同一時段只能有一筆預約；一次預約多間時，任一間衝突就整筆不預約",
  "預約人必須是已登記的使用者，請向使用者詢問行編（檢查碼可省略），不要自行猜測",
  `修改或取消預約請到網站 ${site().website}，需要預約時取得的編輯密碼`,
];

const instructions = () => [
  "這是數位金融部（11F）會議室預約系統，共三間會議室：Alpha（A101）、Beta（A102）、StartUp（A103）。所有時間都是台北時間。",
  "規則：",
  ...rules().map((r) => `- ${r}`),
  "建議流程：先用 find_free_slots 或 list_bookings 確認空檔；把會議室、日期、時間、會議名稱與行編跟使用者確認後，再呼叫 create_booking。",
  "編輯密碼不要主動詢問；使用者沒提供時不設密碼，預約後提醒使用者任何人都能修改。目前不能透過這裡修改或取消預約。",
].join("\n");

// ===== 工具定義 =====

const DATE_PROP = { type: "string", description: "日期，格式 YYYY-MM-DD（台北時間）；省略時為今天" };
const ROOM_PROP = {
  type: "string",
  description: "會議室：Alpha／Beta／StartUp，也可用代碼 A101／A102／A103 或字母 A／B／S；省略時為全部",
};

export const TOOLS = [
  {
    name: "list_rooms",
    title: "會議室與預約規則",
    description: "列出三間會議室的名稱、代碼、座位數與設備，以及預約規則和現在的台北時間。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "list_bookings",
    title: "查詢預約",
    description: "查詢某天（或連續幾天）已經有的預約（不含已取消），包含會議名稱、時間、預約者與人數。",
    inputSchema: {
      type: "object",
      properties: {
        date: DATE_PROP,
        days: { type: "integer", minimum: 1, maximum: MAX_LIST_DAYS, description: `從 date 起查詢幾天，預設 1，最多 ${MAX_LIST_DAYS}` },
        room: ROOM_PROP,
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "find_free_slots",
    title: "查詢空檔",
    description: `查詢某天各會議室在 ${DAY_START}–${DAY_END} 之間還沒有被預約的時段。今天的話只列出現在以後的時段。`,
    inputSchema: {
      type: "object",
      properties: {
        date: DATE_PROP,
        room: ROOM_PROP,
        duration_minutes: { type: "integer", minimum: 5, maximum: 600, description: "只列出至少這麼長的空檔（分鐘），預設 30" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "create_booking",
    title: "預約會議室",
    description: "預約一間或多間會議室。呼叫前請先跟使用者確認會議室、日期、時間、會議名稱與行編。",
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "string", description: "預約人的行編（檢查碼可省略），也可以是分機；必須由使用者提供" },
        rooms: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 3,
          description: "要預約的會議室（Alpha／Beta／StartUp 或 A101／A102／A103）；多間會議室會同時預約同一時段",
        },
        date: { type: "string", description: "日期，格式 YYYY-MM-DD（台北時間）" },
        start_time: { type: "string", description: "開始時間，24 小時制 HH:mm，例如 14:00" },
        end_time: { type: "string", description: "結束時間，24 小時制 HH:mm，例如 15:30" },
        title: { type: "string", maxLength: 50, description: "會議名稱" },
        participants: { type: "integer", minimum: 0, maximum: 100, description: "與會人數" },
        edit_password: { type: "string", description: "編輯密碼（選填，4–20 個英數字）。只有使用者主動提供時才填，不要主動詢問；省略時不設密碼（與網站相同，任何人都能在網站修改或取消）" },
      },
      required: ["employee_id", "rooms", "date", "start_time", "end_time"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

// ===== 輸入檢查 =====

class ToolInputError extends Error {}

function taipeiMs(date: string, hhmm: string): number {
  return Date.parse(`${date}T${hhmm}:00+08:00`);
}

const WEEKDAY_NAMES = "日一二三四五六";
function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}
const dateLabel = (date: string) => `${date}（${WEEKDAY_NAMES[weekdayOf(date)]}）`;

/** YYYY-MM-DD（也接受 YYYY/MM/DD）；省略時為今天 */
export function parseDateArg(value: unknown, now: number, required = false): string {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ToolInputError("請提供日期 date（YYYY-MM-DD）");
    return taipeiParts(now).date;
  }
  const s = typeof value === "string" ? value.trim().replaceAll("/", "-") : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s) return s;
  throw new ToolInputError(`日期格式不正確：${String(value)}，請用 YYYY-MM-DD`);
}

/** HH:mm（也接受 H:mm 與全形冒號） */
export function parseTimeArg(value: unknown, label: string): string {
  const s = typeof value === "string" ? value.trim().replace("：", ":") : "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m || +m[1] > 23 || +m[2] > 59) throw new ToolInputError(`${label}格式不正確：${String(value)}，請用 24 小時制 HH:mm`);
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** 會議室名稱、代碼或字母 → 代碼（A101…）；不認得時丟出錯誤 */
export function resolveRoom(value: unknown): string {
  const s = typeof value === "string" ? value.trim().toLowerCase() : "";
  const room = ROOMS.find((r) => [r.key, r.name, r.letter].some((v) => v.toLowerCase() === s));
  if (!room) throw new ToolInputError(`不認得的會議室：${String(value)}，請用 Alpha／Beta／StartUp`);
  return room.key;
}

function optionalRoom(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : resolveRoom(value);
}

function intArg(value: unknown, label: string, min: number, max: number, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) {
    throw new ToolInputError(`${label} 必須是 ${min}–${max} 的整數`);
  }
  return n;
}

const roomName = (key: string) => ROOMS.find((r) => r.key === key)?.name ?? key;
const nowInfo = (now: number) => {
  const { date, hhmm } = taipeiParts(now);
  return `${dateLabel(date)} ${hhmm}`;
};

// ===== 查詢 =====

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
  FROM bookings WHERE cancelled = 0 AND end_time > ? AND start_time < ?`;

async function queryBookings(db: D1Database, from: number, to: number, room: string | null): Promise<Row[]> {
  const sql = room ? `${BOOKINGS_SQL} AND room = ? ORDER BY start_time, rowid` : `${BOOKINGS_SQL} ORDER BY start_time, rowid`;
  const params: unknown[] = room ? [from, to, room] : [from, to];
  return (await db.prepare(sql).bind(...params).all<Row>()).results;
}

// 前端沒填名稱時會存成空字串或「HH:mm ~ HH:mm」
const titleOf = (title: string | null) => !title || /^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title) ? "（未命名）" : title;

function listRooms(now: number) {
  return {
    now: nowInfo(now),
    rooms: ROOMS.map((r) => ({ name: r.name, code: r.key, letter: r.letter, ...ROOM_DETAILS[r.key] })),
    booking_hours: `週一到週五 ${DAY_START}–${DAY_END}`,
    rules: rules(),
  };
}

async function listBookings(db: D1Database, args: Record<string, unknown>, now: number) {
  const date = parseDateArg(args.date, now);
  const days = intArg(args.days, "days", 1, MAX_LIST_DAYS, 1);
  const room = optionalRoom(args.room);
  const from = taipeiMs(date, "00:00");
  const rows = await queryBookings(db, from, from + days * DAY, room);
  const result: Record<string, unknown> = {
    now: nowInfo(now),
    range: days === 1 ? dateLabel(date) : `${dateLabel(date)} 起 ${days} 天`,
    room: room ? roomName(room) : "全部",
    count: rows.length,
    bookings: rows.map((r) => {
      const s = taipeiParts(r.start_time);
      return {
        date: dateLabel(s.date),
        time: `${s.hhmm}–${taipeiParts(r.end_time).hhmm}`,
        room: roomName(r.room),
        title: titleOf(r.title),
        booked_by: r.booker,
        participants: r.participants ?? 0,
      };
    }),
  };
  if (rows.length === 0) result.note = "這段期間沒有預約";
  return result;
}

const ceilToStep = (ms: number) => Math.ceil(ms / (STEP_MINUTES * MINUTE)) * STEP_MINUTES * MINUTE;

/** 某天、某間會議室在可預約時段內的空檔（[開始, 結束) 毫秒），已排除現在以前的時間 */
export function freeIntervals(dayStart: number, dayEnd: number, busy: { start_time: number; end_time: number }[], now: number) {
  const out: [number, number][] = [];
  let cursor = Math.max(dayStart, ceilToStep(now));
  for (const b of [...busy].sort((x, y) => x.start_time - y.start_time)) {
    if (b.start_time > cursor) out.push([cursor, Math.min(b.start_time, dayEnd)]);
    cursor = Math.max(cursor, b.end_time);
    if (cursor >= dayEnd) break;
  }
  if (cursor < dayEnd) out.push([cursor, dayEnd]);
  return out.filter(([s, e]) => e > s);
}

async function findFreeSlots(db: D1Database, args: Record<string, unknown>, now: number) {
  const date = parseDateArg(args.date, now);
  const room = optionalRoom(args.room);
  const minutes = intArg(args.duration_minutes, "duration_minutes", 5, 600, 30);
  const base = { now: nowInfo(now), date: dateLabel(date), duration_minutes: minutes };
  const weekday = weekdayOf(date);
  if (weekday === 0 || weekday === 6) return { ...base, note: WEEKEND_MESSAGE, rooms: [] };
  const dayStart = taipeiMs(date, DAY_START);
  const dayEnd = taipeiMs(date, DAY_END);
  if (dayEnd <= now) return { ...base, note: "這一天的可預約時段已經過了", rooms: [] };

  const rows = await queryBookings(db, dayStart, dayEnd, room);
  const rooms = (room ? ROOMS.filter((r) => r.key === room) : ROOMS).map((r) => {
    const slots = freeIntervals(dayStart, dayEnd, rows.filter((b) => b.room === r.key), now)
      .filter(([s, e]) => e - s >= minutes * MINUTE)
      .map(([s, e]) => `${taipeiParts(s).hhmm}–${taipeiParts(e).hhmm}`);
    return { room: r.name, seats: ROOM_DETAILS[r.key].seats, free: slots };
  });
  return { ...base, rooms };
}

// ===== 新增 =====

async function createBookingTool(db: D1Database, args: Record<string, unknown>, now: number) {
  const user = typeof args.employee_id === "string" ? args.employee_id.trim() : "";
  if (!user) throw new ToolInputError("請提供預約人的行編 employee_id（請向使用者詢問，不要猜測）");

  const rawRooms = Array.isArray(args.rooms) ? args.rooms : args.rooms === undefined ? [] : [args.rooms];
  if (rawRooms.length === 0) throw new ToolInputError("請提供要預約的會議室 rooms");
  const rooms = [...new Set(rawRooms.map(resolveRoom))];

  const date = parseDateArg(args.date, now, true);
  const start = parseTimeArg(args.start_time, "開始時間");
  const end = parseTimeArg(args.end_time, "結束時間");
  const startMs = taipeiMs(date, start);
  const endMs = taipeiMs(date, end);
  const weekday = weekdayOf(date);
  if (weekday === 0 || weekday === 6) throw new ToolInputError(WEEKEND_MESSAGE);
  if (endMs <= startMs) throw new ToolInputError("結束時間必須晚於開始時間");
  if (+start.slice(3) % STEP_MINUTES || +end.slice(3) % STEP_MINUTES) {
    throw new ToolInputError(`時間請以 ${STEP_MINUTES} 分鐘為單位（例如 14:00、14:05）`);
  }
  if (start < DAY_START || end > DAY_END) {
    throw new ToolInputError(`可預約時段為 ${DAY_START}–${DAY_END}`);
  }
  if (startMs < now - PAST_GRACE_MINUTES * MINUTE) throw new ToolInputError("開始時間已經過了，請選擇之後的時段");
  if (startMs > now + MAX_FUTURE_DAYS * DAY) throw new ToolInputError(`只能預約 ${MAX_FUTURE_DAYS} 天內的時段`);

  const title = typeof args.title === "string" ? args.title.trim().slice(0, 50) : "";
  const participants = intArg(args.participants, "participants", 0, 100, 0);
  // 編輯密碼不自動產生：沒有提供時與網站相同不設密碼
  let editPassword = "";
  if (args.edit_password !== undefined && args.edit_password !== null && args.edit_password !== "") {
    if (typeof args.edit_password !== "string" || !/^[A-Za-z0-9]{4,20}$/.test(args.edit_password)) {
      throw new ToolInputError("編輯密碼請用 4–20 個英文字母或數字，或省略（不設密碼）");
    }
    editPassword = args.edit_password;
  }

  const result = await createBooking(db, {
    title,
    user,
    rooms,
    startTime: new Date(startMs),
    endTime: new Date(endMs),
    participantsNum: participants,
    editPassword,
    source: "mcp",
  });
  if (!result.ok) {
    if (result.status === 404) {
      throw new ToolInputError(`找不到行編或分機「${user}」的使用者，請向使用者確認行編（檢查碼可省略）`);
    }
    if (result.conflicts) {
      const lines = result.conflicts.flatMap(({ room, conflicts }) =>
        conflicts.map((c) =>
          `${roomName(room)} ${taipeiParts(new Date(c.startTime).getTime()).hhmm}–${
            taipeiParts(new Date(c.endTime).getTime()).hhmm
          } 已有「${titleOf(c.title)}」`
        )
      );
      throw new ToolInputError(`時段已被預約，整筆沒有預約：\n${lines.join("\n")}\n可以用 find_free_slots 查詢空檔。`);
    }
    throw new ToolInputError(result.error);
  }

  logEvent("info", "MCP 新增預約成功", { module: "MCP", details: { rooms, date } });
  const seats = Math.min(...rooms.map((r) => ROOM_DETAILS[r].seats));
  return {
    success: true,
    message: "預約成功",
    rooms: rooms.map(roomName),
    date: dateLabel(date),
    time: `${start}–${end}`,
    title: title || "（未命名）",
    booked_by: result.user.name || user,
    participants,
    // 不回傳密碼本身，避免重複出現在對話中
    edit_password_set: editPassword !== "",
    note: [
      editPassword
        ? "已設定編輯密碼：之後要修改或取消時，在網站上輸入使用者提供的密碼"
        : "沒有設定編輯密碼：任何人都能在網站上修改或取消這筆預約，請提醒使用者",
      `網站：${site().website}`,
      ...(participants > seats ? [`與會人數 ${participants} 人超過座位數 ${seats} 人`] : []),
    ],
  };
}

// ===== JSON-RPC =====

type JsonRpcId = string | number | null;
interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: unknown;
  params?: Record<string, unknown>;
}

const rpcResult = (id: JsonRpcId, result: unknown) => ({ jsonrpc: "2.0", id, result });
const rpcError = (id: JsonRpcId, code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });

function toolResult(data: unknown, isError = false) {
  if (isError) return { content: [{ type: "text", text: String(data) }], isError: true };
  // 文字（給所有用戶端）與結構化資料（較新的用戶端）內容相同
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data };
}

async function callTool(db: D1Database, name: unknown, args: Record<string, unknown>, now: number) {
  switch (name) {
    case "list_rooms":
      return listRooms(now);
    case "list_bookings":
      return await listBookings(db, args, now);
    case "find_free_slots":
      return await findFreeSlots(db, args, now);
    case "create_booking":
      return await createBookingTool(db, args, now);
    default:
      return undefined;
  }
}

/** 處理一則 JSON-RPC 訊息；通知（沒有 id）與回應不需要回覆，回傳 null */
export async function handleMessage(db: D1Database, msg: JsonRpcRequest, now = Date.now()): Promise<object | null> {
  if (!msg || typeof msg !== "object" || Array.isArray(msg)) return rpcError(null, -32600, "Invalid Request");
  const hasId = "id" in msg && msg.id !== undefined;
  if (typeof msg.method !== "string") return hasId ? rpcError(msg.id ?? null, -32600, "Invalid Request") : null;
  if (!hasId) return null; // 通知，例如 notifications/initialized
  const id = msg.id as JsonRpcId;
  const params = msg.params && typeof msg.params === "object" ? msg.params : {};

  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const client = (params.clientInfo as { name?: unknown } | undefined)?.name;
      logEvent("info", "MCP 連線", { module: "MCP", details: { client: typeof client === "string" ? client.slice(0, 60) : "" } });
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: instructions(),
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, { tools: TOOLS });
    case "tools/call": {
      const args = params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? params.arguments as Record<string, unknown>
        : {};
      try {
        const data = await callTool(db, params.name, args, now);
        if (data === undefined) return rpcError(id, -32602, `Unknown tool: ${String(params.name)}`);
        return rpcResult(id, toolResult(data));
      } catch (error) {
        if (error instanceof ToolInputError) return rpcResult(id, toolResult(error.message, true));
        logEvent("error", "MCP 工具執行失敗", {
          module: "MCP",
          details: { tool: String(params.name), error: (error as Error).message },
        });
        return rpcResult(id, toolResult("系統發生錯誤，請稍後再試", true));
      }
    }
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

/** POST /mcp（GET、DELETE 回 405：這個伺服器不提供 SSE 串流，也不使用 session） */
export async function mcpHandler(c: Ctx) {
  if (c.req.method !== "POST") {
    return c.json(rpcError(null, -32000, "Method not allowed"), 405, { Allow: "POST" });
  }
  if (!c.env.DB) return c.json(rpcError(null, -32603, "資料庫未設定"), 503);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(rpcError(null, -32700, "Parse error"), 400);
  }

  if (Array.isArray(body)) {
    if (body.length === 0 || body.length > MAX_BATCH) return c.json(rpcError(null, -32600, "Invalid Request"), 400);
    const responses = [];
    for (const msg of body) {
      const res = await handleMessage(c.env.DB, msg as JsonRpcRequest);
      if (res) responses.push(res);
    }
    return responses.length ? c.json(responses) : c.body(null, 202);
  }

  const res = await handleMessage(c.env.DB, body as JsonRpcRequest);
  return res ? c.json(res) : c.body(null, 202);
}
