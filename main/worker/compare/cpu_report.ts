// 向 Cloudflare 查詢 Worker 實際的 CPU 時間（GraphQL Analytics API 的 workersInvocationsAdaptive）
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node compare/cpu_report.ts <報告.md>
//
// API token 需要 Account Analytics: Read 權限；沒有權限時只在報告中說明，不會讓 workflow 失敗。
// Cloudflare 回傳的 CPU 時間單位是微秒；免費方案每個請求的上限是 10 毫秒，超過時 status 為 exceededResources。
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const SCRIPT_NAME = "meetbook";
export const CPU_LIMIT_MS = 10;

const QUERY = `
query ($accountTag: string, $start: string, $end: string, $script: string) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      overall: workersInvocationsAdaptive(
        limit: 1
        filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }
      ) {
        sum { requests errors }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
      byStatus: workersInvocationsAdaptive(
        limit: 20
        filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }
      ) {
        sum { requests }
        quantiles { cpuTimeP99 }
        dimensions { status }
      }
    }
  }
}`;

interface Group {
  sum: { requests: number; errors?: number };
  quantiles: { cpuTimeP50?: number; cpuTimeP99: number };
  dimensions?: { status: string };
}

export interface CpuWindow {
  label: string;
  requests: number;
  errors: number;
  p50ms: number | null;
  p99ms: number | null;
  byStatus: { status: string; requests: number; p99ms: number }[];
}

const toMs = (us: number | undefined) => (typeof us === "number" ? Math.round(us / 10) / 100 : null);

export function parseWindow(label: string, data: { overall: Group[]; byStatus: Group[] }): CpuWindow {
  const o = data.overall[0];
  return {
    label,
    requests: o?.sum.requests ?? 0,
    errors: o?.sum.errors ?? 0,
    p50ms: toMs(o?.quantiles.cpuTimeP50),
    p99ms: toMs(o?.quantiles.cpuTimeP99),
    byStatus: data.byStatus.map((g) => ({
      status: g.dimensions?.status ?? "?",
      requests: g.sum.requests,
      p99ms: toMs(g.quantiles.cpuTimeP99) ?? 0,
    })),
  };
}

export function formatCpuReport(windows: CpuWindow[]): string {
  const lines = ["## 實際 CPU 時間（Cloudflare）", "", `免費方案每個請求上限 ${CPU_LIMIT_MS} ms。`, ""];
  lines.push("| 期間 | 請求數 | 錯誤 | CPU P50 | CPU P99 |", "|---|---:|---:|---:|---:|");
  for (const w of windows) {
    const ms = (v: number | null) => (v === null ? "-" : `${v} ms`);
    lines.push(`| ${w.label} | ${w.requests} | ${w.errors} | ${ms(w.p50ms)} | ${ms(w.p99ms)} |`);
  }
  const exceeded = windows.flatMap((w) => w.byStatus.filter((s) => s.status === "exceededResources").map((s) => ({ w, s })));
  lines.push("");
  if (exceeded.length > 0) {
    for (const { w, s } of exceeded) lines.push(`- ⚠️ ${w.label}：${s.requests} 個請求超過資源上限（exceededResources）`);
  } else {
    lines.push("- ✅ 沒有請求超過 CPU 上限（exceededResources = 0）");
  }
  const worst = Math.max(...windows.map((w) => w.p99ms ?? 0));
  lines.push(`- P99（99% 的請求低於此值）最高 ${worst} ms${worst < CPU_LIMIT_MS ? "，在上限內" : "，⚠️ 接近或超過上限"}`);
  return lines.join("\n") + "\n";
}

async function query(token: string, accountTag: string, start: Date, end: Date) {
  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { accountTag, start: start.toISOString(), end: end.toISOString(), script: SCRIPT_NAME },
    }),
  });
  const body = (await res.json()) as {
    data?: { viewer?: { accounts?: { overall: Group[]; byStatus: Group[] }[] } };
    errors?: { message: string }[] | null;
  };
  if (!res.ok || (body.errors && body.errors.length > 0)) {
    throw new Error(body.errors?.map((e) => e.message).join("；") || `HTTP ${res.status}`);
  }
  const account = body.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("查無資料");
  return account;
}

async function main() {
  const out = process.argv[2];
  const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
  const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  if (!out) throw new Error("用法：cpu_report.ts <報告.md>");
  let report: string;
  if (!token || !accountTag) {
    report = "## 實際 CPU 時間（Cloudflare）\n\n⏭️ 沒有設定 CLOUDFLARE_API_TOKEN／CLOUDFLARE_ACCOUNT_ID，略過。\n";
  } else {
    try {
      const now = new Date();
      const windows: CpuWindow[] = [];
      for (const [label, hours] of [["最近 24 小時", 24], ["最近 7 天", 24 * 7]] as const) {
        windows.push(parseWindow(label, await query(token, accountTag, new Date(now.getTime() - hours * 3600_000), now)));
      }
      report = formatCpuReport(windows) +
        "\n數據約有幾分鐘延遲；剛跑完的比對請求可能還沒算進去，可以稍後重新執行。\n";
    } catch (error) {
      report = "## 實際 CPU 時間（Cloudflare）\n\n" +
        `⏭️ 無法查詢：${(error as Error).message}\n\n` +
        "如果訊息是權限不足，請到 Cloudflare 編輯 API token，加上 `Account` → `Account Analytics` → `Read`。\n";
    }
  }
  await writeFile(out, report);
  console.log(report);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
