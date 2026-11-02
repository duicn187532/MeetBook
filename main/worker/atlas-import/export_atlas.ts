// 從 MongoDB Atlas 唯讀匯出整個資料庫（所有 collection 與索引定義），存成 EJSON（canonical，保留 Date／字串等原始型別）
//
//   MONGODB_URI=... MONGODB_DB_NAME=... node atlas-import/export_atlas.ts <輸出資料夾>
//
// 只使用讀取操作：listCollections、listIndexes、find、countDocuments、connectionStatus。
// 輸出：<資料夾>/<collection>.ndjson、<collection>.indexes.json、meta.json。
// 終端機輸出只有 collection 名稱與筆數，不含資料內容；連線字串與主機名稱會被遮蔽。
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BSON, type ClientSession, type Db, MongoClient } from "mongodb";
import { registerMasks, scrub, secretPartsOfUri } from "./lib/secrets.ts";
import type { ExportMeta } from "./lib/report.ts";

export const REQUIRED_COLLECTIONS = ["booked", "users"];

// 會修改資料的權限；帳號有其中任何一個就提醒改用唯讀帳號
const WRITE_ACTIONS = new Set([
  "insert",
  "update",
  "remove",
  "createCollection",
  "dropCollection",
  "dropDatabase",
  "createIndex",
  "dropIndex",
  "renameCollectionSameDB",
  "collMod",
]);

async function canWrite(db: Db, dbName: string): Promise<boolean | null> {
  try {
    const status = await db.admin().command({ connectionStatus: 1, showPrivileges: true });
    const privileges = status?.authInfo?.authenticatedUserPrivileges as
      | { resource?: { db?: string; anyResource?: boolean; cluster?: boolean }; actions?: string[] }[]
      | undefined;
    // 沒有登入（本機測試用的 MongoDB）時無法判斷
    if (!Array.isArray(privileges) || (status?.authInfo?.authenticatedUsers ?? []).length === 0) return null;
    return privileges.some((p) => {
      const r = p.resource ?? {};
      const appliesToDb = r.anyResource === true || r.db === "" || r.db === dbName;
      return appliesToDb && (p.actions ?? []).some((a) => WRITE_ACTIONS.has(a));
    });
  } catch {
    return null;
  }
}

async function dumpCollection(
  db: Db,
  name: string,
  outDir: string,
  session: ClientSession | undefined,
): Promise<number> {
  const stream = createWriteStream(join(outDir, `${name}.ndjson`), { encoding: "utf8" });
  let count = 0;
  // 依 MongoDB 的自然順序（通常就是插入順序），與舊系統 findOne 不指定排序時取到的第一筆一致
  const cursor = db.collection(name).find({}, { session, sort: { $natural: 1 } });
  for await (const doc of cursor) {
    if (!stream.write(BSON.EJSON.stringify(doc, { relaxed: false }) + "\n")) await once(stream, "drain");
    count++;
  }
  stream.end();
  await once(stream, "finish");
  // listIndexes 不支援 snapshot 讀取；索引定義只是參考資料，不需要和文件在同一個時間點
  const indexes = await db.collection(name).listIndexes().toArray();
  await writeFile(join(outDir, `${name}.indexes.json`), JSON.stringify(indexes, null, 2));
  return count;
}

export async function exportDatabase(uri: string, dbName: string, outDir: string): Promise<ExportMeta> {
  await mkdir(outDir, { recursive: true });
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 20_000, appName: "meetbook-d1-export" });
  await client.connect();
  try {
    const db = client.db(dbName);
    const names = (await db.listCollections({ type: "collection" }, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith("system."))
      .sort();
    for (const required of REQUIRED_COLLECTIONS) {
      if (!names.includes(required)) throw new Error(`資料庫 ${dbName} 中找不到 collection「${required}」，請確認 MONGODB_DB_NAME`);
    }

    // 盡量在同一個時間點讀取所有 collection（snapshot read）；不支援時改成逐一讀取
    let snapshot = true;
    const collections: { name: string; count: number }[] = [];
    const session = client.startSession({ snapshot: true });
    try {
      for (const name of names) collections.push({ name, count: await dumpCollection(db, name, outDir, session) });
    } catch (error) {
      snapshot = false;
      collections.length = 0;
      console.log(`snapshot read 失敗，改用一般讀取：${(error as Error).name}`);
      for (const name of names) collections.push({ name, count: await dumpCollection(db, name, outDir, undefined) });
    } finally {
      await session.endSession();
    }

    const meta: ExportMeta = {
      exportedAt: new Date().toISOString(),
      dbName,
      snapshot,
      canWrite: await canWrite(db, dbName),
      collections,
    };
    await writeFile(join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
    return meta;
  } finally {
    await client.close();
  }
}

async function main() {
  const uri = process.env.MONGODB_URI ?? "";
  const dbName = process.env.MONGODB_DB_NAME ?? "";
  const outDir = process.argv[2];
  const secrets = secretPartsOfUri(uri);
  registerMasks(secrets);
  if (!uri) throw new Error("沒有設定 MONGODB_URI（GitHub Secret）");
  if (!dbName) throw new Error("沒有設定 MONGODB_DB_NAME（GitHub Variable）");
  if (!outDir) throw new Error("請指定輸出資料夾");
  try {
    const meta = await exportDatabase(uri, dbName, outDir);
    console.log(`匯出完成（snapshot：${meta.snapshot ? "是" : "否"}）`);
    for (const c of meta.collections) console.log(`  ${c.name}: ${c.count} 筆`);
    if (meta.canWrite) console.log("::warning::MONGODB_URI 的帳號有寫入權限，建議改用只有 read 權限的帳號");
  } catch (error) {
    // 錯誤訊息可能帶有主機名稱，輸出前先遮蔽
    const err = error as Error;
    console.error(`匯出失敗：${scrub(`${err.name}: ${err.message}`, secrets)}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
