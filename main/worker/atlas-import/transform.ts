// 讀取 export_atlas.ts 的輸出，轉成 D1 的匯入 SQL、驗證用的預期資料與報告
//
//   node atlas-import/transform.ts <匯出資料夾> <輸出資料夾> --mode dry-run|import [--backup <backup.json>]
//
// 輸出：import.sql、expected.json（驗證用，含個資，不可上傳）、report.md（只有統計數字與 id）
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BSON } from "mongodb";
import { transform, type TransformResult } from "./lib/normalize.ts";
import { buildImportSql, estimateRowsWritten } from "./lib/sql.ts";
import { type BackupInfo, buildReport, type ExportMeta } from "./lib/report.ts";

export async function readNdjson(path: string): Promise<Record<string, unknown>[]> {
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((l) => l.trim() !== "").map((l) => BSON.EJSON.parse(l) as Record<string, unknown>);
}

export async function runTransform(opts: {
  exportDir: string;
  outDir: string;
  mode: "dry-run" | "import";
  backup: BackupInfo | null;
}): Promise<{ result: TransformResult; report: string }> {
  const meta = JSON.parse(await readFile(join(opts.exportDir, "meta.json"), "utf8")) as ExportMeta;
  const result = transform(
    await readNdjson(join(opts.exportDir, "booked.ndjson")),
    await readNdjson(join(opts.exportDir, "users.ndjson")),
  );
  const sql = buildImportSql(result.bookings, result.users);
  await mkdir(opts.outDir, { recursive: true });
  await writeFile(join(opts.outDir, "import.sql"), sql);
  await writeFile(join(opts.outDir, "expected.json"), JSON.stringify({ bookings: result.bookings, users: result.users }));
  const report = buildReport({
    mode: opts.mode,
    meta,
    backup: opts.backup,
    result,
    sqlBytes: Buffer.byteLength(sql),
    sqlStatements: sql.split(";\n").length - 1,
    rowsWrittenEstimate: estimateRowsWritten(result.bookings, result.users),
  });
  await writeFile(join(opts.outDir, "report.md"), report);
  return { result, report };
}

async function main() {
  const [exportDir, outDir] = process.argv.slice(2);
  const arg = (name: string) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : undefined;
  };
  const mode = arg("--mode") === "import" ? "import" : "dry-run";
  const backupPath = arg("--backup");
  if (!exportDir || !outDir) throw new Error("用法：transform.ts <匯出資料夾> <輸出資料夾> --mode dry-run|import");
  const backup = backupPath ? (JSON.parse(await readFile(backupPath, "utf8")) as BackupInfo) : null;
  const { result } = await runTransform({ exportDir, outDir, mode, backup });
  console.log(
    `轉換完成：預約 ${result.bookings.length}/${result.bookingTotal}、使用者 ${result.users.length}/${result.userTotal}`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
