// 整合測試共用：透過 Worker 的 fetch 呼叫 API，直接讀寫 D1 準備資料
import { env } from "cloudflare:test";
import { exports } from "cloudflare:workers";

export const ORIGIN = "https://duicn187532.github.io";

export async function api(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await exports.default.fetch(`https://w.test${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = undefined;
  try {
    json = JSON.parse(text);
  } catch {
    // 不是 JSON
  }
  return { status: res.status, json: json as Record<string, unknown>, text, headers: res.headers };
}

export async function resetDb() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM bookings"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM admin_login_attempts"),
  ]);
}

export async function seedUser(over: Partial<Record<string, unknown>> = {}) {
  const u = {
    id: "001234",
    name: "測試員",
    extension: "51164",
    department_code: "D",
    department_label: "資訊部",
    group_code: "G",
    group_label: "開發組",
    status: null as number | null,
    disabled: 0,
    ...over,
  };
  await env.DB.prepare(
    `INSERT INTO users (id, name, extension, department_code, department_label, group_code, group_label, status, disabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(u.id, u.name, u.extension, u.department_code, u.department_label, u.group_code, u.group_label, u.status, u.disabled)
    .run();
}

export interface Row {
  id: string;
  title: string;
  room: string;
  start_time: number;
  end_time: number;
  cancelled: number | null;
  group_id: string | null;
  is_multi: string;
  updated_count: number;
  created_time: number | null;
  edit_password: string;
}

export async function rows(where = "1 = 1", ...params: unknown[]): Promise<Row[]> {
  return (await env.DB.prepare(`SELECT * FROM bookings WHERE ${where} ORDER BY rowid`).bind(...params).all<Row>()).results;
}

// 同一會議室、未取消、時間重疊的組數
export async function countOverlaps(): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM bookings a JOIN bookings b ON a.rowid < b.rowid
     WHERE a.room = b.room AND a.cancelled = 0 AND b.cancelled = 0
       AND a.start_time < b.end_time AND b.start_time < a.end_time`,
  ).first<{ n: number }>();
  return r!.n;
}

// 直接寫入一筆預約（模擬從 Atlas 匯入的舊資料）
export async function insertRow(over: Partial<Row> & { id: string; room: string; start_time: number; end_time: number }) {
  const r = {
    title: "legacy",
    cancelled: 0,
    group_id: null,
    is_multi: "[]",
    updated_count: 1,
    created_time: Date.now(),
    edit_password: "",
    ...over,
  };
  await env.DB.prepare(
    `INSERT INTO bookings (id, title, user_id, user_name, user_extension, user_department_code, user_department_label,
       user_group_code, user_group_label, room, participants_num, cancelled, start_time, end_time, edit_password,
       updated_count, date, is_multi, group_id, created_time)
     VALUES (?, ?, '001234', '測試員', '', '', '', '', '', ?, 2, ?, ?, ?, ?, ?, '2026-12-01', ?, ?, ?)`,
  ).bind(r.id, r.title, r.room, r.cancelled, r.start_time, r.end_time, r.edit_password, r.updated_count, r.is_multi,
    r.group_id, r.created_time).run();
}
