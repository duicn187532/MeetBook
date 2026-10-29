// 將舊版 PATCH 存成 ISO 字串的 startTime / endTime 轉回 Date。
// 新版程式已能同時比對兩種型別，這支腳本只是讓資料型別一致。
//
// 預設只預覽（dry run），不會寫入任何資料：
//   deno task migrate:times
// 確認預覽結果後才實際寫入（寫入前會先把原始值備份成 JSON）：
//   deno task migrate:times --apply
//
// 連線設定沿用 config.ts：ENV=production 時讀取 MONGODB_URI / DB_NAME 環境變數，
// 否則讀取 .env.development。輸出只包含預約 id 與時間，不含個資。
import { MongoClient } from "mongodb";

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const TIME_FIELDS = ["startTime", "endTime"] as const;
type TimeField = typeof TIME_FIELDS[number];

export interface TimeDoc {
  id: string;
  cancelled?: boolean;
  startTime: unknown;
  endTime: unknown;
}

export interface PlannedUpdate {
  id: string;
  cancelled: boolean;
  // 只包含需要轉換的欄位；original 用來在寫入時確認資料沒有被其他人改過
  set: Partial<Record<TimeField, Date>>;
  original: Partial<Record<TimeField, string>>;
}

export interface InvalidValue {
  id: string;
  field: TimeField;
  value: string;
}

// 純函式：決定每筆資料要轉換哪些欄位；無法解析的字串列入 invalid，不會被修改
export function planTimeMigration(docs: TimeDoc[]): { updates: PlannedUpdate[]; invalid: InvalidValue[] } {
  const updates: PlannedUpdate[] = [];
  const invalid: InvalidValue[] = [];
  for (const doc of docs) {
    const update: PlannedUpdate = { id: doc.id, cancelled: doc.cancelled === true, set: {}, original: {} };
    for (const field of TIME_FIELDS) {
      const value = doc[field];
      if (typeof value !== "string") continue;
      const date = new Date(value);
      if (!ISO_PATTERN.test(value) || isNaN(date.getTime())) {
        invalid.push({ id: doc.id, field, value });
        continue;
      }
      update.set[field] = date;
      update.original[field] = value;
    }
    if (Object.keys(update.set).length > 0) updates.push(update);
  }
  return { updates, invalid };
}

async function main() {
  const apply = Deno.args.includes("--apply");
  const { DB_NAME, MONGODB_URI } = await import("../config.ts");
  if (!MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    Deno.exit(1);
  }

  const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });
  try {
    await client.connect();
    const bookings = client.db(DB_NAME).collection<TimeDoc>("booked");
    const stringFilter = { $or: [{ startTime: { $type: "string" } }, { endTime: { $type: "string" } }] };

    const total = await bookings.countDocuments();
    const docs = await bookings
      .find(stringFilter, { projection: { _id: 0, id: 1, cancelled: 1, startTime: 1, endTime: 1 } })
      .toArray();
    const { updates, invalid } = planTimeMigration(docs);
    const active = updates.filter((u) => !u.cancelled).length;

    console.log(`資料庫：${DB_NAME}`);
    console.log(`預約總數：${total}`);
    console.log(`時間為字串的預約：${docs.length}`);
    console.log(`將轉換：${updates.length} 筆（未取消 ${active}、已取消 ${updates.length - active}）`);
    console.log(`無法解析、略過：${invalid.length} 筆`);
    for (const v of invalid) console.log(`  略過 ${v.id} ${v.field}=${JSON.stringify(v.value)}`);
    for (const u of updates.slice(0, 5)) {
      const fields = Object.entries(u.original).map(([f, v]) =>
        `${f}: "${v}" → Date(${u.set[f as TimeField]!.toISOString()})`
      );
      console.log(`  例：${u.id} ${fields.join("，")}`);
    }

    if (!apply) {
      console.log("\n這是預覽（dry run），沒有寫入任何資料。確認後加上 --apply 執行。");
      return;
    }
    if (updates.length === 0) {
      console.log("\n沒有需要轉換的資料。");
      return;
    }

    const backupPath = `migration-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await Deno.writeTextFile(
      backupPath,
      JSON.stringify(updates.map((u) => ({ id: u.id, ...u.original })), null, 2),
    );
    console.log(`\n已備份原始值：${backupPath}`);

    // 篩選條件包含原本的字串值：若執行期間該筆被修改過就不會覆蓋
    const result = await bookings.bulkWrite(
      updates.map((u) => ({
        updateOne: { filter: { id: u.id, ...u.original }, update: { $set: u.set } },
      })),
      { ordered: false },
    );
    const remaining = await bookings.countDocuments(stringFilter);
    console.log(`符合 ${result.matchedCount} 筆、已更新 ${result.modifiedCount} 筆`);
    console.log(`剩餘時間為字串的預約：${remaining}（包含略過的 ${invalid.length} 筆）`);
  } finally {
    await client.close();
  }
}

if (import.meta.main) {
  await main();
}
