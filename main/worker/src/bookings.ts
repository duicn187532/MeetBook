// 預約 API（GET／POST／PATCH /api/bookings）與網頁、LINE 共用的新增預約邏輯
// 行為、狀態碼、回應格式與錯誤訊息與 Deno 版 controller.ts 相同
import type { Context } from "hono";
import type { Env } from "./env.ts";
import { logEvent } from "./logger.ts";
import { joinJsonRows, PUBLIC_BOOKING_JSON } from "./json_sql.ts";
import {
  type BookingUpdate,
  ensureWorkday,
  normalizeParticipants,
  normalizeRooms,
  parseRange,
  pickBookingUpdate,
  summarizeConflict,
  taipeiDate,
  validateBookingTimes,
} from "./booking_rules.ts";
import { ACTIVE_USER_SQL } from "./admin_rules.ts";
import { atomicWrites, type BookingRow, isWriteConflict, placeholders, rowToBooking, rowToUser, type UserRow } from "./db.ts";
import type { BookingDoc, BookingSource, UserDoc, UserInfo } from "./types.ts";

type Ctx = Context<{ Bindings: Env }>;

interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

// 萬用編輯密碼（MASTER_PASSWORD secret）：可修改或取消任何預約；未設定或少於 8 個字元時不啟用
export function masterPasswordMatches(env: { MASTER_PASSWORD?: string }, password: string | undefined): boolean {
  const master = env.MASTER_PASSWORD ?? "";
  return master.length >= 8 && password === master;
}

// 寫入時遇到其他請求同時修改（整批回復）後重新讀取再試的次數；對應 MongoDB withTransaction 的自動重試
const MAX_ATTEMPTS = 8;

function respond(c: Ctx, { status, body }: HandlerResult) {
  return c.json(body, status as 200);
}

function serverError(c: Ctx, fn: string, error: unknown, message: string) {
  const err = error as Error;
  logEvent("error", `${fn} 失敗`, {
    module: "BookingController",
    function: fn,
    details: { error: err.message },
    errorStack: err.stack,
  });
  return respond(c, { status: 500, body: { error: message } });
}

// ===== 查詢輔助 =====

async function selectBookings(db: D1Database, sql: string, params: unknown[]): Promise<BookingDoc[]> {
  const { results } = await db.prepare(sql).bind(...params).all<BookingRow>();
  return results.map(rowToBooking);
}

export function findActiveBooking(db: D1Database, id: string): Promise<BookingDoc | undefined> {
  return selectBookings(db, "SELECT * FROM bookings WHERE id = ? AND cancelled = 0 LIMIT 1", [id]).then((r) => r[0]);
}

/**
 * 檢查會議室時間衝突
 * @param excludeIds 排除的預訂 ID（更新時排除自己與同組預約）
 */
function findRoomConflicts(
  db: D1Database,
  room: string,
  startTime: Date,
  endTime: Date,
  excludeIds: string[],
): Promise<BookingDoc[]> {
  let sql = "SELECT * FROM bookings WHERE room = ? AND cancelled = 0 AND end_time > ? AND start_time < ?";
  const params: unknown[] = [room, startTime.getTime(), endTime.getTime()];
  if (excludeIds.length > 0) {
    sql += ` AND id NOT IN (${placeholders(excludeIds.length)})`;
    params.push(...excludeIds);
  }
  return selectBookings(db, `${sql} ORDER BY rowid`, params);
}

/** 找出同一次多會議室預約中的其他（未取消）預約 */
function findGroupSiblings(db: D1Database, booking: BookingDoc): Promise<BookingDoc[]> {
  if (booking.groupId) {
    return selectBookings(
      db,
      "SELECT * FROM bookings WHERE group_id = ? AND id != ? AND cancelled = 0 ORDER BY rowid",
      [booking.groupId, booking.id],
    );
  }
  if (!Array.isArray(booking.isMulti) || booking.isMulti.length === 0) return Promise.resolve([]);
  // 舊資料沒有 groupId：同一次 insertMany 的 createdTime 相同，再以 isMulti 與預約者縮小範圍
  let sql = `SELECT * FROM bookings WHERE created_time IS ? AND room IN (${placeholders(booking.isMulti.length)})` +
    " AND id != ? AND cancelled = 0";
  const params: unknown[] = [booking.createdTime?.getTime() ?? null, ...booking.isMulti, booking.id];
  if (typeof booking.user === "object" && booking.user?.id) {
    sql += " AND user_id = ?";
    params.push(booking.user.id);
  }
  return selectBookings(db, `${sql} ORDER BY rowid`, params);
}

// ===== GET /api/bookings/:room? =====

export async function getActiveBooked(c: Ctx) {
  const room = c.req.param("room");
  let range: { from: Date; to: Date };
  try {
    range = parseRange(c.req.query("from") ?? null, c.req.query("to") ?? null);
  } catch (error) {
    return respond(c, { status: 400, body: { error: (error as Error).message } });
  }

  try {
    // 每一列的 JSON 由 SQL 產生（見 json_sql.ts），Worker 只把字串接起來，資料量大時 CPU 時間也很短
    let sql = `SELECT ${PUBLIC_BOOKING_JSON} AS j FROM bookings WHERE cancelled = 0 AND end_time > ? AND start_time < ?`;
    const params: unknown[] = [range.from.getTime(), range.to.getTime()];
    if (room) {
      sql += " AND room = ?";
      params.push(room);
    }
    const { results } = await c.env.DB.prepare(`${sql} ORDER BY start_time, rowid`).bind(...params).all<{ j: string }>();

    logEvent("debug", "取得活動中預訂資料成功", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { room, count: results.length, range },
    });
    return c.body(`{"data":${joinJsonRows(results)},"range":${JSON.stringify(range)}}`, 200, {
      "Content-Type": "application/json",
    });
  } catch (error) {
    return serverError(c, "getActiveBooked", error, "获取数据失败");
  }
}

// ===== 新增（網頁與 LINE 共用） =====

export interface NewBookingInput {
  title: string;
  user: string; // 行編或分機，以 findUserStrict 比對
  rooms: string[];
  startTime: unknown;
  endTime: unknown;
  participantsNum?: unknown;
  editPassword: string;
  // 預約來源，管理後台顯示用
  source: BookingSource;
}

type ConflictGroup = { room: string; conflicts: ReturnType<typeof summarizeConflict>[] };

export type CreateBookingResult =
  | { ok: true; ids: string[]; user: UserInfo; rooms: string[]; startTime: Date; endTime: Date }
  | { ok: false; status: number; error: string; conflicts?: ConflictGroup[] };

const INSERT_IF_FREE = `
INSERT INTO bookings (
  id, group_id, created_time, updated_time, title,
  user_id, user_name, user_extension, user_department_code, user_department_label, user_group_code, user_group_label,
  user_raw, room, participants_num, cancelled, start_time, end_time, edit_password, updated_count, date, is_multi, source
)
SELECT ?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, NULL, ?12, ?13, 0, ?14, ?15, ?16, 0, ?17, ?18, ?19
WHERE NOT EXISTS (
  SELECT 1 FROM bookings WHERE room = ?12 AND cancelled = 0 AND start_time < ?15 AND end_time > ?14
)`;

/**
 * 新增預約：比對使用者、驗證時間，並以「條件式寫入 + 整批回復」確保不會重複預約。
 * 任一間會議室衝突則整筆不寫入。
 */
export async function createBooking(db: D1Database, input: NewBookingInput): Promise<CreateBookingResult> {
  const { title, user, rooms: roomList, participantsNum, editPassword } = input;

  const matchedUser = await findUserStrict(db, user);
  if (!matchedUser) {
    return { ok: false, status: 404, error: `找不到使用者 ID：${user}` };
  }

  let startTime: Date, endTime: Date;
  try {
    ({ startTime, endTime } = validateBookingTimes(input.startTime, input.endTime));
    ensureWorkday(startTime);
  } catch (timeError) {
    return { ok: false, status: 400, error: (timeError as Error).message };
  }

  const userInfo: UserInfo = {
    id: matchedUser.id,
    name: matchedUser.name || "",
    extension: matchedUser.extension || "",
    department: matchedUser.department || { code: "", label: "" },
    group: matchedUser.group || { code: "", label: "" },
  };
  const groupId = roomList.length > 1 ? crypto.randomUUID() : null;
  const createdTime = Date.now();
  const ids = roomList.map(() => crypto.randomUUID());
  const statements = roomList.map((r, i) =>
    db.prepare(INSERT_IF_FREE).bind(
      ids[i],
      groupId,
      createdTime,
      title,
      userInfo.id,
      userInfo.name,
      userInfo.extension,
      userInfo.department.code,
      userInfo.department.label,
      userInfo.group.code,
      userInfo.group.label,
      r,
      normalizeParticipants(participantsNum),
      startTime.getTime(),
      endTime.getTime(),
      editPassword,
      taipeiDate(startTime),
      JSON.stringify(roomList.filter((o) => o !== r)),
      input.source,
    )
  );

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 先查詢，有衝突時回傳衝突清單；寫入時會在同一個交易中再檢查一次
    const allConflicts: ConflictGroup[] = [];
    for (const r of roomList) {
      const conflicts = await findRoomConflicts(db, r, startTime, endTime, []);
      if (conflicts.length > 0) allConflicts.push({ room: r, conflicts: conflicts.map(summarizeConflict) });
    }
    if (allConflicts.length > 0) {
      logEvent("warning", "新增預訂失敗，時段衝突", {
        module: "BookingController",
        function: "createBooking",
        details: { rooms: roomList, startTime, endTime, conflicts: allConflicts },
      });
      return { ok: false, status: 400, error: "有會議室時間衝突 ❌，整筆預約取消", conflicts: allConflicts };
    }

    try {
      await atomicWrites(db, statements);
    } catch (error) {
      // 查詢之後、寫入之前有其他請求搶先預約：整批已回復，重新查詢
      if (isWriteConflict(error)) continue;
      throw error;
    }

    logEvent("info", "新增預訂成功", {
      module: "BookingController",
      function: "createBooking",
      details: { ids, rooms: roomList, startTime, endTime },
    });
    return { ok: true, ids, user: userInfo, rooms: roomList, startTime, endTime };
  }
  throw new Error("同時寫入的請求過多，重試後仍無法完成");
}

// ===== POST /api/bookings =====

export async function addBooking(c: Ctx) {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return respond(c, { status: 400, body: { error: "無法解析請求體" } });
  }

  const { title, user, room, participantsNum, startTime: rawStart, endTime: rawEnd, editPassword } = body;
  const roomList = normalizeRooms(room);

  if (typeof user !== "string" || !user || roomList.length === 0 || !rawStart || !rawEnd) {
    logEvent("warning", "新增預訂失敗，缺少必要字段", {
      module: "BookingController",
      function: "addBooking",
      details: { room, startTime: rawStart, endTime: rawEnd },
    });
    return respond(c, { status: 400, body: { error: "缺少必要字段" } });
  }

  try {
    const result = await createBooking(c.env.DB, {
      title: typeof title === "string" ? title : "",
      user,
      rooms: roomList,
      startTime: rawStart,
      endTime: rawEnd,
      participantsNum,
      editPassword: typeof editPassword === "string" ? editPassword : "",
      source: "web",
    });
    if (!result.ok) {
      const { status, error, conflicts } = result;
      return respond(c, { status, body: conflicts ? { error, conflicts } : { error } });
    }
    return respond(c, {
      status: 201,
      body: { success: true, bookedRooms: roomList, message: "全部會議室預約成功 ✅" },
    });
  } catch (error) {
    return serverError(c, "addBooking", error, "插入數據失敗");
  }
}

// ===== PATCH /api/bookings/:id/:editPassword? =====

export async function updateBooking(c: Ctx) {
  const id = c.req.param("id");
  const editPassword = c.req.param("editPassword");
  if (!id) return respond(c, { status: 400, body: { error: "缺少必要的 id" } });

  try {
    const booking = await findActiveBooking(c.env.DB, id);
    if (!booking) return respond(c, { status: 404, body: { error: "找不到該筆資料" } });

    if (booking.editPassword && !masterPasswordMatches(c.env, editPassword) && booking.editPassword !== editPassword) {
      logEvent("warning", "更新預訂失敗，編輯密碼錯誤", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return respond(c, { status: 403, body: { error: "編輯密碼錯誤，無法更新資料" } });
    }

    let rawBody: unknown;
    try {
      rawBody = await c.req.json();
    } catch {
      return respond(c, { status: 400, body: { error: "無法解析請求體" } });
    }

    const update = pickBookingUpdate(rawBody);
    if (Object.keys(update).length === 0) {
      return respond(c, { status: 400, body: { error: "更新資料不能為空" } });
    }

    const result = update.cancelled ? await cancelBooking(c.env.DB, id) : await editBooking(c.env.DB, booking, update);

    logEvent(result.status === 200 ? "info" : "warning", update.cancelled ? "取消預訂" : "更新預訂", {
      module: "BookingController",
      function: "updateBooking",
      details: { id, status: result.status, update, result: result.body },
    });
    return respond(c, result);
  } catch (error) {
    return serverError(c, "updateBooking", error, "更新資料失敗");
  }
}

// 只取消這一間；同組其他會議室保留，並從它們的 isMulti 移除這間
async function cancelBooking(db: D1Database, id: string): Promise<HandlerResult> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await findActiveBooking(db, id);
    if (!current) return { status: 404, body: { error: "找不到該筆資料" } };
    const siblings = await findGroupSiblings(db, current);

    // updated_count 沒變才寫入：讀取之後被其他請求修改過就整批回復重來
    const cancel = db
      .prepare(
        "UPDATE bookings SET cancelled = 1, updated_time = ?, updated_count = updated_count + 1" +
          " WHERE id = ? AND cancelled = 0 AND updated_count = ?",
      )
      .bind(Date.now(), current.id, current.updatedCount);
    const extra = siblings.length > 0
      ? [
        db
          .prepare(
            "UPDATE bookings SET is_multi = (SELECT json_group_array(value) FROM json_each(bookings.is_multi) WHERE value <> ?)" +
              ` WHERE id IN (${placeholders(siblings.length)})`,
          )
          .bind(current.room, ...siblings.map((s) => s.id)),
      ]
      : [];
    try {
      await atomicWrites(db, [cancel], extra);
    } catch (error) {
      if (isWriteConflict(error)) continue;
      throw error;
    }
    return { status: 200, body: { success: true, message: "取消成功" } };
  }
  throw new Error("同時寫入的請求過多，重試後仍無法完成");
}

// 修改時間／名稱／人數會同步套用到同組所有會議室；room 只改這一筆
async function editBooking(db: D1Database, booking: BookingDoc, update: BookingUpdate): Promise<HandlerResult> {
  let startTime: Date, endTime: Date;
  try {
    ({ startTime, endTime } = validateBookingTimes(
      update.startTime ?? booking.startTime,
      update.endTime ?? booking.endTime,
    ));
    // 只有時間真的改變時才檢查週末：既有的週末預約仍可改名稱、人數或取消
    // （網頁的修改表單每次都會帶上時間，所以要比較是否與原本相同）
    const timeChanged = startTime.getTime() !== new Date(booking.startTime).getTime() ||
      endTime.getTime() !== new Date(booking.endTime).getTime();
    if (timeChanged) ensureWorkday(startTime);
  } catch (timeError) {
    return { status: 400, body: { error: (timeError as Error).message } };
  }

  const newRoom = update.room ?? booking.room;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await findActiveBooking(db, booking.id);
    if (!current) return { status: 404, body: { error: "找不到該筆資料" } };

    const siblings = await findGroupSiblings(db, current);
    if (newRoom !== current.room && siblings.some((s) => s.room === newRoom)) {
      return { status: 400, body: { error: "同一組預約已包含該會議室，請選擇其他會議室" } };
    }

    const members = [
      { id: current.id, room: newRoom, updatedCount: current.updatedCount },
      ...siblings.map((s) => ({ id: s.id, room: s.room, updatedCount: s.updatedCount })),
    ];
    const memberIds = members.map((m) => m.id);

    const conflicts: ReturnType<typeof summarizeConflict>[] = [];
    for (const m of members) {
      const found = await findRoomConflicts(db, m.room, startTime, endTime, memberIds);
      conflicts.push(...found.map(summarizeConflict));
    }
    if (conflicts.length > 0) {
      return { status: 400, body: { error: "更新後時段存在衝突 ❌，請選擇其他時間", conflicts } };
    }

    const groupId = current.groupId ?? (siblings.length > 0 ? crypto.randomUUID() : undefined);
    const now = Date.now();
    const statements = members.map((m) => {
      const sets = ["start_time = ?", "end_time = ?", "date = ?", "updated_time = ?"];
      const values: unknown[] = [startTime.getTime(), endTime.getTime(), taipeiDate(startTime), now];
      if (update.title !== undefined) {
        sets.push("title = ?");
        values.push(update.title);
      }
      if (update.participantsNum !== undefined) {
        sets.push("participants_num = ?");
        values.push(normalizeParticipants(update.participantsNum));
      }
      if (groupId) {
        sets.push("group_id = ?");
        values.push(groupId);
      }
      // 重新整理每筆的 room 與 isMulti，讓同組資料保持一致
      sets.push("room = ?", "is_multi = ?", "updated_count = updated_count + 1");
      values.push(m.room, JSON.stringify(members.filter((o) => o.id !== m.id).map((o) => o.room)));
      // 條件：沒有被其他請求改過，且新時段在該會議室沒有其他（非同組）有效預約
      const sql = `UPDATE bookings SET ${sets.join(", ")}
        WHERE id = ? AND cancelled = 0 AND updated_count = ?
          AND NOT EXISTS (
            SELECT 1 FROM bookings o WHERE o.room = ? AND o.cancelled = 0 AND o.start_time < ? AND o.end_time > ?
              AND o.id NOT IN (${placeholders(memberIds.length)})
          )`;
      values.push(m.id, m.updatedCount, m.room, endTime.getTime(), startTime.getTime(), ...memberIds);
      return db.prepare(sql).bind(...values);
    });

    try {
      await atomicWrites(db, statements);
    } catch (error) {
      if (isWriteConflict(error)) continue;
      throw error;
    }
    return { status: 200, body: { success: true, message: "更新成功", updatedIds: memberIds } };
  }
  throw new Error("同時寫入的請求過多，重試後仍無法完成");
}

// ===== 使用者比對 =====

/**
 * 以預約人欄位中的數字比對使用者，順序與 Deno 版相同：
 * 先依序以行編（補零成 6 碼；5 碼時另外試前 4 碼）比對，再以分機比對；停用的使用者不算
 * 為了少查幾次資料庫，一次查出所有候選，再依原本的順序挑第一個符合的
 */
export function userProbes(userIdRaw: string): { field: "id" | "extension"; value: string }[] {
  const numberMatches = userIdRaw.match(/\d{4,6}/g);
  if (!numberMatches) return [];
  // 超長輸入只看前 30 組數字，避免超過 D1 的參數上限
  const nums = numberMatches.slice(0, 30);
  const checked = new Set<string>();
  const probes: { field: "id" | "extension"; value: string }[] = [];

  for (const num of nums) {
    const padded = num.padStart(6, "0");
    if (!checked.has(padded)) {
      probes.push({ field: "id", value: padded });
      checked.add(padded);
    }
    if (num.length === 5) {
      const trimmed = num.slice(0, 4).padStart(6, "0");
      if (!checked.has(trimmed)) {
        probes.push({ field: "id", value: trimmed });
        checked.add(trimmed);
      }
    }
  }
  for (const num of nums) {
    if (!checked.has(num)) {
      probes.push({ field: "extension", value: num });
      checked.add(num);
    }
  }
  return probes;
}

/** 以行編或分機找出可預約的使用者（未停用）；預約連結的確認頁也用來顯示預約人姓名 */
export async function findUserStrict(db: D1Database, userIdRaw: string): Promise<UserDoc | null> {
  const probes = userProbes(userIdRaw);
  if (probes.length === 0) return null;
  const ids = probes.filter((p) => p.field === "id").map((p) => p.value);
  const exts = probes.filter((p) => p.field === "extension").map((p) => p.value);
  const where = [
    ...(ids.length ? [`id IN (${placeholders(ids.length)})`] : []),
    ...(exts.length ? [`extension IN (${placeholders(exts.length)})`] : []),
  ].join(" OR ");
  const { results } = await db
    .prepare(`SELECT * FROM users WHERE (${where}) AND ${ACTIVE_USER_SQL} ORDER BY seq`)
    .bind(...ids, ...exts)
    .all<UserRow>();
  for (const probe of probes) {
    const row = results.find((u) => u[probe.field] === probe.value);
    if (row) return rowToUser(row);
  }
  return null;
}
