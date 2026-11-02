// 管理後台（/admin）：只有設定 ADMIN_PASSWORD 時才啟用，否則所有 /admin 路徑一律 404
import { type Context, type Middleware, Router, type RouterContext } from "oak";
import type { Filter } from "mongodb";
import { ADMIN_PASSWORD } from "./config.ts";
import { bookings, dbConfigured, ensureConnected, users } from "./db.ts";
import { logEvent } from "./logger.ts";
import { overlapFilter } from "./booking_rules.ts";
import { ROOMS } from "./line_bot.ts";
import {
  ACTIVE_USER_FILTER,
  computeStats,
  DEFAULT_ROLE,
  displayOrg,
  isUserDisabled,
  MAX_RECORDS,
  normalizeUserInput,
  ORG,
  parseStatsRange,
  toAdminBooking,
  type UserInput,
} from "./admin_rules.ts";
import {
  createSession,
  deriveKey,
  LoginLimiter,
  MIN_PASSWORD_LENGTH,
  passwordMatches,
  readCookie,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  sessionCookie,
  verifySession,
} from "./admin_auth.ts";
import type { BookingDoc, UserDoc } from "./types.ts";

type Ctx = RouterContext<string>;

export const adminEnabled = ADMIN_PASSWORD.length >= MIN_PASSWORD_LENGTH;
if (ADMIN_PASSWORD && !adminEnabled) {
  logEvent("error", `ADMIN_PASSWORD 少於 ${MIN_PASSWORD_LENGTH} 個字元，管理後台未啟用`);
}

const keyPromise = adminEnabled ? deriveKey(ADMIN_PASSWORD) : null;
const limiter = new LoginLimiter();
const PAGE_URL = new URL("./admin/index.html", import.meta.url);
let pageCache: string | null = null;

function json(ctx: Context, status: number, body: object) {
  ctx.response.status = status;
  ctx.response.type = "json";
  ctx.response.body = body;
}

function sourceOf(ctx: Context): string {
  return ctx.request.ip || "unknown";
}

async function isLoggedIn(ctx: Context): Promise<boolean> {
  if (!keyPromise) return false;
  const token = readCookie(ctx.request.headers.get("cookie"), SESSION_COOKIE);
  return await verifySession(await keyPromise, token, Date.now());
}

// 不需登入、也不需資料庫的 API
const PUBLIC_API = new Set(["/admin/api/login", "/admin/api/logout", "/admin/api/session"]);

// 所有 /admin 路徑共用：未啟用時 404、加上安全標頭、API 需登入
export const adminGuard: Middleware = async (ctx, next) => {
  const path = ctx.request.url.pathname;
  if (path !== "/admin" && !path.startsWith("/admin/")) return await next();

  if (!adminEnabled) {
    ctx.response.status = 404;
    ctx.response.body = "Not Found";
    return;
  }

  const headers = ctx.response.headers;
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");

  const isApi = path.startsWith("/admin/api/");
  if (isApi && !PUBLIC_API.has(path)) {
    if (!(await isLoggedIn(ctx))) return json(ctx, 401, { error: "請先登入" });
    // 會修改資料的請求必須帶自訂標頭：跨站表單或腳本無法在不經預檢的情況下加上
    if (ctx.request.method !== "GET" && ctx.request.headers.get("x-admin") !== "1") {
      return json(ctx, 403, { error: "請求來源不正確" });
    }
  }
  if (isApi && !PUBLIC_API.has(path)) {
    if (!dbConfigured) return json(ctx, 503, { error: "資料庫未設定" });
    try {
      await ensureConnected();
    } catch {
      return json(ctx, 503, { error: "資料庫連線失敗" });
    }
  }
  await next();
};

async function servePage(ctx: Ctx) {
  pageCache ??= await Deno.readTextFile(PAGE_URL);
  const nonce = crypto.randomUUID().replace(/-/g, "");
  ctx.response.headers.set(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; ` +
      `img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  ctx.response.type = "html";
  ctx.response.body = pageCache.replaceAll("__NONCE__", nonce);
}

async function login(ctx: Ctx) {
  const source = sourceOf(ctx);
  const now = Date.now();
  const wait = limiter.retryAfter(source, now);
  if (wait > 0) {
    ctx.response.headers.set("Retry-After", String(wait));
    return json(ctx, 429, { error: `嘗試太多次，請 ${Math.ceil(wait / 60)} 分鐘後再試` });
  }

  let password = "";
  try {
    const body = await ctx.request.body.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return json(ctx, 400, { error: "無法解析請求" });
  }

  const key = await keyPromise!;
  if (!(await passwordMatches(key, password, ADMIN_PASSWORD))) {
    limiter.fail(source, now);
    logEvent("warning", "管理後台登入失敗", { module: "Admin", details: { source } });
    // 拖慢連續嘗試
    await new Promise((r) => setTimeout(r, 600));
    return json(ctx, 401, { error: "密碼錯誤" });
  }

  limiter.succeed(source);
  const token = await createSession(key, now);
  ctx.response.headers.append("Set-Cookie", sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)));
  logEvent("info", "管理後台登入成功", { module: "Admin", details: { source } });
  json(ctx, 200, { ok: true });
}

function logout(ctx: Ctx) {
  ctx.response.headers.append("Set-Cookie", sessionCookie("", 0));
  json(ctx, 200, { ok: true });
}

async function session(ctx: Ctx) {
  json(ctx, 200, { loggedIn: await isLoggedIn(ctx) });
}

// ===== 使用者 =====

function toAdminUser(u: UserDoc) {
  return {
    id: u.id,
    name: u.name ?? "",
    extension: u.extension ?? "",
    // 以代碼對應固定的部門／組別名稱
    department: displayOrg(u.department, "department"),
    group: displayOrg(u.group, "group"),
    disabled: isUserDisabled(u),
  };
}

async function listUsers(ctx: Ctx) {
  const list = await users.find({}, { projection: { _id: 0 } }).toArray();
  list.sort((a, b) => a.id.localeCompare(b.id));
  json(ctx, 200, { data: list.map(toAdminUser), org: ORG });
}

// 同一支分機的其他啟用中使用者（分機可以重複，只提醒不阻擋）
async function extensionHolders(extension: string, exceptId: string): Promise<UserDoc[]> {
  if (!extension) return [];
  const filter = { extension, id: { $ne: exceptId }, ...ACTIVE_USER_FILTER } as Filter<UserDoc>;
  return await users.find(filter, { projection: { _id: 0, id: 1, name: 1 } }).toArray();
}

function extensionWarning(extension: string, holders: UserDoc[]): string | undefined {
  if (holders.length === 0) return undefined;
  const who = holders.map((u) => `${u.name || "未填姓名"}（${u.id.replace(/^0+(?=\d{4})/, "")}）`).join("、");
  return `分機 ${extension} 也登記給 ${who}；用分機預約時只會對應到其中一人，建議改用行編預約`;
}

async function createUser(ctx: Ctx) {
  let input: UserInput;
  try {
    input = await ctx.request.body.json();
    const user = normalizeUserInput(input, false);
    if (await users.findOne({ id: user.id! })) return json(ctx, 409, { error: `行編 ${user.id} 已存在` });
    const doc: UserDoc = {
      id: user.id!,
      // 沒填姓名時與既有資料一樣存 null
      name: user.name || null,
      extension: user.extension!,
      department: user.department!,
      group: user.group!,
      // 與既有使用者資料相同的欄位
      email: null,
      lineId: null,
      role: DEFAULT_ROLE,
      status: !(user.disabled ?? false),
      createdTime: new Date(),
    };
    await users.insertOne(doc);
    logEvent("info", "管理後台新增使用者", { module: "Admin", details: { id: doc.id } });
    const holders = doc.status ? await extensionHolders(doc.extension ?? "", doc.id) : [];
    json(ctx, 201, { data: toAdminUser(doc), warning: extensionWarning(doc.extension ?? "", holders) });
  } catch (error) {
    json(ctx, 400, { error: (error as Error).message });
  }
}

async function updateUser(ctx: Ctx) {
  const id = ctx.params.id ?? "";
  try {
    const existing = await users.findOne({ id });
    if (!existing) return json(ctx, 404, { error: "找不到這位使用者" });
    const update = normalizeUserInput(await ctx.request.body.json(), true, existing);
    const willBeActive = update.disabled === undefined ? !isUserDisabled(existing) : !update.disabled;
    const extension = update.extension ?? existing.extension ?? "";
    // 停用狀態寫入既有的 status 欄位，並移除早期版本寫入的 disabled
    const { disabled, ...fields } = update;
    const set: Partial<UserDoc> = { ...fields, updatedTime: new Date() };
    if (fields.name !== undefined) set.name = fields.name || null;
    if (disabled !== undefined) set.status = !disabled;
    await users.updateOne(
      { id },
      disabled !== undefined ? { $set: set, $unset: { disabled: "" } } : { $set: set },
    );
    logEvent("info", "管理後台修改使用者", { module: "Admin", details: { id, fields: Object.keys(update) } });
    const { disabled: _old, ...rest } = existing;
    // 有改分機或重新啟用時才提醒
    const touched = update.extension !== undefined || update.disabled === false;
    const holders = willBeActive && touched ? await extensionHolders(extension, id) : [];
    json(ctx, 200, { data: toAdminUser({ ...rest, ...set }), warning: extensionWarning(extension, holders) });
  } catch (error) {
    json(ctx, 400, { error: (error as Error).message });
  }
}

// ===== 預約紀錄 =====

// GET /admin/api/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD：依「預約送出時間」篩選，含已取消
async function listBookings(ctx: Ctx) {
  const params = ctx.request.url.searchParams;
  let range: { from: Date; to: Date };
  try {
    range = parseStatsRange(params.get("from"), params.get("to"));
  } catch (error) {
    return json(ctx, 400, { error: (error as Error).message });
  }
  const docs = await bookings
    .find({ createdTime: { $gte: range.from, $lt: range.to } } as Filter<BookingDoc>, {
      projection: { _id: 0, editPassword: 0 },
    })
    .sort({ createdTime: -1 })
    .limit(MAX_RECORDS + 1)
    .toArray();
  const rooms = ROOMS.map((r) => ({ key: r.key, name: r.name }));
  json(ctx, 200, {
    data: docs.slice(0, MAX_RECORDS).map((d) => toAdminBooking(d, rooms)),
    truncated: docs.length > MAX_RECORDS,
    rooms,
  });
}

// ===== 統計 =====

async function stats(ctx: Ctx) {
  const params = ctx.request.url.searchParams;
  let range: { from: Date; to: Date };
  try {
    range = parseStatsRange(params.get("from"), params.get("to"));
  } catch (error) {
    return json(ctx, 400, { error: (error as Error).message });
  }
  const docs = await bookings
    .find(overlapFilter(range.from, range.to) as Filter<BookingDoc>, {
      projection: { _id: 0, editPassword: 0, title: 0 },
    })
    .toArray();
  json(ctx, 200, computeStats(docs, range, ROOMS.map((r) => ({ key: r.key, name: r.name }))));
}

export const adminRouter = new Router();
adminRouter
  .get("/admin", servePage)
  .get("/admin/", servePage)
  .get("/admin/api/session", session)
  .post("/admin/api/login", login)
  .post("/admin/api/logout", logout)
  .get("/admin/api/users", listUsers)
  .post("/admin/api/users", createUser)
  .patch("/admin/api/users/:id", updateUser)
  .get("/admin/api/bookings", listBookings)
  .get("/admin/api/stats", stats);
