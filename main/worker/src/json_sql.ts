// 在 SQL 中產生 API 回應的 JSON（每一列一段 JSON 文字），Worker 只需要把字串接起來。
// D1 執行查詢的時間不計入 Worker 的 CPU 時間；逐列解析、轉換、序列化才是大量資料時的主要 CPU 開銷。
// 輸出與 booking_rules.ts 的 toPublicBooking、admin_rules.ts 的 toAdminBooking 經 JSON.stringify 後完全相同，
// 由 test/json_sql.test.ts 以隨機資料逐字比對驗證。
import { ORG } from "./admin_rules.ts";
import { ROOMS } from "./line_bot.ts";

const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

// 與 Date.prototype.toISOString() 相同：YYYY-MM-DDTHH:mm:ss.sssZ（時間皆為 1970 年之後）
export function isoSql(col: string): string {
  // 先轉成整數：綁定的參數可能是浮點數，整數除法與取餘數才會正確
  const ms = `CAST(${col} AS INTEGER)`;
  return `(strftime('%Y-%m-%dT%H:%M:%S', ${ms} / 1000, 'unixepoch') || '.' || substr('00' || (${ms} % 1000), -3) || 'Z')`;
}

// REAL 欄位的整數值（例如 3.0）輸出成 3，與 JavaScript 相同
const num = (expr: string) => `(CASE WHEN ${expr} = CAST(${expr} AS INTEGER) THEN CAST(${expr} AS INTEGER) ELSE ${expr} END)`;

// JavaScript 的 String.prototype.trim() 會移除的空白字元
const JS_WHITESPACE = "char(9, 10, 11, 12, 13, 32, 160, 5760, 8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, " +
  "8201, 8202, 8232, 8233, 8239, 8287, 12288, 65279)";

// ===== 公開 API（GET /api/bookings）=====

// toPublicUser：沒有姓名時以行編後 4 碼代替；舊資料 user 為字串或沒有 user 時為「未具名」
const PUBLIC_USER = `(CASE WHEN user_id IS NOT NULL THEN json_object(
    'name', COALESCE(NULLIF(user_name, ''), NULLIF(substr(user_id, -4), ''), '未具名'),
    'extension', COALESCE(user_extension, ''),
    'department', json_object('label', COALESCE(user_department_label, '')),
    'group', json_object('label', COALESCE(user_group_label, ''))
  ) ELSE json_object('name', '未具名', 'extension', '', 'department', json_object('label', ''), 'group', json_object('label', '')) END)`;

/** toPublicBooking 的 SQL 版本（不含編輯密碼、行編、代碼） */
export const PUBLIC_BOOKING_JSON = `json_object(
  'id', id,
  'title', title,
  'user', ${PUBLIC_USER},
  'room', room,
  'participantsNum', (CASE WHEN participants_num >= 0 THEN ${num("participants_num")} ELSE 0 END),
  'startTime', ${isoSql("start_time")},
  'endTime', ${isoSql("end_time")},
  'date', date,
  'updatedCount', updated_count,
  'isMulti', json(is_multi)
)`;

// ===== 管理後台預約紀錄（GET /admin/api/bookings）=====

function roomNameSql(expr: string): string {
  return `(CASE ${expr} ${ROOMS.map((r) => `WHEN ${quote(r.key)} THEN ${quote(r.name)}`).join(" ")} ELSE ${expr} END)`;
}

// displayOrg(..., "department").label：以代碼對應對照表的名稱；不在對照表時沿用資料上的名稱
const DEPARTMENT_LABEL = `(CASE
  WHEN user_id IS NULL OR (COALESCE(user_department_code, '') = '' AND COALESCE(user_department_label, '') = '') THEN ''
  ${ORG.map((d) => `WHEN user_department_code = ${quote(d.code)} THEN ${quote(d.label)}`).join("\n  ")}
  ELSE COALESCE(NULLIF(user_department_label, ''), COALESCE(user_department_code, '')) END)`;

// displayOrg(..., "group").label：組別代碼在任一部門的對照表中出現時使用對照表的名稱
const GROUP_LABEL = `(CASE
  WHEN user_id IS NULL OR (COALESCE(user_group_code, '') = '' AND COALESCE(user_group_label, '') = '') THEN ''
  ${ORG.flatMap((d) => d.groups).map((g) => `WHEN user_group_code = ${quote(g.code)} THEN ${quote(g.label)}`).join("\n  ")}
  ELSE COALESCE(NULLIF(user_group_label, ''), COALESCE(user_group_code, '')) END)`;

/** toAdminBooking 的 SQL 版本（不含編輯密碼） */
export const ADMIN_RECORD_JSON = `json_object(
  'id', id,
  'title', title,
  'room', room,
  'roomName', ${roomNameSql("room")},
  'userId', COALESCE(user_id, ''),
  'name', (CASE WHEN user_id IS NOT NULL THEN COALESCE(user_name, '')
                WHEN user_raw IS NOT NULL THEN trim(user_raw, ${JS_WHITESPACE}) ELSE '' END),
  'extension', COALESCE(user_extension, ''),
  'department', ${DEPARTMENT_LABEL},
  'group', ${GROUP_LABEL},
  'participants', COALESCE(${num("participants_num")}, 0),
  'startTime', ${isoSql("start_time")},
  'endTime', ${isoSql("end_time")},
  'createdTime', COALESCE(${isoSql("created_time")}, ''),
  'updatedTime', ${isoSql("updated_time")},
  'updatedCount', updated_count,
  'cancelled', json(CASE WHEN cancelled = 1 THEN 'true' ELSE 'false' END),
  'multi', (SELECT json_group_array(${roomNameSql("value")}) FROM json_each(is_multi))
)`;

/** 把每一列的 JSON 文字接成陣列 */
export function joinJsonRows(rows: { j: string }[]): string {
  let out = "[";
  for (let i = 0; i < rows.length; i++) out += (i ? "," : "") + rows[i].j;
  return out + "]";
}
