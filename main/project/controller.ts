import type { RouterContext } from "oak";
import type { ClientSession, Filter } from "mongodb";
import { bookings, users, withRoomLocks } from "./db.ts";
import { logEvent } from "./logger.ts";
import {
  type BookingUpdate,
  normalizeParticipants,
  normalizeRooms,
  overlapFilter,
  parseRange,
  pickBookingUpdate,
  summarizeConflict,
  taipeiDate,
  toPublicBooking,
  validateBookingTimes,
} from "./booking_rules.ts";
import { ACTIVE_USER_FILTER } from "./admin_rules.ts";
import type { BookingDoc, UserDoc, UserInfo } from "./types.ts";

type Ctx = RouterContext<string>;

interface HandlerResult {
  status: number;
  body: Record<string, unknown>;
}

const MASTER_PASSWORD = "87878787";

function respond(ctx: Ctx, { status, body }: HandlerResult) {
  ctx.response.status = status;
  ctx.response.body = body;
}

function serverError(ctx: Ctx, fn: string, error: unknown, message: string) {
  const err = error as Error;
  respond(ctx, { status: 500, body: { error: message } });
  logEvent("error", `${fn} 失敗`, {
    module: "BookingController",
    function: fn,
    details: { error: err.message },
    errorStack: err.stack,
  });
}

// ===== 查詢輔助 =====

/**
 * 檢查會議室時間衝突
 * @param excludeIds 排除的預訂 ID（更新時排除自己與同組預約）
 */
function findRoomConflicts(
  room: string,
  startTime: Date,
  endTime: Date,
  excludeIds: string[],
  session?: ClientSession,
): Promise<BookingDoc[]> {
  const filter = { room, cancelled: false, ...overlapFilter(startTime, endTime) } as Filter<BookingDoc>;
  if (excludeIds.length > 0) filter.id = { $nin: excludeIds };
  return bookings.find(filter, { session }).toArray();
}

/**
 * 找出同一次多會議室預約中的其他（未取消）預約
 */
function findGroupSiblings(booking: BookingDoc, session?: ClientSession): Promise<BookingDoc[]> {
  if (booking.groupId) {
    return bookings.find(
      { groupId: booking.groupId, id: { $ne: booking.id }, cancelled: false },
      { session },
    ).toArray();
  }
  if (!Array.isArray(booking.isMulti) || booking.isMulti.length === 0) {
    return Promise.resolve([]);
  }
  // 舊資料沒有 groupId：同一次 insertMany 的 createdTime 相同，再以 isMulti 與預約者縮小範圍
  const filter = {
    createdTime: booking.createdTime,
    room: { $in: booking.isMulti },
    id: { $ne: booking.id },
    cancelled: false,
  } as Record<string, unknown>;
  if (typeof booking.user === "object" && booking.user?.id) {
    filter["user.id"] = booking.user.id;
  }
  return bookings.find(filter as Filter<BookingDoc>, { session }).toArray();
}

// ===== API =====

async function getActiveBooked(ctx: Ctx) {
  const { room } = ctx.params;
  const params = ctx.request.url.searchParams;

  let range: { from: Date; to: Date };
  try {
    range = parseRange(params.get("from"), params.get("to"));
  } catch (error) {
    respond(ctx, { status: 400, body: { error: (error as Error).message } });
    return;
  }

  try {
    const filter = { cancelled: false, ...overlapFilter(range.from, range.to) } as Filter<BookingDoc>;
    if (room) filter.room = room;

    const docs = await bookings.find(filter).sort({ startTime: 1 }).toArray();
    respond(ctx, { status: 200, body: { data: docs.map(toPublicBooking), range } });

    logEvent("debug", "取得活動中預訂資料成功", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { room, count: docs.length, range },
    });
  } catch (error) {
    serverError(ctx, "getActiveBooked", error, "获取数据失败");
  }
}

export interface NewBookingInput {
  title: string;
  user: string; // 行編或分機，以 findUserStrict 比對
  rooms: string[];
  startTime: unknown;
  endTime: unknown;
  participantsNum?: unknown;
  editPassword: string;
}

export type CreateBookingResult =
  | { ok: true; user: UserInfo; rooms: string[]; startTime: Date; endTime: Date }
  | {
    ok: false;
    status: number;
    error: string;
    conflicts?: { room: string; conflicts: ReturnType<typeof summarizeConflict>[] }[];
  };

/**
 * 新增預約（網頁與 LINE 共用）：比對使用者、驗證時間，並在交易中檢查衝突後寫入。
 * 任一間會議室衝突則整筆不寫入。
 */
export async function createBooking(input: NewBookingInput): Promise<CreateBookingResult> {
  const { title, user, rooms: roomList, participantsNum, editPassword } = input;

  const matchedUser = await findUserStrict(user);
  if (!matchedUser) {
    return { ok: false, status: 404, error: `找不到使用者 ID：${user}` };
  }

  let startTime: Date, endTime: Date;
  try {
    ({ startTime, endTime } = validateBookingTimes(input.startTime, input.endTime));
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
  const groupId = roomList.length > 1 ? crypto.randomUUID() : undefined;
  const createdTime = new Date();
  const documents: BookingDoc[] = roomList.map((r) => ({
    id: crypto.randomUUID(),
    ...(groupId ? { groupId } : {}),
    createdTime,
    title,
    user: userInfo,
    room: r,
    participantsNum: normalizeParticipants(participantsNum),
    cancelled: false,
    startTime,
    endTime,
    editPassword,
    updatedCount: 0,
    date: taipeiDate(startTime),
    isMulti: roomList.filter((o) => o !== r),
  }));

  // 衝突檢查與寫入在同一個交易內，避免兩個請求同時通過檢查後都寫入
  const allConflicts = await withRoomLocks(roomList, async (session) => {
    const found: { room: string; conflicts: ReturnType<typeof summarizeConflict>[] }[] = [];
    for (const r of roomList) {
      const conflicts = await findRoomConflicts(r, startTime, endTime, [], session);
      if (conflicts.length > 0) found.push({ room: r, conflicts: conflicts.map(summarizeConflict) });
    }
    if (found.length === 0) {
      await bookings.insertMany(documents, { session });
    }
    return found;
  });

  if (allConflicts.length > 0) {
    logEvent("warning", "新增預訂失敗，時段衝突", {
      module: "BookingController",
      function: "createBooking",
      details: { rooms: roomList, startTime, endTime, conflicts: allConflicts },
    });
    return { ok: false, status: 400, error: "有會議室時間衝突 ❌，整筆預約取消", conflicts: allConflicts };
  }

  logEvent("info", "新增預訂成功", {
    module: "BookingController",
    function: "createBooking",
    details: { ids: documents.map((d) => d.id), rooms: roomList, startTime, endTime },
  });
  return { ok: true, user: userInfo, rooms: roomList, startTime, endTime };
}

async function addBooking(ctx: Ctx) {
  let body: Record<string, unknown>;
  try {
    body = await ctx.request.body.json();
  } catch {
    respond(ctx, { status: 400, body: { error: "無法解析請求體" } });
    return;
  }

  const { title, user, room, participantsNum, startTime: rawStart, endTime: rawEnd, editPassword } = body;
  const roomList = normalizeRooms(room);

  if (typeof user !== "string" || !user || roomList.length === 0 || !rawStart || !rawEnd) {
    respond(ctx, { status: 400, body: { error: "缺少必要字段" } });
    logEvent("warning", "新增預訂失敗，缺少必要字段", {
      module: "BookingController",
      function: "addBooking",
      details: { room, startTime: rawStart, endTime: rawEnd },
    });
    return;
  }

  try {
    const result = await createBooking({
      title: typeof title === "string" ? title : "",
      user,
      rooms: roomList,
      startTime: rawStart,
      endTime: rawEnd,
      participantsNum,
      editPassword: typeof editPassword === "string" ? editPassword : "",
    });
    if (!result.ok) {
      const { status, error, conflicts } = result;
      respond(ctx, { status, body: conflicts ? { error, conflicts } : { error } });
      return;
    }
    respond(ctx, {
      status: 201,
      body: { success: true, bookedRooms: roomList, message: "全部會議室預約成功 ✅" },
    });
  } catch (error) {
    serverError(ctx, "addBooking", error, "插入數據失敗");
  }
}

async function updateBooking(ctx: Ctx) {
  const { id, editPassword } = ctx.params;
  if (!id) {
    respond(ctx, { status: 400, body: { error: "缺少必要的 id" } });
    return;
  }

  try {
    const booking = await bookings.findOne({ id, cancelled: false });
    if (!booking) {
      respond(ctx, { status: 404, body: { error: "找不到該筆資料" } });
      return;
    }

    if (booking.editPassword && editPassword !== MASTER_PASSWORD && booking.editPassword !== editPassword) {
      respond(ctx, { status: 403, body: { error: "編輯密碼錯誤，無法更新資料" } });
      logEvent("warning", "更新預訂失敗，編輯密碼錯誤", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return;
    }

    let rawBody: unknown;
    try {
      rawBody = await ctx.request.body.json();
    } catch {
      respond(ctx, { status: 400, body: { error: "無法解析請求體" } });
      return;
    }

    const update = pickBookingUpdate(rawBody);
    if (Object.keys(update).length === 0) {
      respond(ctx, { status: 400, body: { error: "更新資料不能為空" } });
      return;
    }

    const result = update.cancelled ? await cancelBooking(booking) : await editBooking(booking, update);
    respond(ctx, result);

    logEvent(result.status === 200 ? "info" : "warning", update.cancelled ? "取消預訂" : "更新預訂", {
      module: "BookingController",
      function: "updateBooking",
      details: { id, status: result.status, update, result: result.body },
    });
  } catch (error) {
    serverError(ctx, "updateBooking", error, "更新資料失敗");
  }
}

// 只取消這一間；同組其他會議室保留，並從它們的 isMulti 移除這間
function cancelBooking(booking: BookingDoc): Promise<HandlerResult> {
  return withRoomLocks([booking.room], async (session) => {
    const current = await bookings.findOne({ id: booking.id, cancelled: false }, { session });
    if (!current) return { status: 404, body: { error: "找不到該筆資料" } };

    const siblings = await findGroupSiblings(current, session);
    await bookings.updateOne(
      { id: current.id },
      { $set: { cancelled: true, updatedTime: new Date() }, $inc: { updatedCount: 1 } },
      { session },
    );
    if (siblings.length > 0) {
      await bookings.updateMany(
        { id: { $in: siblings.map((s) => s.id) } },
        { $pull: { isMulti: current.room } },
        { session },
      );
    }
    return { status: 200, body: { success: true, message: "取消成功" } };
  });
}

// 修改時間／名稱／人數會同步套用到同組所有會議室；room 只改這一筆
async function editBooking(booking: BookingDoc, update: BookingUpdate): Promise<HandlerResult> {
  let startTime: Date, endTime: Date;
  try {
    ({ startTime, endTime } = validateBookingTimes(
      update.startTime ?? booking.startTime,
      update.endTime ?? booking.endTime,
    ));
  } catch (timeError) {
    return { status: 400, body: { error: (timeError as Error).message } };
  }

  const newRoom = update.room ?? booking.room;
  const lockRooms = [booking.room, newRoom, ...(Array.isArray(booking.isMulti) ? booking.isMulti : [])];

  return await withRoomLocks(lockRooms, async (session): Promise<HandlerResult> => {
    const current = await bookings.findOne({ id: booking.id, cancelled: false }, { session });
    if (!current) return { status: 404, body: { error: "找不到該筆資料" } };

    const siblings = await findGroupSiblings(current, session);
    if (newRoom !== current.room && siblings.some((s) => s.room === newRoom)) {
      return { status: 400, body: { error: "同一組預約已包含該會議室，請選擇其他會議室" } };
    }

    const members = [
      { id: current.id, room: newRoom },
      ...siblings.map((s) => ({ id: s.id, room: s.room })),
    ];
    const memberIds = members.map((m) => m.id);

    const conflicts: ReturnType<typeof summarizeConflict>[] = [];
    for (const m of members) {
      const found = await findRoomConflicts(m.room, startTime, endTime, memberIds, session);
      conflicts.push(...found.map(summarizeConflict));
    }
    if (conflicts.length > 0) {
      return { status: 400, body: { error: "更新後時段存在衝突 ❌，請選擇其他時間", conflicts } };
    }

    const groupId = current.groupId ?? (siblings.length > 0 ? crypto.randomUUID() : undefined);
    const shared: Partial<BookingDoc> = {
      startTime,
      endTime,
      date: taipeiDate(startTime),
      updatedTime: new Date(),
      ...(update.title !== undefined ? { title: update.title } : {}),
      ...(update.participantsNum !== undefined
        ? { participantsNum: normalizeParticipants(update.participantsNum) }
        : {}),
      ...(groupId ? { groupId } : {}),
    };

    const result = await bookings.updateMany(
      { id: { $in: memberIds }, cancelled: false },
      { $set: shared, $inc: { updatedCount: 1 } },
      { session },
    );
    if (result.matchedCount === 0) {
      return { status: 404, body: { error: "找不到該筆資料" } };
    }

    // 重新整理每筆的 room 與 isMulti，讓同組資料保持一致
    await bookings.bulkWrite(
      members.map((m) => ({
        updateOne: {
          filter: { id: m.id },
          update: {
            $set: { room: m.room, isMulti: members.filter((o) => o.id !== m.id).map((o) => o.room) },
          },
        },
      })),
      { session },
    );

    return { status: 200, body: { success: true, message: "更新成功", updatedIds: memberIds } };
  });
}

export { addBooking, getActiveBooked, updateBooking };

// ===== 輔助函式 =====

// 管理後台停用的使用者不能再預約
const ACTIVE_USER = ACTIVE_USER_FILTER;

// 使用者驗證函式
async function findUserStrict(userIdRaw: string): Promise<UserDoc | null> {
  const numberMatches = userIdRaw.match(/\d{4,6}/g);
  const checked = new Set<string>();

  if (!numberMatches) return null;

  let matchedUser = null;

  for (const num of numberMatches) {
    const padded = num.padStart(6, "0");
    if (!checked.has(padded)) {
      matchedUser = await users.findOne({ id: padded, ...ACTIVE_USER });
      if (matchedUser) return matchedUser;
      checked.add(padded);
    }

    if (num.length === 5) {
      const trimmed = num.slice(0, 4).padStart(6, "0");
      if (!checked.has(trimmed)) {
        matchedUser = await users.findOne({ id: trimmed, ...ACTIVE_USER });
        if (matchedUser) return matchedUser;
        checked.add(trimmed);
      }
    }
  }

  for (const num of numberMatches) {
    if (!checked.has(num)) {
      matchedUser = await users.findOne({ extension: num, ...ACTIVE_USER });
      if (matchedUser) return matchedUser;
      checked.add(num);
    }
  }

  return null;
}
