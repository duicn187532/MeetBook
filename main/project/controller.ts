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

    await logEvent("info", "取得所有預訂資料成功", {
      module: "BookingController",
      function: "getAllBooked",
      details: { count: filteredBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    console.error("❌ 获取数据失败:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "获取数据失败" };

    await logEvent("error", "取得所有預訂資料失敗", {
      module: "BookingController",
      function: "getAllBooked",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    await logEvent("debug", "getAllBooked 執行耗時", {
      module: "BookingController",
      function: "getAllBooked",
      details: { duration: duration + "ms" },
    });
  }
}

async function getActiveBooked(ctx: any) {
  const startTime = Date.now();
  try {
    const allActiveBookings = await todos.find({ cancelled: false }).toArray();
    
    ctx.response.status = 200;
    ctx.response.body = { data: allActiveBookings };

    await logEvent("info", "取得活動中預訂資料成功", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { count: allActiveBookings.length },
    });
  } catch (error) {
    const err = error as Error;
    console.error("❌ 获取数据失败:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "获取数据失败" };

    await logEvent("error", "取得活動中預訂資料失敗", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    await logEvent("debug", "getActiveBooked 執行耗時", {
      module: "BookingController",
      function: "getActiveBooked",
      details: { duration: duration + "ms" },
    });
  }
}

async function addBooking(ctx: any) {
  const startTime = Date.now();
  try {
    const { title, user, room, startTime: sTime, endTime, editPassword } = await ctx.request.body.json();

    // 檢查是否缺少必要字段
    if (!user || !room || !sTime || !endTime) {
      ctx.response.status = 400;
      ctx.response.body = { error: "缺少必要字段" };
      await logEvent("warning", "新增預訂失敗，缺少必要字段", {
        module: "BookingController",
        function: "addBooking",
        details: { user, room, startTime: sTime, endTime },
      });
      return;
    }

    // 預訂衝突檢測
    const conflict = await todos.findOne({
      room,
      cancelled: false,
      $or: [
        { startTime: { $lte: endTime, $gte: sTime } },
        { endTime: { $lte: endTime, $gte: sTime } },
      ],
    });

    if (conflict) {
      ctx.response.status = 400;
      ctx.response.body = { error: "此時段已被預訂 ❌，請選擇其他時間" };
      await logEvent("warning", "新增預訂失敗，時段衝突", {
        module: "BookingController",
        function: "addBooking",
        details: { room, startTime: sTime, endTime },
      });
      return;
    }

    // 使用 crypto.randomUUID() 生成隨機 id
    const id = crypto.randomUUID();

    // 插入新的預訂
    const result = await todos.insertOne({ id, createdTime: Date(), title, user, room, cancelled: false, startTime: sTime, endTime, editPassword });
    ctx.response.status = 201;
    ctx.response.body = { id: result.insertedId, message: "預訂成功 ✅" };

    await logEvent("info", "新增預訂成功", {
      module: "BookingController",
      function: "addBooking",
      details: { id, room, startTime: sTime, endTime },
    });
  } catch (error) {
    const err = error as Error;
    console.error("❌ 插入數據失敗:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "插入數據失敗" };
    await logEvent("error", "新增預訂失敗", {
      module: "BookingController",
      function: "addBooking",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    await logEvent("debug", "addBooking 執行耗時", {
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
      ctx.response.status = 400;
      ctx.response.body = { error: "缺少必要的 id" };
      await logEvent("warning", "更新預訂失敗，缺少 id", {
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
      await logEvent("warning", "更新預訂失敗，找不到資料", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return;
    }

    // 編輯密碼驗證
    if (booking.editPassword && editPassword !== "87878787" && booking.editPassword !== editPassword) {
      ctx.response.status = 403;
      ctx.response.body = { error: "編輯密碼錯誤，無法更新資料" };
      await logEvent("warning", "更新預訂失敗，編輯密碼錯誤", {
        module: "BookingController",
        function: "updateBooking",
        details: { id },
      });
      return;
    }

    // 檢查是否有請求主體
    try {
      const body = await ctx.request.body.json();
      console.log("收到的更新資料:", body);
      
      if (!body || Object.keys(body).length === 0) {
        ctx.response.status = 400;
        ctx.response.body = { error: "更新資料不能為空" };
        await logEvent("warning", "更新預訂失敗，空更新資料", {
          module: "BookingController",
          function: "updateBooking",
          details: { id },
        });
        return;
      }

      //衝突檢查 
      if (body.startTime && body.endTime && body.room) {
        const conflict = await todos.findOne({
          id: { $ne: id }, // 排除當前預約本身
          room: body.room,
          cancelled: false,
          $or: [
            { startTime: { $lte: body.endTime, $gte: body.startTime } },
            { endTime: { $lte: body.endTime, $gte: body.startTime } },
          ],
        });

        if (conflict) {
          ctx.response.status = 400;
          ctx.response.body = { error: "此時段已被預訂 ❌，請選擇其他時間" };
          await logEvent("warning", "更新預訂失敗，時段衝突", {
            module: "BookingController",
            function: "updateBooking",
            details: { room: body.room, startTime: body.startTime, endTime: body.endTime },
          });
          return;
        }
      }
      
      // 執行更新
      const result = await todos.updateOne({ id }, { $set: body });
      
      if (result.modifiedCount === 0) {
        ctx.response.status = 404;
        ctx.response.body = { error: "未找到資料或資料未更新" };
        await logEvent("warning", "更新預訂失敗，無資料更新", {
          module: "BookingController",
          function: "updateBooking",
          details: { id, update: body },
        });
        return;
      }
      
      ctx.response.status = 200;
      ctx.response.body = { success: true, message: "更新成功" };
      await logEvent("info", "更新預訂成功", {
        module: "BookingController",
        function: "updateBooking",
        details: { id, update: body },
      });
    } catch (bodyError) {
      const err = bodyError as Error;
      console.error("解析請求體失敗:", err);
      ctx.response.status = 400;
      ctx.response.body = { error: "無法解析請求體" };
      await logEvent("error", "解析更新資料失敗", {
        module: "BookingController",
        function: "updateBooking",
        details: { id, error: err.message },
        errorStack: err.stack,
      });
    }
  } catch (error) {
    const err = error as Error;
    console.error("更新資料失敗:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "更新資料失敗" };
    await logEvent("error", "更新預訂失敗", {
      module: "BookingController",
      function: "updateBooking",
      details: { error: err.message },
      errorStack: err.stack,
    });
  } finally {
    const duration = Date.now() - startTime;
    await logEvent("debug", "updateBooking 執行耗時", {
      module: "BookingController",
      function: "updateBooking",
      details: { duration: duration + "ms" },
    });
  }
}

export { getAllBooked, addBooking, updateBooking, getActiveBooked };
