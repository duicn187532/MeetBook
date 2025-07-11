// // todo_userinfo_migration.ts
// // 正式執行資料轉換，先備份所有原始預約資料
// import { MongoClient, ObjectId } from "npm:mongodb";

// // MongoDB 連線字串
// const uri = "mongodb+srv://root:21airr01@mycluster.wk4zgas.mongodb.net/MeetingBooking?retryWrites=true&w=majority&authSource=admin";
// const client = new MongoClient(uri);

// async function runMigration() {
//   try {
//     await client.connect();
//     const dbProd = client.db("MeetingBooking_production");
//     const todos = dbProd.collection("booked");
//     const users = dbProd.collection("users");

//     // 1. 讀取所有預約並備份到本地 JSON
//     const allTodos = await todos.find({}).toArray();
//     console.log(`🔍 共找到 ${allTodos.length} 筆會議預約資料，開始本地備份...`);
//     await Deno.writeTextFile(
//       "user_migration_backup.json",
//       JSON.stringify(allTodos, null, 2)
//     );
//     console.log(`📁 已將原始資料備份至 user_migration_backup.json`);

//     const results: { _id: string; updated: boolean; }[] = [];

//     // 2. 逐筆處理並更新
//     for (const todo of allTodos) {
//       const rawUser = (todo as any).user;
//       let matchedUser = null;
//       let userInfo;

//       // 跳過已符合結構的 user
//       if (
//         typeof rawUser === 'object' &&
//         typeof rawUser.name === 'string' &&
//         rawUser.id && rawUser.department && rawUser.group
//       ) {
//         results.push({ _id: todo._id.toString(), updated: false });
//         continue;
//       }

//       // 自訂解析邏輯，同 preview 腳本
//       let userId = '';
//       let extension = '';
//       if (typeof rawUser === 'string') {
//         const numberMatches = rawUser.match(/\d{4,6}/g) || [];
//         const checked = new Set<string>();
//         for (const num of numberMatches) {
//           const padded = num.padStart(6, '0');
//           if (!checked.has(padded)) {
//             matchedUser = await users.findOne({ id: padded });
//             if (matchedUser) { userId = padded; extension = numberMatches.find(n => n!== num) || ''; break; }
//             checked.add(padded);
//           }
//           if (!matchedUser && num.length === 5) {
//             const trimmed = num.slice(0,4).padStart(6,'0');
//             if (!checked.has(trimmed)) {
//               matchedUser = await users.findOne({ id: trimmed });
//               if (matchedUser) { userId = trimmed; extension = num; break; }
//               checked.add(trimmed);
//             }
//           }
//         }
//         if (!matchedUser) {
//           for (const num of numberMatches) {
//             if (!checked.has(num)) {
//               matchedUser = await users.findOne({ extension: num });
//               if (matchedUser) { userId = matchedUser.id; extension = num; break; }
//               checked.add(num);
//             }
//           }
//         }
//       }
//       if (!matchedUser && typeof rawUser === 'object' && rawUser.name?.name) {
//         userId = rawUser.name.id || '';
//         if (userId) matchedUser = await users.findOne({ id: userId });
//       }

//       // 組裝新 user 資訊
//       if (matchedUser) {
//         userInfo = {
//           id: matchedUser.id,
//           name: matchedUser.name || '',
//           extension: matchedUser.extension || extension || '',
//           department: matchedUser.department || { code: '', label: '' },
//           group: matchedUser.group || { code: '', label: '' },
//         };
//       } else {
//         userInfo = {
//           id: '',
//           name: typeof rawUser === 'string'
//             ? rawUser
//             : rawUser.name?.name || rawUser.name || '未知',
//           extension: extension || '',
//           department: { code: '', label: '' },
//           group: { code: '', label: '' },
//         };
//       }

//       // 更新單筆資料
//       const res = await todos.updateOne(
//         { _id: new ObjectId(todo._id) },
//         { $set: { user: userInfo } }
//       );
//       results.push({ _id: todo._id.toString(), updated: res.modifiedCount > 0 });
//       console.log(`🔄 [${todo.title}] 更新結果: ${res.modifiedCount > 0 ? '成功' : '無需更新'}`);
//     }

//     // 3. 輸出更新結果報告
//     await Deno.writeTextFile(
//       "user_migration_results.json",
//       JSON.stringify(results, null, 2)
//     );
//     console.log(`✅ 資料轉換完成，共 ${results.filter(r=>r.updated).length} 筆已更新`);
//   } catch (error) {
//     console.error("❌ 資料轉換失敗：", error);
//   } finally {
//     await client.close();
//   }
// }

// runMigration();
