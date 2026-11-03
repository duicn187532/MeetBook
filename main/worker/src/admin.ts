// 管理後台（/admin）：只有設定 ADMIN_PASSWORD（至少 8 個字元）時才啟用，否則所有 /admin 路徑一律 404
// 行為、回應格式與 Deno 版 admin.ts 相同；登入失敗次數改存 D1
import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";
import { ROOMS } from "./line_bot.ts";
import {
  ACTIVE_USER_SQL,
  DEFAULT_ROLE,
  displayOrg,
  isUserDisabled,
  MAX_RECORDS,
  normalizeUserInput,
  ORG,
  parseStatsRange,
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
import { rowToUser, type UserRow } from "./db.ts";
import { statsFromDb } from "./stats.ts";
import { ADMIN_RECORD_JSON, joinJsonRows } from "./json_sql.ts";
import {
  adminCreateAnnouncement,
  adminCreateChangelog,
  adminDeleteAnnouncement,
  adminDeleteChangelog,
  adminListAnnouncements,
  adminListChangelog,
  adminUpdateAnnouncement,
  adminUpdateChangelog,
} from "./notices.ts";
import type { UserDoc } from "./types.ts";
// 管理後台頁面：與 Deno 版共用同一個檔案（wrangler 以文字匯入）
import ADMIN_PAGE from "../../project/admin/index.html";

type AppEnv = { Bindings: Env };
type Ctx = Context<AppEnv>;

export function adminEnabled(env: Env): boolean {
  return (env.ADMIN_PASSWORD ?? "").length >= MIN_PASSWORD_LENGTH;
}

// 金鑰由管理密碼衍生；每個 isolate 只計算一次，換密碼時自動重算
let keyCache: { password: string; key: Promise<CryptoKey> } | null = null;
function adminKey(env: Env): Promise<CryptoKey> {
  const password = env.ADMIN_PASSWORD ?? "";
  if (keyCache?.password !== password) keyCache = { password, key: deriveKey(password) };
  return keyCache.key;
}

let warnedShortPassword = false;

function json(c: Ctx, status: number, body: object) {
  return c.json(body, status as 200);
}

function sourceOf(c: Ctx): string {
  return c.req.header("cf-connecting-ip") || "unknown";
}

async function isLoggedIn(c: Ctx): Promise<boolean> {
  if (!adminEnabled(c.env)) return false;
  const token = readCookie(c.req.header("cookie") ?? null, SESSION_COOKIE);
  return await verifySession(await adminKey(c.env), token, Date.now());
}

// 不需登入、也不需資料庫的 API
const PUBLIC_API = new Set(["/admin/api/login", "/admin/api/logout", "/admin/api/session"]);

// 所有 /admin 路徑共用：未啟用時 404、加上安全標頭、API 需登入
export const adminGuard: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!adminEnabled(c.env)) {
    if (c.env.ADMIN_PASSWORD && !warnedShortPassword) {
      warnedShortPassword = true;
      logEvent("error", `ADMIN_PASSWORD 少於 ${MIN_PASSWORD_LENGTH} 個字元，管理後台未啟用`);
    }
    return c.text("Not Found", 404);
  }

  const path = c.req.path;
  const isApi = path.startsWith("/admin/api/");
  if (isApi && !PUBLIC_API.has(path)) {
    if (!(await isLoggedIn(c))) return withSecurityHeaders(json(c, 401, { error: "請先登入" }));
    // 會修改資料的請求必須帶自訂標頭：跨站表單或腳本無法在不經預檢的情況下加上
    if (c.req.method !== "GET" && c.req.header("x-admin") !== "1") {
      return withSecurityHeaders(json(c, 403, { error: "請求來源不正確" }));
    }
    if (!c.env.DB) return withSecurityHeaders(json(c, 503, { error: "資料庫未設定" }));
  }
  await next();
  withSecurityHeaders(c.res);
};

function withSecurityHeaders(res: Response): Response {
  const headers = res.headers;
  headers.set("Cache-Control", "no-store");
  headers.set("X-Robots-Tag", "noindex, nofollow");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  return res;
}

function servePage(c: Ctx) {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  c.header(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; ` +
      `img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  );
  return c.html(ADMIN_PAGE.replaceAll("__NONCE__", nonce));
}

async function login(c: Ctx) {
  const source = sourceOf(c);
  const now = Date.now();
  const limiter = new LoginLimiter(c.env.DB);
  const wait = await limiter.retryAfter(source, now);
  if (wait > 0) {
    c.header("Retry-After", String(wait));
    return json(c, 429, { error: `嘗試太多次，請 ${Math.ceil(wait / 60)} 分鐘後再試` });
  }

  let password = "";
  try {
    const body = await c.req.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return json(c, 400, { error: "無法解析請求" });
  }

  const key = await adminKey(c.env);
  if (!(await passwordMatches(key, password, c.env.ADMIN_PASSWORD ?? ""))) {
    await limiter.fail(source, now);
    logEvent("warning", "管理後台登入失敗", { module: "Admin", details: { source } });
    // 拖慢連續嘗試（等待時間不計入 CPU 時間）
    await new Promise((r) => setTimeout(r, 600));
    return json(c, 401, { error: "密碼錯誤" });
  }

  await limiter.succeed(source);
  const token = await createSession(key, now);
  c.header("Set-Cookie", sessionCookie(token, Math.floor(SESSION_TTL_MS / 1000)), { append: true });
  logEvent("info", "管理後台登入成功", { module: "Admin", details: { source } });
  return json(c, 200, { ok: true });
}

function logout(c: Ctx) {
  c.header("Set-Cookie", sessionCookie("", 0), { append: true });
  return json(c, 200, { ok: true });
}

async function session(c: Ctx) {
  return json(c, 200, { loggedIn: await isLoggedIn(c) });
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

async function listUsers(c: Ctx) {
  const { results } = await c.env.DB.prepare("SELECT * FROM users ORDER BY seq").all<UserRow>();
  const list = results.map(rowToUser);
  list.sort((a, b) => a.id.localeCompare(b.id));
  return json(c, 200, { data: list.map(toAdminUser), org: ORG });
}

// 同一支分機的其他啟用中使用者（分機可以重複，只提醒不阻擋）
async function extensionHolders(db: D1Database, extension: string, exceptId: string): Promise<UserDoc[]> {
  if (!extension) return [];
  const { results } = await db
    .prepare(`SELECT * FROM users WHERE extension = ? AND id != ? AND ${ACTIVE_USER_SQL} ORDER BY seq`)
    .bind(extension, exceptId)
    .all<UserRow>();
  return results.map(rowToUser);
}

function extensionWarning(extension: string, holders: UserDoc[]): string | undefined {
  if (holders.length === 0) return undefined;
  const who = holders.map((u) => `${u.name || "未填姓名"}（${u.id.replace(/^0+(?=\d{4})/, "")}）`).join("、");
  return `分機 ${extension} 也登記給 ${who}；用分機預約時只會對應到其中一人，建議改用行編預約`;
}

async function findUser(db: D1Database, id: string): Promise<UserDoc | undefined> {
  const row = await db.prepare("SELECT * FROM users WHERE id = ? ORDER BY seq LIMIT 1").bind(id).first<UserRow>();
  return row ? rowToUser(row) : undefined;
}

async function createUser(c: Ctx) {
  try {
    const input: UserInput = await c.req.json();
    const user = normalizeUserInput(input, false);
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
    // 行編已存在時不寫入（檢查與寫入在同一句 SQL，兩個請求同時新增也不會重複）
    const result = await c.env.DB
      .prepare(
        `INSERT INTO users (id, name, extension, department_code, department_label, group_code, group_label,
           email, line_id, role_code, role_label, status, disabled, created_time)
         SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, NULL, ?8, ?9, ?10, 0, ?11
         WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = ?1)`,
      )
      .bind(
        doc.id,
        doc.name,
        doc.extension,
        doc.department!.code,
        doc.department!.label,
        doc.group!.code,
        doc.group!.label,
        DEFAULT_ROLE.code,
        DEFAULT_ROLE.label,
        doc.status ? 1 : 0,
        doc.createdTime!.getTime(),
      )
      .run();
    if (result.meta.changes === 0) return json(c, 409, { error: `行編 ${user.id} 已存在` });
    logEvent("info", "管理後台新增使用者", { module: "Admin", details: { id: doc.id } });
    const holders = doc.status ? await extensionHolders(c.env.DB, doc.extension ?? "", doc.id) : [];
    return json(c, 201, { data: toAdminUser(doc), warning: extensionWarning(doc.extension ?? "", holders) });
  } catch (error) {
    return json(c, 400, { error: (error as Error).message });
  }
}

async function updateUser(c: Ctx) {
  const id = c.req.param("id") ?? "";
  try {
    const existing = await findUser(c.env.DB, id);
    if (!existing) return json(c, 404, { error: "找不到這位使用者" });
    const update = normalizeUserInput(await c.req.json(), true, existing);
    const willBeActive = update.disabled === undefined ? !isUserDisabled(existing) : !update.disabled;
    const extension = update.extension ?? existing.extension ?? "";
    // 停用狀態寫入既有的 status 欄位，並清除早期版本寫入的 disabled
    const { disabled, ...fields } = update;
    const set: Partial<UserDoc> = { ...fields, updatedTime: new Date() };
    if (fields.name !== undefined) set.name = fields.name || null;
    if (disabled !== undefined) set.status = !disabled;

    const columns: string[] = ["updated_time = ?"];
    const values: unknown[] = [set.updatedTime!.getTime()];
    if (set.name !== undefined) {
      columns.push("name = ?");
      values.push(set.name);
    }
    if (set.extension !== undefined) {
      columns.push("extension = ?");
      values.push(set.extension);
    }
    if (set.department !== undefined) {
      columns.push("department_code = ?", "department_label = ?");
      values.push(set.department.code, set.department.label);
    }
    if (set.group !== undefined) {
      columns.push("group_code = ?", "group_label = ?");
      values.push(set.group.code, set.group.label);
    }
    if (disabled !== undefined) {
      columns.push("status = ?", "disabled = 0");
      values.push(disabled ? 0 : 1);
    }
    // MongoDB 的 updateOne 只改第一筆；行編重複時同樣只改最早的那一筆
    await c.env.DB.prepare(`UPDATE users SET ${columns.join(", ")} WHERE seq = ?`).bind(...values, existing.seq).run();

    logEvent("info", "管理後台修改使用者", { module: "Admin", details: { id, fields: Object.keys(update) } });
    const { disabled: _old, ...rest } = existing;
    // 有改分機或重新啟用時才提醒
    const touched = update.extension !== undefined || update.disabled === false;
    const holders = willBeActive && touched ? await extensionHolders(c.env.DB, extension, id) : [];
    return json(c, 200, { data: toAdminUser({ ...rest, ...set }), warning: extensionWarning(extension, holders) });
  } catch (error) {
    return json(c, 400, { error: (error as Error).message });
  }
}

// ===== 預約紀錄 =====

// GET /admin/api/bookings?from=YYYY-MM-DD&to=YYYY-MM-DD[&by=meeting]，含已取消
// 預設依「預約送出時間」篩選；by=meeting 時改依「會議時間」與區間重疊者（沒有送出時間的舊資料也查得到）
async function listBookings(c: Ctx) {
  let range: { from: Date; to: Date };
  try {
    range = parseStatsRange(c.req.query("from") ?? null, c.req.query("to") ?? null);
  } catch (error) {
    return json(c, 400, { error: (error as Error).message });
  }
  const byMeeting = c.req.query("by") === "meeting";
  // 每一列的 JSON 由 SQL 產生（見 json_sql.ts），Worker 只把字串接起來
  const sql = byMeeting
    ? `SELECT ${ADMIN_RECORD_JSON} AS j FROM bookings WHERE start_time < ? AND end_time > ? ORDER BY start_time, rowid LIMIT ?`
    : `SELECT ${ADMIN_RECORD_JSON} AS j FROM bookings WHERE created_time >= ? AND created_time < ?` +
      " ORDER BY created_time DESC, rowid LIMIT ?";
  const params = byMeeting
    ? [range.to.getTime(), range.from.getTime(), MAX_RECORDS + 1]
    : [range.from.getTime(), range.to.getTime(), MAX_RECORDS + 1];
  const { results } = await c.env.DB.prepare(sql).bind(...params).all<{ j: string }>();
  const rooms = ROOMS.map((r) => ({ key: r.key, name: r.name }));
  const body = `{"data":${joinJsonRows(results.slice(0, MAX_RECORDS))},"truncated":${results.length > MAX_RECORDS},` +
    `"rooms":${JSON.stringify(rooms)}}`;
  return c.body(body, 200, { "Content-Type": "application/json" });
}

// ===== 統計 =====

// 彙總在 SQL 中完成（見 stats.ts），結果與 Deno 版的 computeStats 相同
async function stats(c: Ctx) {
  let range: { from: Date; to: Date };
  try {
    range = parseStatsRange(c.req.query("from") ?? null, c.req.query("to") ?? null);
  } catch (error) {
    return json(c, 400, { error: (error as Error).message });
  }
  return json(c, 200, await statsFromDb(c.env.DB, range, ROOMS.map((r) => ({ key: r.key, name: r.name }))));
}

export const adminRouter = new Hono<AppEnv>({ strict: false });
adminRouter
  .get("/admin", servePage)
  .get("/admin/api/session", session)
  .post("/admin/api/login", login)
  .post("/admin/api/logout", logout)
  .get("/admin/api/users", listUsers)
  .post("/admin/api/users", createUser)
  .patch("/admin/api/users/:id", updateUser)
  .get("/admin/api/bookings", listBookings)
  .get("/admin/api/stats", stats)
  // 更新日誌與公告（見 notices.ts）
  .get("/admin/api/changelog", adminListChangelog)
  .post("/admin/api/changelog", adminCreateChangelog)
  .put("/admin/api/changelog/:version", adminUpdateChangelog)
  .delete("/admin/api/changelog/:version", adminDeleteChangelog)
  .get("/admin/api/announcements", adminListAnnouncements)
  .post("/admin/api/announcements", adminCreateAnnouncement)
  .put("/admin/api/announcements/:id", adminUpdateAnnouncement)
  .delete("/admin/api/announcements/:id", adminDeleteAnnouncement);
