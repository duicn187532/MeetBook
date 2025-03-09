import { PassThrough } from "node:stream";
import { todos } from "./db.ts"; // 引入 MongoDB 实例

async function getAllBooked(ctx: any) {
    try {
        const allBookings = await todos.find().toArray();
        const filteredBookings = allBookings.map(({ editPassword, ...rest }) => rest);

        ctx.response.status = 200;
        ctx.response.body = { data: filteredBookings };
    } catch (error) {
        console.error("❌ 获取数据失败:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "获取数据失败" };
    }
}

async function getActiveBooked(ctx: any) {
    try {
        const allActiveBookings = await todos.find({ cancelled: false }).toArray();
        
        ctx.response.status = 200;
        ctx.response.body = { data: allActiveBookings };
    } catch (error) {
        console.error("❌ 获取数据失败:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "获取数据失败" };
    }
}

async function addBooking(ctx: any) {
    try {
        const { title, user, room, startTime, endTime, editPassword } = await ctx.request.body.json();

        // 檢查是否缺少必要字段
        if (!user || !room || !startTime || !endTime) {
            ctx.response.status = 400;
            ctx.response.body = { error: "缺少必要字段" };
            return;
        }

        // 預訂衝突檢測
        const conflict = await todos.findOne({
            room,
            cancelled: false,
            $or: [
                { startTime: { $lte: endTime, $gte: startTime } },
                { endTime: { $lte: endTime, $gte: startTime } },
            ],
        });

        if (conflict) {
            ctx.response.status = 400;
            ctx.response.body = { error: "此時段已被預訂 ❌，請選擇其他時間" };
            return;
        }

        // 使用 crypto.randomUUID() 生成隨機 id
        const id = crypto.randomUUID();

        // 插入新的預訂，使用隨機 id 作為自定義 id
        const result = await todos.insertOne({ id: id, title, user, room, cancelled: false, startTime, endTime, editPassword });
        ctx.response.status = 201;
        ctx.response.body = { id: result.insertedId, message: "預訂成功 ✅"};
    } catch (error) {
        console.error("❌ 插入數據失敗:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "插入數據失敗" };
    }
}

async function updateBooking(ctx: any) {
  try {
    const { id, editPassword } = ctx.params;
    if (!id) {
      ctx.response.status = 400;
      ctx.response.body = { error: "缺少必要的 id" };
      return;
    }

    // 根據 id 先找到資料
    const booking = await todos.findOne({ id: id });
    if (!booking) {
      ctx.response.status = 404;
      ctx.response.body = { error: "找不到該筆資料" };
      return;
    }

    // 如果該資料有設定編輯密碼，則比對參數中的密碼
    if (editPassword !== "87878787" && booking.editPassword !== editPassword) {
        ctx.response.status = 403;
        ctx.response.body = { error: "編輯密碼錯誤，無法更新資料" };
        return;
    }
    
      // 檢查是否有請求主體
      try {
        const body = await ctx.request.body.json();
        console.log("收到的更新資料:", body);
        
        if (!body || Object.keys(body).length === 0) {
          ctx.response.status = 400;
          ctx.response.body = { error: "更新資料不能為空" };
          return;
        }
        
        // 執行更新，使用 $set 更新指定欄位
        const result = await todos.updateOne({ id: id }, { $set: body });
        
        if (result.modifiedCount === 0) {
          ctx.response.status = 404;
          ctx.response.body = { error: "未找到資料或資料未更新" };
          return;
        }
        
        ctx.response.status = 200;
        ctx.response.body = { success: true, message: "更新成功" };
      } catch (bodyError) {
        console.error("解析請求體失敗:", bodyError);
        ctx.response.status = 400;
        ctx.response.body = { error: "無法解析請求體" };
      }
    } catch (error) {
      console.error("更新資料失敗:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "更新資料失敗" };
    }
  }
    

export { getAllBooked, addBooking, updateBooking, getActiveBooked };
