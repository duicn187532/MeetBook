// 端到端：MongoDB（mongodb-memory-server）→ 匯出 → 加密備份 → 轉換 → 本機 D1（wrangler --local）→ 驗證
// 與 GitHub Actions 的轉檔 workflow 執行相同的程式，只是 D1 換成本機版本
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { BSON, MongoClient } from "mongodb";
import { MongoMemoryReplSet } from "mongodb-memory-server-core";
import { exportDatabase } from "../export_atlas.ts";
import { runTransform } from "../transform.ts";
import { compareBookings, compareUsers, isClean } from "../lib/compare.ts";
import { d1Query, wrangler } from "../lib/wrangler.ts";
import type { BackupInfo } from "../lib/report.ts";
import { FAKE_EXTENSION, FAKE_NAME, FAKE_PASSWORD, FAKE_USER_ID, legacyBookings, legacyUsers, modernBooking } from "./fixtures.ts";

const run = promisify(execFile);
const workerDir = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DB_NAME = "MeetingBooking_test";
const PASSPHRASE = "test-passphrase-0123456789";

let mongo: MongoMemoryReplSet;
let client: MongoClient;
let work: string;

// 資料庫內容的雜湊：用來確認匯出前後完全沒有被修改
async function dbFingerprint(): Promise<string> {
  const db = client.db(DB_NAME);
  const hash = createHash("sha256");
  const names = (await db.listCollections().toArray()).map((c) => c.name).sort();
  hash.update(JSON.stringify(names));
  for (const name of names) {
    for (const doc of await db.collection(name).find().sort({ _id: 1 }).toArray()) {
      hash.update(BSON.EJSON.stringify(doc, { relaxed: false }));
    }
    hash.update(JSON.stringify(await db.collection(name).listIndexes().toArray()));
  }
  return hash.digest("hex");
}

beforeAll(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 }, binary: { version: "7.0.14" } });
  client = new MongoClient(mongo.getUri());
  await client.connect();
  const db = client.db(DB_NAME);
  // 大量資料：確保 SQL 會被拆成多個 INSERT
  const many = Array.from({ length: 1200 }, (_, i) =>
    modernBooking({
      id: `bulk-${i}`,
      cancelled: true,
      startTime: new Date(Date.UTC(2025, 0, 1) + i * 3600_000),
      endTime: new Date(Date.UTC(2025, 0, 1) + i * 3600_000 + 1800_000),
    })
  );
  await db.collection("booked").insertMany([...legacyBookings(), ...many]);
  await db.collection("users").insertMany(legacyUsers());
  await db.collection("roomLocks").insertMany([{ _id: "A101", version: 3 } as never]);
  await db.collection("booked").createIndex({ room: 1, cancelled: 1, startTime: 1 });
  work = await mkdtemp(join(tmpdir(), "meetbook-import-"));
});

afterAll(async () => {
  await client?.close();
  await mongo?.stop();
  if (work) await rm(work, { recursive: true, force: true });
});

describe("轉檔流程", () => {
  let backup: BackupInfo;

  it("匯出不會修改 MongoDB，並匯出所有 collection", async () => {
    const before = await dbFingerprint();
    const meta = await exportDatabase(mongo.getUri(), DB_NAME, join(work, "atlas"));
    expect(await dbFingerprint()).toBe(before);
    expect(meta.snapshot).toBe(true);
    expect(meta.collections).toEqual([
      { name: "booked", count: 1218 },
      { name: "roomLocks", count: 1 },
      { name: "users", count: 7 },
    ]);
    // 時間的原始型別（Date 或字串）要保留在備份中
    const lines = (await readFile(join(work, "atlas", "booked.ndjson"), "utf8")).split("\n");
    const stringTimes = lines.find((l) => l.includes('"string-times"'))!;
    expect(BSON.EJSON.parse(stringTimes).startTime).toBeTypeOf("string");
  });

  it("找不到 booked／users 時停止", async () => {
    await expect(exportDatabase(mongo.getUri(), "no_such_db", join(work, "x"))).rejects.toThrow(/找不到 collection/);
  });

  it("加密備份可以用密碼解密還原，內容與匯出相同", async () => {
    const out = join(work, "backup", "atlas.tar.gz.gpg");
    const info = join(work, "backup.json");
    await run("bash", [join(workerDir, "atlas-import/backup.sh"), join(work, "atlas"), out, info], {
      env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE },
    });
    backup = JSON.parse(await readFile(info, "utf8"));
    expect(backup.verified).toBe(true);

    // 備份檔不是明文
    const raw = await readFile(out);
    expect(raw.includes(Buffer.from(FAKE_NAME))).toBe(false);

    const restoreDir = join(work, "restore");
    await run(
      "bash",
      ["-c", `mkdir -p "$DIR" && printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 --decrypt "$FILE" | tar -xz -C "$DIR"`],
      { env: { ...process.env, BACKUP_PASSPHRASE: PASSPHRASE, DIR: restoreDir, FILE: out } },
    );
    for (const name of await readdir(join(work, "atlas"))) {
      expect(await readFile(join(restoreDir, "atlas", name))).toEqual(await readFile(join(work, "atlas", name)));
    }
  });

  it("備份密碼太短或錯誤時失敗", async () => {
    await expect(
      run("bash", [join(workerDir, "atlas-import/backup.sh"), join(work, "atlas"), join(work, "b2.gpg"), join(work, "b2.json")], {
        env: { ...process.env, BACKUP_PASSPHRASE: "short" },
      }),
    ).rejects.toThrow();
    const wrong = run("bash", ["-c", `printf wrong-passphrase-xxxxxxxx | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --decrypt "${join(work, "backup", "atlas.tar.gz.gpg")}" > /dev/null`]);
    await expect(wrong).rejects.toThrow();
  });

  it("轉換報告列出舊格式筆數，且不含個資與密碼", async () => {
    const { result, report } = await runTransform({
      exportDir: join(work, "atlas"),
      outDir: join(work, "out"),
      mode: "dry-run",
      backup,
    });
    expect(result.bookings.length).toBe(1215);
    expect(report).toContain("| 預約（booked） | 1218 | 1215 | 3 |");
    expect(report).toContain("| user 是字串（非常舊的資料） | 1 |");
    expect(report).toContain("| disabled: true（早期後台的停用標記） | 1 |");
    expect(report).toContain("解密還原驗證：通過");
    for (const secret of [FAKE_NAME, FAKE_USER_ID, FAKE_EXTENSION, FAKE_PASSWORD, "數字行編", "舊停用"]) {
      expect(report).not.toContain(secret);
    }
  });

  describe("本機 D1", () => {
    const persist = () => ["--local", "--persist-to", join(work, "d1")];

    async function importAndCompare() {
      await wrangler(["d1", "execute", "meetbook", ...persist(), "--yes", "--file", join(work, "out", "import.sql")], workerDir);
      const expected = JSON.parse(await readFile(join(work, "out", "expected.json"), "utf8"));
      const bookings = await d1Query<Record<string, unknown>>("meetbook", "SELECT * FROM bookings", persist(), workerDir);
      const users = await d1Query<Record<string, unknown>>("meetbook", "SELECT * FROM users ORDER BY seq", persist(), workerDir);
      return [compareBookings(expected.bookings, bookings), compareUsers(expected.users, users)];
    }

    it("套用 migrations 後匯入，每一筆每一欄都與轉換結果相同", async () => {
      await wrangler(["d1", "migrations", "apply", "meetbook", ...persist()], workerDir);
      const sql = await readFile(join(work, "out", "import.sql"), "utf8");
      expect(sql.split("INSERT INTO bookings").length - 1).toBeGreaterThan(1);
      const results = await importAndCompare();
      for (const c of results) expect(isClean(c), JSON.stringify(c)).toBe(true);
    });

    it("可以重複執行：第二次匯入後資料仍完全相同，不會重複", async () => {
      const results = await importAndCompare();
      for (const c of results) expect(isClean(c)).toBe(true);
      expect(results[0].actual).toBe(1215);
    });

    it("沒有 cancelled 的舊資料不會被 cancelled = 0 查到（與 MongoDB 的 cancelled: false 相同）", async () => {
      const rows = await d1Query<{ id: string }>(
        "meetbook",
        "SELECT id FROM bookings WHERE cancelled = 0 AND id = 'sparse'",
        persist(),
        workerDir,
      );
      expect(rows).toEqual([]);
    });

    it("SQL 跳脫正確：含單引號與 SQL 片段的標題原樣保存", async () => {
      const rows = await d1Query<{ title: string }>("meetbook", "SELECT title FROM bookings WHERE id = 'quotes'", persist(), workerDir);
      expect(rows[0].title).toBe("O'Neil 的\n會議 -- '; DROP TABLE bookings; --");
    });
  });

  it("暫存資料夾中只有預期的檔案", async () => {
    expect((await readdir(join(work, "atlas"))).sort()).toEqual([
      "booked.indexes.json",
      "booked.ndjson",
      "meta.json",
      "roomLocks.indexes.json",
      "roomLocks.ndjson",
      "users.indexes.json",
      "users.ndjson",
    ]);
  });
});
