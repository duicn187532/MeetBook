// 轉檔報告（Markdown）：只列統計數字、預約 id 與 MongoDB _id，不含姓名、行編、分機等個資
import { BOOKING_FLAGS, type TransformResult, USER_FLAGS } from "./normalize.ts";

export interface ExportMeta {
  exportedAt: string;
  dbName: string;
  snapshot: boolean;
  canWrite: boolean | null; // null = 無法判斷
  collections: { name: string; count: number }[];
}

export interface BackupInfo {
  file: string;
  bytes: number;
  sha256: string;
  verified: boolean;
}

export const D1_DAILY_WRITE_LIMIT = 100_000;
const LIST_LIMIT = 100;

// 題目要求一定要列出的舊格式，即使是 0 筆
const ALWAYS_BOOKING = new Set(["userString", "startTimeString", "endTimeString", "userNameNull"]);
const ALWAYS_USER = new Set(["disabledTrue", "nameNull", "statusFalse"]);

function taipei(ms: number | null): string {
  if (ms === null) return "-";
  return new Date(ms + 8 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + "（台北）";
}

function flagTable(labels: Record<string, string>, counts: Record<string, number>, always: Set<string>): string[] {
  const rows = Object.entries(labels).filter(([k]) => counts[k] > 0 || always.has(k));
  if (rows.length === 0) return ["（沒有）"];
  return ["| 項目 | 筆數 |", "|---|---:|", ...rows.map(([k, label]) => `| ${label} | ${counts[k]} |`)];
}

function list<T>(items: T[], fmt: (t: T) => string): string[] {
  if (items.length === 0) return ["（沒有）"];
  const out = items.slice(0, LIST_LIMIT).map((t) => `- ${fmt(t)}`);
  if (items.length > LIST_LIMIT) out.push(`- …另外 ${items.length - LIST_LIMIT} 筆未列出`);
  return out;
}

export function buildReport(opts: {
  mode: "dry-run" | "import";
  meta: ExportMeta;
  backup: BackupInfo | null;
  result: TransformResult;
  sqlBytes: number;
  sqlStatements: number;
  rowsWrittenEstimate: number;
}): string {
  const { mode, meta, backup, result: r, sqlBytes, sqlStatements, rowsWrittenEstimate } = opts;
  const s = r.stats;
  const lines: string[] = [];
  lines.push(`# Atlas → D1 轉檔報告（${mode === "dry-run" ? "dry-run，沒有寫入 D1" : "匯入"}）`, "");

  lines.push("## 來源", "");
  lines.push(`- 匯出時間：${meta.exportedAt}`);
  lines.push(`- 資料庫：\`${meta.dbName}\``);
  lines.push(`- 一致性快照讀取：${meta.snapshot ? "是" : "否（逐一讀取各 collection）"}`);
  lines.push(
    `- Atlas 帳號權限：${
      meta.canWrite === null ? "無法判斷" : meta.canWrite ? "⚠️ 這個帳號有寫入權限，建議改用唯讀帳號" : "唯讀 ✅"
    }`,
  );
  lines.push(`- 各 collection 筆數：${meta.collections.map((c) => `\`${c.name}\` ${c.count}`).join("、")}`, "");

  lines.push("## 備份", "");
  if (backup) {
    lines.push(`- 檔案：\`${backup.file}\`（${(backup.bytes / 1024).toFixed(1)} KB，AES-256 加密）`);
    lines.push(`- SHA-256：\`${backup.sha256}\``);
    lines.push(`- 解密還原驗證：${backup.verified ? "通過 ✅" : "❌ 失敗"}`);
  } else lines.push("- ❌ 沒有備份");
  lines.push("");

  lines.push("## 筆數", "");
  lines.push("| 資料表 | MongoDB | 可轉換 | 無法轉換 |", "|---|---:|---:|---:|");
  lines.push(`| 預約（booked） | ${r.bookingTotal} | ${r.bookings.length} | ${r.bookingProblems.length} |`);
  lines.push(`| 使用者（users） | ${r.userTotal} | ${r.users.length} | ${r.userProblems.length} |`, "");
  lines.push(
    `預約：有效 ${s.active}、已取消 ${s.cancelled}、沒有 cancelled 或非布林值 ${s.cancelledUnknown}。` +
      `使用者：停用 ${s.usersDisabled}（其中 status: false 且 disabled: true 的有 ${s.usersStatusFalseAndDisabled}）。`,
    "",
  );

  lines.push("## 預約的舊格式與異常", "");
  lines.push(...flagTable(BOOKING_FLAGS, r.bookingFlags, ALWAYS_BOOKING), "");
  lines.push("## 使用者的舊格式與異常", "");
  lines.push(...flagTable(USER_FLAGS, r.userFlags, ALWAYS_USER), "");

  const unknown = [
    ...Object.entries(r.bookingUnknownFields).map(([k, n]) => `- booked.\`${k}\`：${n} 筆`),
    ...Object.entries(r.userUnknownFields).map(([k, n]) => `- users.\`${k}\`：${n} 筆`),
  ];
  lines.push("## 未知欄位（不會匯入）", "", ...(unknown.length ? unknown : ["（沒有）"]), "");

  lines.push("## 無法轉換的資料（不會匯入）", "");
  lines.push(...list([...r.bookingProblems.map((p) => ({ ...p, t: "預約" })), ...r.userProblems.map((p) => ({ ...p, t: "使用者" }))], (p) =>
    `${p.t} ${p.ref}：${p.reason}`
  ), "");

  lines.push("## 同一會議室時間重疊的有效預約", "");
  lines.push(`共 ${r.overlaps.length} 組。新系統修改這些預約的時間時，會和舊系統一樣被判定為衝突。`, "");
  lines.push(...list(r.overlaps, (o) => `${o.room}：\`${o.a}\` ↔ \`${o.b}\``), "");

  lines.push("## D1 用量估計", "");
  lines.push(`- SQL：${(sqlBytes / 1024).toFixed(1)} KB、${sqlStatements} 個敘述`);
  lines.push(`- 首次匯入約寫入 ${rowsWrittenEstimate.toLocaleString("en-US")} 列（含索引）`);
  lines.push(
    `- 重新匯入（先刪除再寫入）約 ${(rowsWrittenEstimate * 2).toLocaleString("en-US")} 列；` +
      `免費方案每天上限 ${D1_DAILY_WRITE_LIMIT.toLocaleString("en-US")} 列（台北時間每天 08:00 重置）`,
  );
  if (rowsWrittenEstimate * 2 > D1_DAILY_WRITE_LIMIT * 0.8) {
    lines.push("- ⚠️ 重新匯入會用掉大部分的每日寫入額度：同一天不要重複匯入，正式切換當天只匯入一次");
  }
  lines.push("");

  lines.push("## 其他", "");
  lines.push(`- 最早的預約開始：${taipei(s.earliestStart)}；最晚的預約結束：${taipei(s.latestEnd)}`);
  lines.push(`- 最長的預約：${s.maxDurationMinutes} 分鐘`);
  lines.push(`- 開始時間在週末的有效預約：${s.activeWeekend} 筆（照原樣匯入）`);
  lines.push(`- 行編重複：${s.duplicateUserIds} 筆`);
  lines.push("");
  return lines.join("\n");
}
