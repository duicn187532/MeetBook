// D1 資料存取：資料列與 Deno 版文件格式（types.ts）之間的轉換，以及原子寫入的輔助函式
import type { BookingDoc, LabelCode, UserDoc, UserInfo } from "./types.ts";

// ===== 資料列 =====

export interface BookingRow {
  id: string;
  group_id: string | null;
  created_time: number | null;
  updated_time: number | null;
  title: string;
  user_id: string | null;
  user_name: string | null;
  user_extension: string | null;
  user_department_code: string | null;
  user_department_label: string | null;
  user_group_code: string | null;
  user_group_label: string | null;
  user_raw: string | null;
  room: string;
  participants_num: number | null;
  cancelled: 0 | 1 | null;
  start_time: number;
  end_time: number;
  edit_password: string;
  updated_count: number;
  date: string;
  is_multi: string;
}

export interface UserRow {
  seq: number;
  id: string;
  name: string | null;
  extension: string;
  department_code: string;
  department_label: string;
  group_code: string;
  group_label: string;
  email: string | null;
  line_id: string | null;
  role_code: string;
  role_label: string;
  status: 0 | 1 | null;
  disabled: 0 | 1;
  created_time: number | null;
  updated_time: number | null;
}

const optDate = (ms: number | null) => (ms === null ? undefined : new Date(ms));

function parseMulti(text: string): string[] {
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? v.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

export function rowToBooking(r: BookingRow): BookingDoc {
  let user: BookingDoc["user"];
  if (r.user_id !== null) {
    user = {
      id: r.user_id,
      name: r.user_name ?? "",
      extension: r.user_extension ?? "",
      department: { code: r.user_department_code ?? "", label: r.user_department_label ?? "" },
      group: { code: r.user_group_code ?? "", label: r.user_group_label ?? "" },
    };
  } else if (r.user_raw !== null) user = r.user_raw;
  return {
    id: r.id,
    ...(r.group_id !== null ? { groupId: r.group_id } : {}),
    createdTime: optDate(r.created_time),
    updatedTime: optDate(r.updated_time),
    title: r.title,
    user,
    room: r.room,
    participantsNum: r.participants_num ?? undefined,
    cancelled: r.cancelled === null ? undefined : r.cancelled === 1,
    startTime: new Date(r.start_time),
    endTime: new Date(r.end_time),
    editPassword: r.edit_password,
    updatedCount: r.updated_count,
    date: r.date,
    isMulti: parseMulti(r.is_multi),
  };
}

const labelCode = (code: string, label: string): LabelCode | undefined =>
  code === "" && label === "" ? undefined : { code, label };

export function rowToUser(r: UserRow): UserDoc {
  return {
    seq: r.seq,
    id: r.id,
    name: r.name,
    extension: r.extension,
    department: labelCode(r.department_code, r.department_label),
    group: labelCode(r.group_code, r.group_label),
    email: r.email,
    lineId: r.line_id,
    role: labelCode(r.role_code, r.role_label),
    status: r.status === null ? null : r.status === 1,
    ...(r.disabled === 1 ? { disabled: true } : {}),
    createdTime: optDate(r.created_time),
    updatedTime: optDate(r.updated_time),
  };
}

// 新增預約時的欄位與值（順序與 INSERT 敘述相同）
export interface NewBookingRow {
  id: string;
  group_id: string | null;
  created_time: number;
  title: string;
  user: UserInfo;
  room: string;
  participants_num: number;
  start_time: number;
  end_time: number;
  edit_password: string;
  date: string;
  is_multi: string;
}

// ===== 原子寫入 =====
//
// D1 沒有互動式交易，但 db.batch() 的整批敘述是在同一個 SQL 交易中依序執行，任何一句失敗整批回復。
// 每一句條件式寫入（例如 INSERT ... WHERE NOT EXISTS 重疊的預約）後面接一句檢查：
// changes() 是前一句實際寫入的列數，不是 1 時寫入 write_guard 會違反 CHECK 條件，讓整批回復。
// 因此「檢查衝突」與「寫入」在同一個交易內完成，不會有兩個請求同時通過檢查後都寫入的情況。

export const WRITE_CONFLICT = "write_conflict";

export function guardStatement(db: D1Database): D1PreparedStatement {
  return db.prepare("INSERT OR REPLACE INTO write_guard (id, ok) VALUES (1, changes() = 1)");
}

export function isWriteConflict(error: unknown): boolean {
  return error instanceof Error && error.message.includes(WRITE_CONFLICT);
}

/** 每一句寫入後都加上檢查，整批執行；任何一句沒有寫入剛好 1 列時丟出 write_conflict */
export async function atomicWrites(db: D1Database, writes: D1PreparedStatement[], extra: D1PreparedStatement[] = []) {
  const guard = guardStatement(db);
  await db.batch([...writes.flatMap((w) => [w, guard]), ...extra]);
}

// 產生 IN (?, ?, …) 的佔位符
export function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(", ");
}
