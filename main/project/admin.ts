// 管理後台（/admin）：只有設定 ADMIN_PASSWORD 時才啟用，否則所有 /admin 路徑一律 404
import { type Context, type Middleware, Router, type RouterContext } from "oak";
import type { Filter } from "mongodb";
import { ADMIN_PASSWORD } from "./config.ts";
import { bookings, dbConfigured, ensureConnected, users } from "./db.ts";
import { logEvent } from "./logger.ts";
import { overlapFilter } from "./booking_rules.ts";
import { ROOMS } from "./line_bot.ts";
import { collectLabels, computeStats, normalizeUserInput, parseStatsRange, type UserInput } from "./admin_rules.ts";
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
    department: u.department?.label ?? "",
    group: u.group?.label ?? "",
    disabled: u.disabled === true,
  };
}

async function listUsers(ctx: Ctx) {
  const list = await users.find({}, { projection: { _id: 0 } }).toArray();
  list.sort((a, b) =>
    (a.department?.label ?? "").localeCompare(b.department?.label ?? "", "zh-Hant") ||
    (a.name ?? "").localeCompare(b.name ?? "", "zh-Hant") || a.id.localeCompare(b.id)
  );
  json(ctx, 200, {
    data: list.map(toAdminUser),
    departments: collectLabels(list, "department").map((d) => d.label),
    groups: collectLabels(list, "group").map((g) => g.label),
  });
}

async function knownLabels() {
  const list = await users.find({}, { projection: { _id: 0, department: 1, group: 1, id: 1 } }).toArray();
  return { departments: collectLabels(list, "department"), groups: collectLabels(list, "group") };
}

async function extensionTaken(extension: string, exceptId: string | null): Promise<boolean> {
  if (!extension) return false;
  const filter: Filter<UserDoc> = { extension, disabled: { $ne: true } };
  if (exceptId) filter.id = { $ne: exceptId };
  return (await users.findOne(filter)) !== null;
}

async function createUser(ctx: Ctx) {
  let input: UserInput;
  try {
    input = await ctx.request.body.json();
    const user = normalizeUserInput(input, await knownLabels(), false);
    if (await users.findOne({ id: user.id! })) return json(ctx, 409, { error: `行編 ${user.id} 已存在` });
    if (await extensionTaken(user.extension!, null)) {
      return json(ctx, 409, { error: `分機 ${user.extension} 已有其他人使用` });
    }
    const doc: UserDoc = {
      id: user.id!,
      name: user.name!,
      extension: user.extension!,
      department: user.department!,
      group: user.group!,
      disabled: user.disabled ?? false,
      createdTime: new Date(),
    };
    await users.insertOne(doc);
    logEvent("info", "管理後台新增使用者", { module: "Admin", details: { id: doc.id } });
    json(ctx, 201, { data: toAdminUser(doc) });
  } catch (error) {
    json(ctx, 400, { error: (error as Error).message });
  }
}

async function updateUser(ctx: Ctx) {
  const id = ctx.params.id ?? "";
  try {
    const existing = await users.findOne({ id });
    if (!existing) return json(ctx, 404, { error: "找不到這位使用者" });
    const update = normalizeUserInput(await ctx.request.body.json(), await knownLabels(), true);
    const willBeActive = update.disabled === undefined ? existing.disabled !== true : !update.disabled;
    const extension = update.extension ?? existing.extension ?? "";
    if (willBeActive && await extensionTaken(extension, id)) {
      return json(ctx, 409, { error: `分機 ${extension} 已有其他人使用` });
    }
    await users.updateOne({ id }, { $set: { ...update, updatedTime: new Date() } });
    logEvent("info", "管理後台修改使用者", { module: "Admin", details: { id, fields: Object.keys(update) } });
    json(ctx, 200, { data: toAdminUser({ ...existing, ...update }) });
  } catch (error) {
    json(ctx, 400, { error: (error as Error).message });
  }
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
  .get("/admin/api/stats", stats);
