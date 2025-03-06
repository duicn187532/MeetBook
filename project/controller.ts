import { todos } from "./db.ts"; // 引入 MongoDB 实例

async function getAllBooked(ctx: any) {
    try {
        // console.log("🔍 正在查询数据库...");
        const allBookings = await todos.find().toArray();
        // console.log("✅ 查询结果:", allBookings);
        
        ctx.response.status = 200;
        ctx.response.body = { data: allBookings };
    } catch (error) {
        console.error("❌ 获取数据失败:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "获取数据失败" };
    }
}

async function addBooking(ctx: any) {
    try {
        const { title, user, room, startTime, endTime } = await ctx.request.body.json();

        // 檢查是否缺少必要字段
        if (!user || !room || !startTime || !endTime) {
            ctx.response.status = 400;
            ctx.response.body = { error: "缺少必要字段" };
            return;
        }

        // 預訂衝突檢測
        const conflict = await todos.findOne({
            room,
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
        const result = await todos.insertOne({ id: id, title, user, room, startTime, endTime });
        ctx.response.status = 201;
        ctx.response.body = { id: result.insertedId, message: "預訂成功 ✅"};
    } catch (error) {
        console.error("❌ 插入數據失敗:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "插入數據失敗" };
    }
}

async function deleteBooking(ctx: any) {
    try {
        const { id } = ctx.params;
        if (!id) {
            ctx.response.status = 400;
            ctx.response.body = { error: "缺少必要的 id" };
            return;
        }
        
        // 根據 _id 來執行刪除操作
        const result = await todos.deleteOne({ id: id });
        
        // 根據結果判斷是否有刪除成功
        if (result.deletedCount === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "未找到符合的資料" };
            return;
        }
        
        ctx.response.status = 200;
        ctx.response.body = { success: true, message: "刪除成功 ✅" };
    } catch (error) {
        console.error("❌ 刪除数据失败:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "刪除数据失败" };
    }
}

export { getAllBooked, addBooking, deleteBooking };
