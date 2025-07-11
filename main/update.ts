// // update_todos_userinfo_prod.ts
// import { MongoClient } from "npm:mongodb";

// // 初始化正式連線（請確認為正式資料庫）
// const client = new MongoClient("mongodb://localhost:27017");
// await client.connect();

// const db = client.db("MeetBook");
// const todos = db.collection("todos");
// const users = db.collection("users");

// const allTodos = await todos.find({}).toArray();
// console.log(`🔍 共找到 ${allTodos.length} 筆會議預約資料`);

// let updatedCount = 0;
// const changedTitles: string[] = [];

// for (const todo of allTodos) {
//   try {
//     const rawUser = todo.user;

//     const userBackup = rawUser; // 備份原始資料
//     let userId = "";
//     let extension = "";

//     // ✅ 嘗試從字串中擷取 userId、extension
//     if (typeof rawUser === "string") {
//       const match = rawUser.match(/(\d{4,6})\D*#?(\d{5})?/);
//       if (match) {
//         userId = match[1].padStart(6, "0");
//         extension = match[2] || "";
//       }
//     }

//     // ✅ 錯誤巢狀格式支援（來自先前錯誤資料）
//     if (typeof rawUser === "object" && rawUser.name?.name) {
//       userId = rawUser.name.id || "";
//     }

//     let matchedUser = userId ? await users.findOne({ id: userId }) : null;

//     // ✅ 若找不到，裁掉最後一碼後補 0 再查
//     if (!matchedUser && userId.length > 1) {
//       const trimmed = userId.slice(0, -1).padStart(6, "0");
//       matchedUser = await users.findOne({ id: trimmed });
//       if (matchedUser) {
//         userId = trimmed;
//       }
//     }

//     // ✅ 組裝 UserInfo
//     const userInfo = matchedUser
//       ? {
//           id: matchedUser.id,
//           name: matchedUser.name || "",
//           extension: matchedUser.extension || extension,
//           department: matchedUser.department || { code: "", label: "" },
//           group: matchedUser.group || { code: "", label: "" },
//         }
//       : {
//           id: "",
//           name:
//             typeof rawUser === "string"
//               ? rawUser
//               : typeof rawUser === "object" && typeof rawUser.name === "string"
//               ? rawUser.name
//               : typeof rawUser === "object" && rawUser.name?.name
//               ? rawUser.name.name
//               : "未知",
//           extension,
//           department: { code: "", label: "" },
//           group: { code: "", label: "" },
//         };

//     // ✅ 更新文件並保留 userRaw
//     await todos.updateOne(
//       { _id: todo._id },
//       { $set: { user: userInfo, userRaw: userBackup } }
//     );

//     updatedCount++;
//     changedTitles.push(todo.title);
//     console.log(`✅ 已更新 ${todo.user}`);
//   } catch (err) {
//     console.error(`❌ 更新失敗：${todo.title}`, err);
//   }
// }

// console.log(`🎉 完成轉換，總共更新 ${updatedCount} 筆資料`);
// console.log(`📝 已變動的會議標題：\n${changedTitles.join("\n")}`);

// await client.close();
