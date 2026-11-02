// 管理後台統計：彙總在 SQL 中完成（D1 執行查詢的時間不計入 Worker 的 CPU 時間），
// Worker 只讀回數十列的彙總結果，以及熱力圖需要的每筆「會議室、開始、結束」三個數字。
// 結果與 admin_rules.ts 的 computeStats（Deno 版逐筆計算）完全相同，由 test/stats.test.ts 以隨機資料比對驗證。
import {
  addWindowMinutes,
  displayOrg,
  finishStats,
  newStatsState,
  roomEntry,
  type StatsResult,
  userKey,
} from "./admin_rules.ts";

const MINUTE = 60_000;

// 與區間重疊的預約；s／e 為裁切到區間內的起訖時間。
// 與 computeStats 相同：裁切後沒有長度的不計；cancelled = 1 算已取消，其餘（0 或舊資料的 NULL）算有效
const BASE = `
WITH b AS (
  SELECT rowid AS rid, room, cancelled, start_time, end_time, participants_num,
         user_id, user_name, user_department_code, user_department_label, user_raw,
         MAX(start_time, ?1) AS s, MIN(end_time, ?2) AS e
  FROM bookings WHERE start_time < ?2 AND end_time > ?1
),
a AS (SELECT * FROM b WHERE e > s AND cancelled IS NOT 1)`;

const SQL = {
  totals: `${BASE}
    SELECT (SELECT COUNT(*) FROM b WHERE e > s AND cancelled = 1) AS cancelled,
           COUNT(*) AS bookings,
           COALESCE(SUM(e - s), 0) AS clipped_ms,
           COALESCE(SUM(end_time - start_time), 0) AS duration_ms,
           COALESCE(SUM(CASE WHEN participants_num > 0 THEN participants_num END), 0) AS p_sum,
           COUNT(CASE WHEN participants_num > 0 THEN 1 END) AS p_n
    FROM a`,
  // ORDER BY first：與逐筆計算時第一次出現的順序相同（影響同分時的排序）
  rooms: `${BASE}
    SELECT room, COUNT(*) AS n, SUM(e - s) AS ms, MIN(rid) AS first FROM a GROUP BY room ORDER BY first`,
  departments: `${BASE}
    SELECT user_id IS NOT NULL AS has_user, user_department_code AS code, user_department_label AS label,
           COUNT(*) AS n, SUM(e - s) AS ms, MIN(rid) AS first
    FROM a GROUP BY has_user, code, label ORDER BY first`,
  // 預約者：SQLite 在只有一個 MIN() 時，其他欄位取自 MIN 那一列，也就是第一次出現時的姓名
  bookers: `${BASE}
    SELECT MIN(rid) AS first, user_id, user_name, user_raw, COUNT(*) AS n, SUM(e - s) AS ms
    FROM a GROUP BY user_id IS NULL, user_id, CASE WHEN user_id = '' THEN user_name END, user_raw ORDER BY first`,
  segments: `${BASE}
    SELECT room, s, e FROM a ORDER BY rid`,
};

interface Totals {
  cancelled: number;
  bookings: number;
  clipped_ms: number;
  duration_ms: number;
  p_sum: number;
  p_n: number;
}
interface Group {
  n: number;
  ms: number;
}

export async function statsFromDb(
  db: D1Database,
  range: { from: Date; to: Date },
  rooms: { key: string; name: string }[],
): Promise<StatsResult> {
  const from = range.from.getTime();
  const to = range.to.getTime();
  const [totals, roomRows, deptRows, bookerRows, segments] = await db.batch([
    db.prepare(SQL.totals).bind(from, to),
    db.prepare(SQL.rooms).bind(from, to),
    db.prepare(SQL.departments).bind(from, to),
    db.prepare(SQL.bookers).bind(from, to),
    db.prepare(SQL.segments).bind(from, to),
  ]);

  const state = newStatsState(range, rooms);
  const t = (totals.results as Totals[])[0];
  state.cancelled = t.cancelled;
  state.bookings = t.bookings;
  state.totalMinutes = t.clipped_ms / MINUTE;
  state.durationSum = t.duration_ms / MINUTE;
  state.participantsSum = t.p_sum;
  state.participantsN = t.p_n;

  for (const r of roomRows.results as ({ room: string } & Group)[]) {
    const entry = roomEntry(state, r.room);
    entry.count += r.n;
    entry.minutes += r.ms / MINUTE;
  }

  for (const r of deptRows.results as ({ has_user: number; code: string | null; label: string | null } & Group)[]) {
    const name = r.has_user
      ? displayOrg({ code: r.code ?? "", label: r.label ?? "" }, "department").label || "（未分類）"
      : "（未分類）";
    const dept = state.deptMap.get(name) ?? { count: 0, minutes: 0 };
    dept.count += r.n;
    dept.minutes += r.ms / MINUTE;
    state.deptMap.set(name, dept);
  }

  type BookerRow = { user_id: string | null; user_name: string | null; user_raw: string | null } & Group;
  for (const r of bookerRows.results as BookerRow[]) {
    // 與逐筆計算相同的 key 與姓名規則（userKey）；SQL 分組後再合併（例如舊資料 user 字串前後空白不同）
    const user = r.user_id !== null ? { id: r.user_id, name: r.user_name ?? "" } : r.user_raw ?? undefined;
    const who = userKey(user as Parameters<typeof userKey>[0]);
    const booker = state.bookerMap.get(who.key) ?? { name: who.name, count: 0, minutes: 0 };
    booker.count += r.n;
    booker.minutes += r.ms / MINUTE;
    state.bookerMap.set(who.key, booker);
  }

  for (const r of segments.results as { room: string; s: number; e: number }[]) {
    addWindowMinutes(state, roomEntry(state, r.room), r.s, r.e);
  }

  return finishStats(state, range, rooms);
}
