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
        const {title, user, room, startTime, endTime } = await ctx.request.body.json();

        // 🔍 检查是否缺少必要字段
        if (!user || !room || !startTime || !endTime) {
            ctx.response.status = 400;
            ctx.response.body = { error: "缺少必要字段" };
            return;
        }

        // 🛑 预订冲突检测
        const conflict = await todos.findOne({
            room,
            $or: [
                { startTime: { $lte: endTime, $gte: startTime } },
                { endTime: { $lte: endTime, $gte: startTime } },
            ],
        });

        if (conflict) {
            ctx.response.status = 400;
            ctx.response.body = { error: "此时段已被预订 ❌，请选择其他时间" };
            return;
        }

        // ✅ 插入新的预订
        const result = await todos.insertOne({title, user, room, startTime, endTime });
        ctx.response.status = 201;
        ctx.response.body = { id: result.insertedId, message: "预订成功 ✅" };
    } catch (error) {
        console.error("❌ 插入数据失败:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "插入数据失败" };
    }
}

export { getAllBooked, addBooking };
