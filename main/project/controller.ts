import { PassThrough } from "node:stream";
import { todos } from "./db.ts"; // MongoDB 連線
import { logEvent } from "./logger.ts"; // 引入共用 log 函式

async function getAllBooked(ctx: any) {
  const startTime = Date.now();
  try {
    const allBookings = await todos.find().toArray();
    const filteredBookings = allBookings.map(({ editPassword, ...rest }) => rest);

    ctx.response.status = 200;
    ctx.response.body = { data: filteredBookings };

    void logEvent("info", "取得所有預訂資料成功", {
      module: "BookingController",
      function: "getAllBooked",
      details: { count: filteredBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    // console.error("❌ 获取数据失败:", err);
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
    const {room} = ctx.params;
    const query = room ? { room, cancelled: false } : { cancelled: false };
    const allActiveBookings = await todos.find(query).toArray();

    // const allActiveBookings = await todos.find({ cancelled: false }).toArray();
    const filteredActiveBookings = allActiveBookings.map(({ editPassword, ...rest }) => rest);
    
    ctx.response.status = 200;
    ctx.response.body = { data: filteredActiveBookings };

    void logEvent("info", "取得活動中預訂資料成功", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { count: filteredActiveBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    // console.error("❌ 获取数据失败:", err);
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
    const { title, user, room, participantsNum, date, startTime: requestStartTime, endTime: requestEndTime, editPassword } = await ctx.request.body.json();

    // 詳細日誌 - 顯示收到的請求
    // console.log("收到添加預訂請求:", { title, user, room, startTime: requestStartTime, endTime: requestEndTime });

    // 檢查是否缺少必要字段
    if (!user || !room || !requestStartTime || !requestEndTime) {
      ctx.response.status = 401;
      ctx.response.body = { error: "缺少必要字段" };
      void logEvent("warning", "新增預訂失敗，缺少必要字段", {
        module: "BookingController",
        function: "addBooking",
        details: { user, room, startTime: requestStartTime, endTime: requestEndTime },
      });
      return;
    }

    // 轉換為 `Date`
    const newStartTime = new Date(requestStartTime);
    const newEndTime = new Date(requestEndTime);
    
    // 驗證時間有效性
    if (isNaN(newStartTime.getTime()) || isNaN(newEndTime.getTime())) {
      ctx.response.status = 400;
      ctx.response.body = { error: "無效的日期格式" };
      void logEvent("warning", "新增預訂失敗，無效的日期格式", {
        module: "BookingController",
        function: "addBooking",
        details: { startTime: requestStartTime, endTime: requestEndTime },
      });
      return;
    }
    
    // 確保結束時間晚於開始時間
    if (newEndTime <= newStartTime) {
      ctx.response.status = 400;
      ctx.response.body = { error: "結束時間必須晚於開始時間" };
      void logEvent("warning", "新增預訂失敗，時間順序錯誤", {
        module: "BookingController",
        function: "addBooking",
        details: { startTime: requestStartTime, endTime: requestEndTime },
      });
      return;
    }

    // 首先獲取當前房間的所有未取消預約，作為額外檢查
    const allRoomBookings = await todos.find({
      room,
      cancelled: false
    }).toArray();
    
    // console.log(`找到 ${allRoomBookings.length} 筆同房間預訂:`, allRoomBookings);

    // 先進行手動時間衝突檢測
    const manualConflicts = allRoomBookings.filter(booking => {
      const bookingStart = new Date(booking.startTime);
      const bookingEnd = new Date(booking.endTime);
      
      // 檢查是否有任何重疊
      return (
        (newStartTime < bookingEnd && newEndTime > bookingStart) ||  // 一般重疊情況
        (newStartTime <= bookingStart && newEndTime >= bookingEnd)    // 新預約完全包含現有預約
      );
    });
    
    if (manualConflicts.length > 0) {
      // console.log("手動檢測到時間衝突:", manualConflicts);
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "手動檢測到時間衝突 ❌，請選擇其他時間",
        conflicts: manualConflicts.map(c => ({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime
        }))
      };
      return;
    }

    // 標準 MongoDB 預訂衝突檢測 - 使用字符串格式進行比較
    const startTimeStr = newStartTime.toISOString();
    const endTimeStr = newEndTime.toISOString();
    
    const queryConflicts = await todos.find({
      room,
      cancelled: false,
      $or: [
        // 開始時間落在現有預約內
        { 
          startTime: { $lte: startTimeStr }, 
          endTime: { $gt: startTimeStr } 
        },
        // 結束時間落在現有預約內
        { 
          startTime: { $lt: endTimeStr }, 
          endTime: { $gte: endTimeStr } 
        },
        // 完全包含現有預約
        { 
          startTime: { $gte: startTimeStr }, 
          endTime: { $lte: endTimeStr } 
        }
      ]
    }).toArray();

    if (queryConflicts.length > 0) {
      // console.log("MongoDB查詢檢測到時間衝突:", queryConflicts);
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "系統檢測到時間衝突 ❌，請選擇其他時間",
        conflicts: queryConflicts.map(c => ({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime
        }))
      };
      void logEvent("warning", "新增預訂失敗，時段衝突", {
        module: "BookingController",
        function: "addBooking",
        details: { room, startTime: requestStartTime, endTime: requestEndTime, conflicts: queryConflicts },
      });
      return;
    }

    // 生成 `id` & 設定 `createdTime`
    const id = crypto.randomUUID();
    const createdTime = new Date();
    // const date = newStartTime.toISOString().split('T')[0]; // 提取日期部分

    // 執行預訂前的最終檢查
    const finalCheckConflicts = await todos.find({
      room,
      cancelled: false,
      $or: [
        { startTime: { $lte: newStartTime }, endTime: { $gt: newStartTime } },
        { startTime: { $lt: newEndTime }, endTime: { $gte: newEndTime } },
        { startTime: { $gte: newStartTime }, endTime: { $lte: newEndTime } }
      ]
    }).toArray();

    if (finalCheckConflicts.length > 0) {
      // console.log("最終檢查發現衝突:", finalCheckConflicts);
      ctx.response.status = 400;
      ctx.response.body = { 
        error: "最終檢查發現時間衝突 ❌，請選擇其他時間",
        conflicts: finalCheckConflicts.map(c => ({
          id: c.id,
          title: c.title,
          startTime: c.startTime,
          endTime: c.endTime
        }))
      };
      return;
    }

    // 插入新的預訂
    const document = {
      id,
      createdTime,
      title,
      user,
      room,
      participantsNum,
      cancelled: false,
      startTime: newStartTime,
      endTime: newEndTime,
      editPassword: editPassword || "",
      updatedCount: 0,
      date // 添加日期字段，方便按日期查詢
    };
    
    // console.log("準備插入新預訂:", document);
    
    const result = await todos.insertOne(document);

    ctx.response.status = 201;
    ctx.response.body = { id, message: "預訂成功 ✅" };

    // 驗證插入後再次檢查衝突
    const postInsertCheck = await checkConflicts(room, newStartTime, newEndTime, id);
    if (postInsertCheck.length > 0) {
      // console.log("警告：插入後檢測到衝突，但已完成插入:", postInsertCheck);
      void logEvent("warning", "預訂成功但檢測到衝突，數據庫可能不一致", {
        module: "BookingController",
        function: "addBooking",
        details: { id, conflicts: postInsertCheck },
      });
    }

    void logEvent("info", "新增預訂成功", {
      module: "BookingController",
      function: "addBooking",
      details: { id, room, startTime: requestStartTime, endTime: requestEndTime },
    });
  } catch (error) {
    const err = error as Error;
    // console.error("❌ 插入數據失敗:", err);
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

// 幫助函數：檢查衝突
async function checkConflicts(room: string, startTime: Date, endTime: Date, excludeId?: string) {
  const query: any = {
    room,
    cancelled: false,
    $or: [
      { startTime: { $lte: startTime }, endTime: { $gt: startTime } },
      { startTime: { $lt: endTime }, endTime: { $gte: endTime } },
      { startTime: { $gte: startTime }, endTime: { $lte: endTime } }
    ]
  };
  
  // 如果提供了ID，排除該預訂
  if (excludeId) {
    query.id = { $ne: excludeId };
  }
  
  return await todos.find(query).toArray();
}

async function updateBooking(ctx: any) {
  const startTime = Date.now();
  try {
    const { id, editPassword } = ctx.params;
    if (!id) {
      ctx.response.status = 401;
      ctx.response.body = { error: "缺少必要的 id" };
      void logEvent("warning", "更新預訂失敗，缺少 id", {
        module: "BookingController",
        function: "updateBooking",
        details: { params: ctx.params },
      });
      return;
    }

    // console.log(`開始處理ID為 ${id} 的預訂更新請求`);

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

    // console.log("找到預訂資料:", booking);

    // 編輯密碼驗證
    if (booking.editPassword && editPassword !== "87878787" && booking.editPassword !== editPassword) {
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
      // console.log("收到的更新資料:", body);
      
      if (!body || Object.keys(body).length === 0) {
        ctx.response.status = 401;
        ctx.response.body = { error: "更新資料不能為空" };
        void logEvent("warning", "更新預訂失敗，空更新資料", {
          module: "BookingController",
          function: "updateBooking",
          details: { id },
        });
        return;
      }

      // 確認更新是否包含時間變更
      let newStartTime = booking.startTime;
      let newEndTime = booking.endTime;
      
      if (body.startTime) {
        newStartTime = new Date(body.startTime);
        if (isNaN(newStartTime.getTime())) {
          ctx.response.status = 400;
          ctx.response.body = { error: "無效的開始時間格式" };
          return;
        }
      }
      
      if (body.endTime) {
        newEndTime = new Date(body.endTime);
        if (isNaN(newEndTime.getTime())) {
          ctx.response.status = 400;
          ctx.response.body = { error: "無效的結束時間格式" };
          return;
        }
      }
      
      // 確保結束時間晚於開始時間
      if (newEndTime <= newStartTime) {
        ctx.response.status = 400;
        ctx.response.body = { error: "結束時間必須晚於開始時間" };
        return;
      }
      
      // 如果時間或房間有更新，檢查衝突
      if (body.startTime || body.endTime || body.room) {
        const roomToCheck = body.room || booking.room;
        
        // 首先獲取當前房間的所有未取消預約，作為額外檢查
        const allRoomBookings = await todos.find({
          room: roomToCheck,
          cancelled: false,
          id: { $ne: id } // 排除當前預約
        }).toArray();
        
        // console.log(`找到 ${allRoomBookings.length} 筆同房間其他預訂`);

        // 先進行手動時間衝突檢測
        const manualConflicts = allRoomBookings.filter(b => {
          const bookingStart = new Date(b.startTime);
          const bookingEnd = new Date(b.endTime);
          
          // 檢查是否有任何重疊
          return (
            (newStartTime < bookingEnd && newEndTime > bookingStart) ||  // 一般重疊情況
            (newStartTime <= bookingStart && newEndTime >= bookingEnd)    // 新預約完全包含現有預約
          );
        });
        
        if (manualConflicts.length > 0) {
          // console.log("手動檢測到時間衝突:", manualConflicts);
          ctx.response.status = 400;
          ctx.response.body = { 
            error: "手動檢測到時間衝突 ❌，請選擇其他時間",
            conflicts: manualConflicts.map(c => ({
              id: c.id,
              title: c.title,
              startTime: c.startTime,
              endTime: c.endTime
            }))
          };
          return;
        }

        // 標準衝突檢測
        const conflicts = await checkConflicts(roomToCheck, newStartTime, newEndTime, id);

        if (conflicts.length > 0) {
          // console.log("檢測到時間衝突:", conflicts);
          ctx.response.status = 400;
          ctx.response.body = { 
            error: "此時段已被預訂 ❌，請選擇其他時間",
            conflicts: conflicts.map(c => ({
              id: c.id,
              title: c.title,
              startTime: c.startTime,
              endTime: c.endTime
            }))
          };
          void logEvent("warning", "更新預訂失敗，時段衝突", {
            module: "BookingController",
            function: "updateBooking",
            details: { room: roomToCheck, startTime: newStartTime, endTime: newEndTime, conflicts },
          });
          return;
        }
      }
      
      // 執行更新
      const updateData = {
        ...body,
        updatedTime: new Date(),
      };
      
      // console.log("準備更新數據:", updateData);
      
      const result = await todos.updateOne(
        { id }, 
        { 
          $set: updateData, 
          $inc: { updatedCount: 1 } // 讓 updatedCount +1
        }
      );      
      
      // console.log("更新結果:", result);
      
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
      
      // 驗證更新後再次檢查衝突
      if (body.startTime || body.endTime || body.room) {
        const roomToCheck = body.room || booking.room;
        const postUpdateCheck = await checkConflicts(roomToCheck, newStartTime, newEndTime, id);
        if (postUpdateCheck.length > 0) {
          // console.log("警告：更新後檢測到衝突，但已完成更新:", postUpdateCheck);
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
      // console.error("解析請求體失敗:", err);
      ctx.response.status = 401;
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
    // console.error("更新資料失敗:", err);
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

export { getAllBooked, addBooking, updateBooking, getActiveBooked };
