// 更新日誌與公告：管理後台新增／修改／刪除，前端開啟網站時以 GET /api/notices 讀取目前在公告期間內的項目
// 資料表見 migrations/0003_notices.sql
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";

type Ctx = Context<{ Bindings: Env }>;

// 更新日誌的公告期間：改版日當天起 7 天（與原本前端 config/changelog.ts 的 ANNOUNCE_DAYS 相同）
export const CHANGELOG_ANNOUNCE_DAYS = 7;
// 新增公告時預設的公告期間（天，含開始日）；管理後台可改結束日
export const DEFAULT_ANNOUNCEMENT_DAYS = 7;

export const LIMITS = {
  version: 20,
  sectionTitle: 20,
  sections: 10,
  items: 30,
  itemText: 600,
  announcementTitle: 40,
  announcementBody: 1000,
};

export interface ChangelogItem {
  text: string;
  experimental?: boolean;
}
export interface ChangelogSection {
  title: string;
  items: ChangelogItem[];
}
export interface ChangelogEntry {
  version: string;
  date: string; // YYYY-MM-DD
  sections: ChangelogSection[];
}
export interface Announcement {
  id: string;
  title: string;
  body: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（含當天）
}

interface ChangelogRow {
  version: string;
  date: string;
  sections: string;
  created_time: number;
  updated_time: number;
}
interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  start_date: string;
  end_date: string;
  created_time: number;
  updated_time: number;
}

const TAIPEI_OFFSET = 8 * 3600_000;
const DAY = 86_400_000;

/** 台北時間的日期 YYYY-MM-DD；dayOffset 可為負數 */
export function taipeiDate(now: number, dayOffset = 0): string {
  return new Date(now + TAIPEI_OFFSET + dayOffset * DAY).toISOString().slice(0, 10);
}

// ===== 輸入檢查 =====

class InputError extends Error {}

/** 接受 YYYY-MM-DD 或 YYYY/MM/DD，回傳 YYYY-MM-DD；不是實際存在的日期時丟出錯誤 */
export function parseDate(value: unknown, label: string): string {
  const s = typeof value === "string" ? value.trim().replaceAll("/", "-") : "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (d.toISOString().slice(0, 10) === s) return s;
  }
  throw new InputError(`${label}格式不正確`);
}

function text(value: unknown, label: string, max: number, multiline = false): string {
  if (typeof value !== "string") throw new InputError(`請填寫${label}`);
  // 統一換行字元；單行欄位把換行換成空白
  let s = value.replace(/\r\n?/g, "\n").trim();
  if (!multiline) s = s.replace(/\s*\n\s*/g, " ");
  if (!s) throw new InputError(`請填寫${label}`);
  if ([...s].length > max) throw new InputError(`${label}不能超過 ${max} 個字`);
  return s;
}

export function parseVersion(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new InputError("請填寫版號");
  if (s.length > LIMITS.version || !/^[A-Za-z0-9._-]+$/.test(s)) {
    throw new InputError("版號只能使用英數字、點、底線與連字號，例如 v2.4.0");
  }
  return s;
}

export function parseSections(value: unknown): ChangelogSection[] {
  if (!Array.isArray(value) || value.length === 0) throw new InputError("至少要有一個分類");
  if (value.length > LIMITS.sections) throw new InputError(`分類不能超過 ${LIMITS.sections} 個`);
  return value.map((section, i) => {
    const s = (section ?? {}) as { title?: unknown; items?: unknown };
    const title = text(s.title, `第 ${i + 1} 個分類的名稱`, LIMITS.sectionTitle);
    if (!Array.isArray(s.items) || s.items.length === 0) throw new InputError(`「${title}」至少要有一個項目`);
    if (s.items.length > LIMITS.items) throw new InputError(`「${title}」的項目不能超過 ${LIMITS.items} 個`);
    const items = s.items.map((item, j) => {
      const it = (item ?? {}) as { text?: unknown; experimental?: unknown };
      const out: ChangelogItem = { text: text(it.text, `「${title}」第 ${j + 1} 個項目`, LIMITS.itemText, true) };
      if (it.experimental === true) out.experimental = true;
      return out;
    });
    return { title, items };
  });
}

export function parseAnnouncementInput(body: unknown): Omit<Announcement, "id"> {
  const b = (body ?? {}) as Record<string, unknown>;
  const startDate = parseDate(b.startDate, "開始日期");
  const endDate = parseDate(b.endDate, "結束日期");
  if (endDate < startDate) throw new InputError("結束日期不能早於開始日期");
  return {
    title: text(b.title, "標題", LIMITS.announcementTitle),
    body: text(b.body, "內容", LIMITS.announcementBody, true),
    startDate,
    endDate,
  };
}

// ===== 資料轉換與排序 =====

function rowToChangelog(row: ChangelogRow): ChangelogEntry {
  return { version: row.version, date: row.date, sections: JSON.parse(row.sections) };
}

function rowToAnnouncement(row: AnnouncementRow): Announcement {
  return { id: row.id, title: row.title, body: row.body, startDate: row.start_date, endDate: row.end_date };
}

// 版號中的數字依數值比較（v2.10.0 比 v2.9.0 新）
const versionCollator = new Intl.Collator("en", { numeric: true });

/** 新的在前：改版日新→舊，同一天依版號大→小（前端以第一筆記錄「看過的最新一筆」） */
export function sortChangelog<T extends { version: string; date: string }>(list: T[]): T[] {
  return list.sort((a, b) => b.date.localeCompare(a.date) || versionCollator.compare(b.version, a.version));
}

// ===== 公開 API =====

/**
 * GET /api/notices：目前在公告期間內的更新日誌與公告（台北時間）
 * - 更新日誌：改版日在今天以前 7 天內（含今天）
 * - 公告：開始日 ≤ 今天 ≤ 結束日
 */
export async function getNotices(c: Ctx) {
  const now = Date.now();
  const today = taipeiDate(now);
  const [changelog, announcements] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT * FROM changelog WHERE date <= ? AND date > ?")
      .bind(today, taipeiDate(now, -CHANGELOG_ANNOUNCE_DAYS)),
    c.env.DB.prepare(
      "SELECT * FROM announcements WHERE start_date <= ?1 AND end_date >= ?1 ORDER BY start_date DESC, created_time DESC",
    ).bind(today),
  ]);
  return c.json({
    changelog: sortChangelog((changelog.results as unknown as ChangelogRow[]).map(rowToChangelog)),
    announcements: (announcements.results as unknown as AnnouncementRow[]).map(rowToAnnouncement),
  });
}

// ===== 管理後台 API =====

async function readJson(c: Ctx): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new InputError("無法解析請求");
  }
}

// InputError 回 400，其他錯誤交給全域的錯誤處理（500）
async function handle(c: Ctx, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof InputError) return c.json({ error: error.message }, 400);
    throw error;
  }
}

export async function adminListChangelog(c: Ctx) {
  const { results } = await c.env.DB.prepare("SELECT * FROM changelog").all<ChangelogRow>();
  return c.json({
    data: sortChangelog(results.map((r) => ({ ...rowToChangelog(r), updatedTime: r.updated_time }))),
    announceDays: CHANGELOG_ANNOUNCE_DAYS,
  });
}

export function adminCreateChangelog(c: Ctx) {
  return handle(c, async () => {
    const body = (await readJson(c)) as Record<string, unknown>;
    const entry: ChangelogEntry = {
      version: parseVersion(body?.version),
      date: parseDate(body?.date, "改版日"),
      sections: parseSections(body?.sections),
    };
    const now = Date.now();
    // 版號已存在時不寫入（檢查與寫入在同一句 SQL）
    const result = await c.env.DB.prepare(
      `INSERT INTO changelog (version, date, sections, created_time, updated_time) VALUES (?1, ?2, ?3, ?4, ?4)
       ON CONFLICT (version) DO NOTHING`,
    ).bind(entry.version, entry.date, JSON.stringify(entry.sections), now).run();
    if (result.meta.changes === 0) return c.json({ error: `版號 ${entry.version} 已存在` }, 409);
    logEvent("info", "管理後台新增更新日誌", { module: "Admin", details: { version: entry.version } });
    return c.json({ data: { ...entry, updatedTime: now } }, 201);
  });
}

export function adminUpdateChangelog(c: Ctx) {
  return handle(c, async () => {
    const version = c.req.param("version") ?? "";
    const body = (await readJson(c)) as Record<string, unknown>;
    const date = parseDate(body?.date, "改版日");
    const sections = parseSections(body?.sections);
    const now = Date.now();
    const result = await c.env.DB.prepare("UPDATE changelog SET date = ?, sections = ?, updated_time = ? WHERE version = ?")
      .bind(date, JSON.stringify(sections), now, version).run();
    if (result.meta.changes === 0) return c.json({ error: "找不到這筆更新日誌" }, 404);
    logEvent("info", "管理後台修改更新日誌", { module: "Admin", details: { version } });
    return c.json({ data: { version, date, sections, updatedTime: now } });
  });
}

export async function adminDeleteChangelog(c: Ctx) {
  const version = c.req.param("version") ?? "";
  const result = await c.env.DB.prepare("DELETE FROM changelog WHERE version = ?").bind(version).run();
  if (result.meta.changes === 0) return c.json({ error: "找不到這筆更新日誌" }, 404);
  logEvent("info", "管理後台刪除更新日誌", { module: "Admin", details: { version } });
  return c.json({ ok: true });
}

export async function adminListAnnouncements(c: Ctx) {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM announcements ORDER BY start_date DESC, created_time DESC",
  ).all<AnnouncementRow>();
  return c.json({
    data: results.map((r) => ({ ...rowToAnnouncement(r), updatedTime: r.updated_time })),
    defaultDays: DEFAULT_ANNOUNCEMENT_DAYS,
    today: taipeiDate(Date.now()),
  });
}

export function adminCreateAnnouncement(c: Ctx) {
  return handle(c, async () => {
    const input = parseAnnouncementInput(await readJson(c));
    const id = crypto.randomUUID();
    const now = Date.now();
    await c.env.DB.prepare(
      `INSERT INTO announcements (id, title, body, start_date, end_date, created_time, updated_time)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)`,
    ).bind(id, input.title, input.body, input.startDate, input.endDate, now).run();
    logEvent("info", "管理後台新增公告", { module: "Admin", details: { id } });
    return c.json({ data: { id, ...input, updatedTime: now } }, 201);
  });
}

export function adminUpdateAnnouncement(c: Ctx) {
  return handle(c, async () => {
    const id = c.req.param("id") ?? "";
    const input = parseAnnouncementInput(await readJson(c));
    const now = Date.now();
    const result = await c.env.DB.prepare(
      "UPDATE announcements SET title = ?, body = ?, start_date = ?, end_date = ?, updated_time = ? WHERE id = ?",
    ).bind(input.title, input.body, input.startDate, input.endDate, now, id).run();
    if (result.meta.changes === 0) return c.json({ error: "找不到這則公告" }, 404);
    logEvent("info", "管理後台修改公告", { module: "Admin", details: { id } });
    return c.json({ data: { id, ...input, updatedTime: now } });
  });
}

export async function adminDeleteAnnouncement(c: Ctx) {
  const id = c.req.param("id") ?? "";
  const result = await c.env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(id).run();
  if (result.meta.changes === 0) return c.json({ error: "找不到這則公告" }, 404);
  logEvent("info", "管理後台刪除公告", { module: "Admin", details: { id } });
  return c.json({ ok: true });
}
