import { PassThrough } from "node:stream";
import { todos, users } from "./db.ts"; // MongoDB 連線
import { logEvent } from "./logger.ts"; // 引入共用 log 函式

// ===== 統一時間處理工具函式 =====
/**
 * 確保輸入轉換為有效的 Date 物件
 * @param dateInput 日期輸入（字串或 Date 物件）
 * @returns Date 物件
 * @throws Error 如果日期格式無效
 */
function ensureDate(dateInput: string | Date): Date {
  if (dateInput instanceof Date) {
    return dateInput;
  }
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) {
    throw new Error(`無效的日期格式: ${dateInput}`);
  }
  return date;
}

/**
 * 驗證預訂時間的有效性
 * @param startTimeInput 開始時間
 * @param endTimeInput 結束時間
 * @returns 驗證後的時間物件
 * @throws Error 如果時間無效或順序錯誤
 */
function validateBookingTimes(startTimeInput: string | Date, endTimeInput: string | Date): { startTime: Date; endTime: Date } {
  const startTime = ensureDate(startTimeInput);
  const endTime = ensureDate(endTimeInput);

  if (endTime <= startTime) {
    throw new Error("結束時間必須晚於開始時間");
  }

  return { startTime, endTime };
}

// ===== 簡化的衝突檢測函式 =====
/**
 * 檢查會議室時間衝突（統一使用 Date 物件）
 * @param room 會議室名稱
 * @param startTime 開始時間
 * @param endTime 結束時間
 * @param excludeId 排除的預訂 ID（用於更新時排除自己）
 * @returns 衝突的預訂陣列
 */
async function checkRoomConflicts(
  room: string, 
  startTime: Date, 
  endTime: Date, 
  excludeId?: string
): Promise<any[]> {
  const query: any = {
    room,
    cancelled: false,
    // 簡化的時間重疊檢測：兩個時間區間重疊的條件是 start1 < end2 && start2 < end1
    $and: [
      { startTime: { $lt: endTime } },    // 現有預訂的開始時間 < 新預訂的結束時間
      { endTime: { $gt: startTime } }     // 現有預訂的結束時間 > 新預訂的開始時間
    ]
  };

  // 如果是更新操作，排除當前預訂
  if (excludeId) {
    query.id = { $ne: excludeId };
  }

  try {
    const conflicts = await todos.find(query).toArray();
    
    if (conflicts.length > 0) {
      void logEvent("warning", "檢測到時間衝突", {
        module: "BookingController",
        function: "checkRoomConflicts",
        details: { 
          room, 
          requestedTime: { startTime, endTime },
          conflictCount: conflicts.length,
          excludeId
        },
      });
    }

    return conflicts;
  } catch (error) {
    const err = error as Error;
    void logEvent("error", "衝突檢測失敗", {
      module: "BookingController",
      function: "checkRoomConflicts",
      details: { room, error: err.message },
      errorStack: err.stack,
    });
    throw new Error("衝突檢測失敗");
  }
}

// ===== 修改後的主要函式 =====

async function getAllBooked(ctx: any) {
  const startTime = Date.now();
  try {
    const allBookings = await todos.find().toArray();
    const filteredBookings = allBookings.map(({ editPassword, ...rest }) =>
      rest
    );

    ctx.response.status = 200;
    ctx.response.body = { data: filteredBookings };

    void logEvent("info", "取得所有預訂資料成功", {
      module: "BookingController",
      function: "getAllBooked",
      details: { count: filteredBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    ctx.response.status = 500;
    ctx.response.body = { error: "获取数据失败" };

    void logEvent("error", "取得所有預訂資料失敗", {
      module: "BookingController",
      function: "getAllBooked",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    void logEvent("debug", "getAllBooked 執行耗時", {
      module: "BookingController",
      function: "getAllBooked",
      details: { duration: duration + "ms" },
    });
  }
}

async function getActiveBooked(ctx: any) {
  const startTime = Date.now();
  try {
    const { room } = ctx.params;
    const query = room ? { room, cancelled: false } : { cancelled: false };
    const allActiveBookings = await todos.find(query).toArray();

    const filteredActiveBookings = allActiveBookings.map((
      { editPassword, ...rest },
    ) => rest);

    ctx.response.status = 200;
    ctx.response.body = { data: filteredActiveBookings };

    void logEvent("info", "取得活動中預訂資料成功", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { count: filteredActiveBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    ctx.response.status = 500;
    ctx.response.body = { error: "获取数据失败" };

    void logEvent("error", "取得活動中預訂資料失敗", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    void logEvent("debug", "getActiveBooked 執行耗時", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { duration: duration + "ms" },
    });
  }
}

async function addBooking(ctx: any) {
  const executionStartTime = Date.now();
  try {
    const {
      title,
      user,
      room,
      participantsNum,
      date,
      startTime: requestStartTime,
      endTime: requestEndTime,
      editPassword,
    } = await ctx.request.body.json();

    console.log("收到添加預訂請求:", { title, user, room, startTime: requestStartTime, endTime: requestEndTime });

    // 檢查是否缺少必要字段
    if (!user || !room || !requestStartTime || !requestEndTime) {
      ctx.response.status = 400; // 修正：使用 400 而非 401
      ctx.response.body = { error: "缺少必要字段" };
      void logEvent("warning", "新增預訂失敗，缺少必要字段", {
        module: "BookingController",
        function: "addBooking",
        details: { user, room, startTime: requestStartTime, endTime: requestEndTime },
      });
      return;
    }

    // 使用者驗證
    const matchedUser = await findUserStrict(user);
    if (!matchedUser) {
      ctx.response.status = 404;
      ctx.response.body = { error: `找不到使用者 ID：${user}` };
      return;
    }

    const userInfo = {
      id: matchedUser.id,
      name: matchedUser.name || "",
      extension: matchedUser.extension || "",
      department: matchedUser.department || { code: "", label: "" },
      group: matchedUser.group || { code: "", label: "" },
    };

    // 時間驗證（統一處理）
    let startTime: Date, endTime: Date;
    try {
      const validatedTimes = validateBookingTimes(requestStartTime, requestEndTime);
      startTime = validatedTimes.startTime;
      endTime = validatedTimes.endTime;
    } catch (timeError) {
      const err = timeError as Error;
      ctx.response.status = 400;
      ctx.response.body = { error: err.message };
      void logEvent("warning", "新增預訂失敗，時間驗證錯誤", {
        module: "BookingController",
        function: "addBooking",
        details: { startTime: requestStartTime, endTime: requestEndTime, error: err.message },
      });
      return;
    }

    const roomList = Array.isArray(room) ? room : [room];
    const allConflicts: any[] = [];

    // 衝突驗證（簡化版本）
    for (const r of roomList) {
      const conflicts = await checkRoomConflicts(r, startTime, endTime);
      if (conflicts.length > 0) {
        allConflicts.push({
          room: r,
          conflicts: conflicts.map(c => ({
            id: c.id,
            title: c.title,
            startTime: c.startTime,
            endTime: c.endTime,
          }))
        });
      }
    }

    if (allConflicts.length > 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "有會議室時間衝突 ❌，整筆預約取消", conflicts: allConflicts };
      return;
    }

    // 插入預約（全部無衝突才會執行到這裡）
    const createdTime = new Date();
    const documents = roomList.map((r: string) => {
      const id = crypto.randomUUID();
      const others = roomList.filter((o) => o !== r);
      return {
        id,
        createdTime,
        title,
        user: userInfo,
        room: r,
        participantsNum,
        cancelled: false,
        startTime,
        endTime,
        editPassword: editPassword || "",
        updatedCount: 0,
        date,
        isMulti: others,
      };
    });

    await todos.insertMany(documents);

    // 插入後再次檢查（簡化版本）
    for (const doc of documents) {
      const postInsertCheck = await checkRoomConflicts(doc.room, startTime, endTime, doc.id);
      if (postInsertCheck.length > 0) {
        void logEvent("warning", "預訂成功但檢測到衝突，數據庫可能不一致", {
          module: "BookingController",
          function: "addBooking",
          details: { id: doc.id, conflicts: postInsertCheck },
        });
      }
    }

    ctx.response.status = 201;
    ctx.response.body = {
      success: true,
      bookedRooms: roomList,
      message: "全部會議室預約成功 ✅",
    };

    void logEvent("info", "新增預訂成功", {
      module: "BookingController",
      function: "addBooking",
      details: {
        bookedRooms: roomList,
        startTime: requestStartTime,
        endTime: requestEndTime,
      },
    });
  } catch (error) {
    const err = error as Error;
    ctx.response.status = 500;
    ctx.response.body = { error: "插入數據失敗" };
    void logEvent("error", "新增預訂失敗", {
      module: "BookingController",
      function: "addBooking",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - executionStartTime;
    void logEvent("debug", "addBooking 執行耗時", {
      module: "BookingController",
      function: "addBooking",
      details: { duration: duration + "ms" },
    });
  }
}

async function updateBooking(ctx: any) {
  const startTime = Date.now();
  try {
    const { id, editPassword } = ctx.params;
    if (!id) {
      ctx.response.status = 400; // 修正：使用 400 而非 401
      ctx.response.body = { error: "缺少必要的 id" };
      void logEvent("warning", "更新預訂失敗，缺少 id", {
        module: "BookingController",
        function: "updateBooking",
        details: { params: ctx.params },
      });
      return;
    }

    // 根據 id 先找到資料
    const booking = await todos.findOne({ id });
    if (!booking) {
      ctx.response.status = 404;
      ctx.response.body = { error: "找不到該筆資料" };
      void logEvent("warning", "更新預訂失敗，找不到資料", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return;
    }

    // 編輯密碼驗證
    const MASTER_PASSWORD = "87878787"; // 提取常數
    if (
      booking.editPassword && editPassword !== MASTER_PASSWORD &&
      booking.editPassword !== editPassword
    ) {
      ctx.response.status = 403;
      ctx.response.body = { error: "編輯密碼錯誤，無法更新資料" };
      void logEvent("warning", "更新預訂失敗，編輯密碼錯誤", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return;
    }

    // 檢查是否有請求主體
    try {
      const body = await ctx.request.body.json();

      if (!body || Object.keys(body).length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "更新資料不能為空" };
        void logEvent("warning", "更新預訂失敗，空更新資料", {
          module: "BookingController",
          function: "updateBooking",
          details: { id },
        });
        return;
      }

      // 統一時間處理
      let newStartTime = ensureDate(booking.startTime);
      let newEndTime = ensureDate(booking.endTime);

      // 如果有時間更新，重新驗證
      if (body.startTime || body.endTime) {
        try {
          const validatedTimes = validateBookingTimes(
            body.startTime || newStartTime,
            body.endTime || newEndTime
          );
          newStartTime = validatedTimes.startTime;
          newEndTime = validatedTimes.endTime;
        } catch (timeError) {
          const err = timeError as Error;
          ctx.response.status = 400;
          ctx.response.body = { error: err.message };
          void logEvent("warning", "更新預訂失敗，時間驗證錯誤", {
            module: "BookingController",
            function: "updateBooking",
            details: { id, error: err.message },
          });
          return;
        }
      }

      const roomToCheck = body.room || booking.room;

      // 衝突檢測（簡化版本）
      const conflicts = await checkRoomConflicts(roomToCheck, newStartTime, newEndTime, id);
      if (conflicts.length > 0) {
        ctx.response.status = 400;
        ctx.response.body = {
          error: "更新後時段存在衝突 ❌，請選擇其他時間",
          conflicts: conflicts.map(c => ({
            id: c.id,
            title: c.title,
            startTime: c.startTime,
            endTime: c.endTime,
          })),
        };
        void logEvent("warning", "更新預訂失敗，時段衝突", {
          module: "BookingController",
          function: "updateBooking",
          details: { id, room: roomToCheck, conflicts },
        });
        return;
      }

      // 執行更新
      const updateData = {
        ...body,
        updatedTime: new Date(),
      };

      const result = await todos.updateOne(
        { id },
        {
          $set: updateData,
          $inc: { updatedCount: 1 },
        },
      );

      if (result.modifiedCount === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "資料未更新" };
        void logEvent("warning", "更新預訂失敗，無資料更新", {
          module: "BookingController",
          function: "updateBooking",
          details: { id, update: body },
        });
        return;
      }

      // 更新後再次檢查衝突（簡化版本）
      if (body.startTime || body.endTime || body.room) {
        const postUpdateCheck = await checkRoomConflicts(roomToCheck, newStartTime, newEndTime, id);
        if (postUpdateCheck.length > 0) {
          void logEvent("warning", "更新成功但檢測到衝突，數據庫可能不一致", {
            module: "BookingController",
            function: "updateBooking",
            details: { id, conflicts: postUpdateCheck },
          });
        }
      }

      ctx.response.status = 200;
      ctx.response.body = { success: true, message: "更新成功" };
      void logEvent("info", "更新預訂成功", {
        module: "BookingController",
        function: "updateBooking",
        details: { id, update: body },
      });
    } catch (bodyError) {
      const err = bodyError as Error;
      ctx.response.status = 400;
      ctx.response.body = { error: "無法解析請求體" };
      void logEvent("error", "解析更新資料失敗", {
        module: "BookingController",
        function: "updateBooking",
        details: { id, error: err.message },
        errorStack: err.stack,
      });
    }
  } catch (error) {
    const err = error as Error;
    ctx.response.status = 500;
    ctx.response.body = { error: "更新資料失敗" };
    void logEvent("error", "更新預訂失敗", {
      module: "BookingController",
      function: "updateBooking",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    void logEvent("debug", "updateBooking 執行耗時", {
      module: "BookingController",
      function: "updateBooking",
      details: { duration: duration + "ms" },
    });
  }
}

export { addBooking, getActiveBooked, getAllBooked, updateBooking };

// ===== 輔助函式 =====

// 使用者驗證函式（保持不變）
async function findUserStrict(userIdRaw: string): Promise<any | null> {
  const numberMatches = userIdRaw.match(/\d{4,6}/g);
  const checked = new Set<string>();

  if (!numberMatches) return null;

  let matchedUser = null;

  for (const num of numberMatches) {
    const padded = num.padStart(6, "0");
    if (!checked.has(padded)) {
      matchedUser = await users.findOne({ id: padded });
      if (matchedUser) return matchedUser;
      checked.add(padded);
    }

    if (num.length === 5) {
      const trimmed = num.slice(0, 4).padStart(6, "0");
      if (!checked.has(trimmed)) {
        matchedUser = await users.findOne({ id: trimmed });
        if (matchedUser) return matchedUser;
        checked.add(trimmed);
      }
    }
  }

  for (const num of numberMatches) {
    if (!checked.has(num)) {
      matchedUser = await users.findOne({ extension: num });
      if (matchedUser) return matchedUser;
      checked.add(num);
    }
  }

  return null;
}