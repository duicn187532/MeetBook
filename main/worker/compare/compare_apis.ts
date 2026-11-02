// 同時查詢新舊後端，比對回應是否相同
//
//   OLD_API_BASE=https://...deno.net NEW_API_BASE=https://...workers.dev \
//   [ADMIN_PASSWORD=... OLD_ADMIN_PASSWORD=...] node compare/compare_apis.ts <報告.md>
//
// 只送出不會改變資料的請求：GET 查詢，以及一定會在寫入前被拒絕的請求（缺少欄位、找不到使用者、找不到預約）。
// 報告只有狀態碼、筆數、欄位路徑、預約 id 與序號，不含資料內容。有實際差異時 exit 1。
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  compareById,
  DAY,
  diffPaths,
  frontendRange,
  type ListComparison,
  listIsEqual,
  taipeiDayStart,
  taipeiMonthStart,
  taipeiYmd,
} from "./lib.ts";

type Result = "same" | "known" | "order" | "diff" | "skip";
interface CaseResult {
  group: string;
  name: string;
  result: Result;
  note: string;
  details: string[];
}

interface Fetched {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

const ICON: Record<Result, string> = { same: "✅", known: "✅", order: "ℹ️", diff: "❌", skip: "⏭️" };

async function call(base: string, path: string, init: RequestInit = {}, cookie?: string): Promise<Fetched> {
  const headers = new Headers(init.headers);
  if (cookie) headers.set("Cookie", cookie);
  const res = await fetch(base + path, { ...init, headers, redirect: "manual" });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: res.status, headers: res.headers, text, json };
}

function describeList(c: ListComparison): { result: Result; note: string; details: string[] } {
  const details: string[] = [];
  for (const id of c.onlyOld.slice(0, 20)) details.push(`只在舊系統：\`${id}\``);
  for (const id of c.onlyNew.slice(0, 20)) details.push(`只在新系統：\`${id}\``);
  for (const x of c.changed.slice(0, 20)) details.push(`內容不同 \`${x.id}\`：${x.fields.join("、")}`);
  const count = `舊 ${c.oldCount} 筆／新 ${c.newCount} 筆`;
  if (!listIsEqual(c)) return { result: "diff", note: count, details };
  const notes = [count];
  if (c.known.length > 0) notes.push(`${c.known.length} 筆 date 為舊格式（已知差異，不影響畫面）`);
  if (!c.sameOrder) {
    notes.push("順序不同（新系統依開始時間排序；舊系統會把時間存成文字的舊預約排在前面）");
    return { result: "order", note: notes.join("；"), details };
  }
  return { result: c.known.length > 0 ? "known" : "same", note: notes.join("；"), details };
}

function compareJson(o: Fetched, n: Fetched, ignore: string[] = []): { result: Result; note: string; details: string[] } {
  if (o.status !== n.status) {
    return { result: "diff", note: `狀態碼不同：舊 ${o.status}／新 ${n.status}`, details: [] };
  }
  const paths = diffPaths(o.json, n.json).filter((p) => !ignore.some((i) => p === i || p.startsWith(`${i}.`)));
  if (paths.length === 0) return { result: "same", note: `HTTP ${o.status}`, details: [] };
  return { result: "diff", note: `HTTP ${o.status}，${paths.length} 處不同`, details: paths.slice(0, 30).map((p) => `\`${p}\``) };
}

export async function runComparison(opts: {
  oldBase: string;
  newBase: string;
  adminPassword?: string;
  oldAdminPassword?: string;
  now?: number;
}): Promise<CaseResult[]> {
  const { oldBase, newBase } = opts;
  const now = opts.now ?? Date.now();
  const results: CaseResult[] = [];
  const add = (group: string, name: string, r: { result: Result; note: string; details: string[] }) =>
    results.push({ group, name, ...r });
  const both = (path: string, init?: RequestInit, cookies?: [string?, string?]) =>
    Promise.all([call(oldBase, path, init, cookies?.[0]), call(newBase, path, init, cookies?.[1])]);

  // ===== 基本 =====
  for (const path of ["/", "/healthz"]) {
    const [o, n] = await both(path);
    add("基本", `GET ${path}`, compareJson(o, n));
  }

  // ===== 預約查詢（前端） =====
  const fr = frontendRange(now);
  const ranges: [string, string, string][] = [
    ["前端預設範圍（上個月到 3 個月後）", fr.from, fr.to],
    ["今天", taipeiDayStart(now).toISOString(), taipeiDayStart(now, 1).toISOString()],
    ["本月", taipeiMonthStart(now, 0).toISOString(), taipeiMonthStart(now, 1).toISOString()],
    ["上個月", taipeiMonthStart(now, -1).toISOString(), taipeiMonthStart(now, 0).toISOString()],
    ["最大範圍（前後共 400 天）", new Date(now - 200 * DAY).toISOString(), new Date(now + 200 * DAY).toISOString()],
  ];
  for (const [name, from, to] of ranges) {
    const q = `?${new URLSearchParams({ from, to })}`;
    const [o, n] = await both(`/api/bookings/${q}`);
    if (o.status !== 200 || n.status !== 200) {
      add("預約查詢", name, compareJson(o, n));
      continue;
    }
    const oj = o.json as { data: Record<string, unknown>[]; range: unknown };
    const nj = n.json as { data: Record<string, unknown>[]; range: unknown };
    const rangeDiff = diffPaths(oj.range, nj.range);
    const r = describeList(compareById(oj.data, nj.data));
    if (rangeDiff.length > 0) {
      r.result = "diff";
      r.details.push(`range 不同：${rangeDiff.join("、")}`);
    }
    add("預約查詢", name, r);
  }
  for (const room of ["A101", "A102", "A103"]) {
    const q = `?${new URLSearchParams(fr)}`;
    const [o, n] = await both(`/api/bookings/${room}${q}`);
    const oj = o.json as { data?: Record<string, unknown>[] };
    const nj = n.json as { data?: Record<string, unknown>[] };
    add(
      "預約查詢",
      `會議室 ${room}（前端預設範圍）`,
      o.status === 200 && n.status === 200 && oj.data && nj.data ? describeList(compareById(oj.data, nj.data)) : compareJson(o, n),
    );
  }
  {
    // 沒帶 from／to：伺服器以各自的「現在」計算預設範圍，range 會差幾毫秒，只比對資料
    const [o, n] = await both("/api/bookings/");
    const oj = o.json as { data?: Record<string, unknown>[] };
    const nj = n.json as { data?: Record<string, unknown>[] };
    add(
      "預約查詢",
      "沒帶 from／to（伺服器預設範圍）",
      o.status === 200 && n.status === 200 && oj.data && nj.data ? describeList(compareById(oj.data, nj.data)) : compareJson(o, n),
    );
  }

  // ===== 錯誤處理（都會在寫入資料前被拒絕） =====
  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const errorCases: [string, string, RequestInit | undefined][] = [
    ["from 格式錯誤", "/api/bookings/?from=bad", undefined],
    ["查詢範圍超過 400 天", `/api/bookings/?${new URLSearchParams({ from: "2024-01-01T00:00:00Z", to: "2026-01-01T00:00:00Z" })}`, undefined],
    ["新增：缺少必要欄位", "/api/bookings/", json("POST", {})],
    ["新增：無法解析的內容", "/api/bookings/", json("POST", "{bad")],
    [
      "新增：找不到使用者",
      "/api/bookings/",
      json("POST", { user: "abc", room: ["A101"], startTime: "2026-12-01T02:00:00Z", endTime: "2026-12-01T03:00:00Z" }),
    ],
    ["修改：找不到預約", "/api/bookings/compare-tool-nonexistent-id/", json("PATCH", { title: "x" })],
  ];
  for (const [name, path, init] of errorCases) {
    const [o, n] = await both(path, init);
    add("錯誤處理", name, compareJson(o, n));
  }

  // ===== CORS =====
  {
    const origin = "https://duicn187532.github.io";
    const [o, n] = await both("/api/bookings/?from=bad", { headers: { Origin: origin } });
    const ao = o.headers.get("access-control-allow-origin");
    const an = n.headers.get("access-control-allow-origin");
    add("CORS", "允許的來源", {
      result: ao === an ? "same" : "diff",
      note: `舊 ${ao ?? "（無）"}／新 ${an ?? "（無）"}`,
      details: [],
    });
    const pre: RequestInit = {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" },
    };
    const [po, pn] = await both("/api/bookings/x/y", pre);
    const methods = (h: Headers) => (h.get("access-control-allow-methods") ?? "").split(",").map((s) => s.trim()).sort().join(",");
    const ok = po.status === pn.status && methods(po.headers) === methods(pn.headers) &&
      po.headers.get("access-control-allow-origin") === pn.headers.get("access-control-allow-origin");
    add("CORS", "預檢（OPTIONS）", {
      result: ok ? "same" : "diff",
      note: `舊 ${po.status} ${methods(po.headers)}／新 ${pn.status} ${methods(pn.headers)}`,
      details: [],
    });
  }

  // ===== 管理後台 =====
  results.push(...(await compareAdmin(oldBase, newBase, opts.adminPassword, opts.oldAdminPassword, now)));
  return results;
}

async function login(base: string, password: string): Promise<string | null> {
  const res = await fetch(`${base}/admin/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  await res.body?.cancel();
  if (res.status !== 200) return null;
  return (res.headers.get("set-cookie") ?? "").split(";")[0] || null;
}

async function compareAdmin(
  oldBase: string,
  newBase: string,
  password: string | undefined,
  oldPassword: string | undefined,
  now: number,
): Promise<CaseResult[]> {
  const group = "管理後台";
  if (!password) {
    return [{ group, name: "全部", result: "skip", note: "沒有設定 ADMIN_PASSWORD，略過", details: [] }];
  }
  const [oc, nc] = await Promise.all([login(oldBase, oldPassword || password), login(newBase, password)]);
  if (!oc || !nc) {
    return [{
      group,
      name: "登入",
      result: "skip",
      note: `無法登入${!oc ? "舊系統" : ""}${!oc && !nc ? "與" : ""}${!nc ? "新系統" : ""}（密碼不同時請設定 OLD_ADMIN_PASSWORD），略過`,
      details: [],
    }];
  }
  const results: CaseResult[] = [];
  const get = (path: string) => Promise.all([call(oldBase, path, {}, oc), call(newBase, path, {}, nc)]);

  {
    const [o, n] = await get("/admin/api/session");
    results.push({ group, name: "登入狀態", ...compareJson(o, n) });
  }
  {
    // 使用者清單含個資：只報告序號與欄位名稱
    const [o, n] = await get("/admin/api/users");
    const r = compareJson(o, n);
    if (r.result === "diff") r.details = r.details.map((d) => d.replace(/data\[(\d+)\]/, "第 $1 位使用者"));
    const count = (o.json as { data?: unknown[] })?.data?.length;
    results.push({ group, name: "使用者清單", ...r, note: `${r.note}；${count ?? "?"} 位` });
  }

  const ymd = taipeiYmd;
  const day = (offset: number) => taipeiDayStart(now, offset);
  const month = (offset: number) => taipeiMonthStart(now, offset);
  const lastDay = (offset: number) => new Date(month(offset + 1).getTime() - DAY);
  const recordRanges: [string, string, string, boolean][] = [
    ["預約紀錄：送出時間 近 7 天", ymd(day(-6)), ymd(day(0)), false],
    ["預約紀錄：送出時間 本月", ymd(month(0)), ymd(lastDay(0)), false],
    ["預約紀錄：送出時間 上月", ymd(month(-1)), ymd(lastDay(-1)), false],
    ["預約紀錄：會議時間 本月", ymd(month(0)), ymd(lastDay(0)), true],
    ["預約紀錄：會議時間 下月", ymd(month(1)), ymd(lastDay(1)), true],
  ];
  for (const [name, from, to, byMeeting] of recordRanges) {
    const [o, n] = await get(`/admin/api/bookings?${new URLSearchParams({ from, to, ...(byMeeting ? { by: "meeting" } : {}) })}`);
    const oj = o.json as { data?: Record<string, unknown>[]; truncated?: boolean; rooms?: unknown };
    const nj = n.json as { data?: Record<string, unknown>[]; truncated?: boolean; rooms?: unknown };
    if (o.status !== 200 || n.status !== 200 || !oj.data || !nj.data) {
      results.push({ group, name, ...compareJson(o, n) });
      continue;
    }
    const r = describeList(compareById(oj.data, nj.data));
    const extra = diffPaths({ truncated: oj.truncated, rooms: oj.rooms }, { truncated: nj.truncated, rooms: nj.rooms });
    if (extra.length > 0) {
      r.result = "diff";
      r.details.push(`其他欄位不同：${extra.join("、")}`);
    }
    results.push({ group, name, ...r });
  }

  const statRanges: [string, string, string][] = [
    ["統計：本月", ymd(month(0)), ymd(lastDay(0))],
    ["統計：上月", ymd(month(-1)), ymd(lastDay(-1))],
    ["統計：近 3 個月", ymd(month(-2)), ymd(lastDay(0))],
    ["統計：近 400 天", ymd(day(-399)), ymd(day(0))],
  ];
  for (const [name, from, to] of statRanges) {
    const [o, n] = await get(`/admin/api/stats?${new URLSearchParams({ from, to })}`);
    results.push({ group, name, ...compareJson(o, n) });
  }

  await Promise.all([
    fetch(`${oldBase}/admin/api/logout`, { method: "POST", headers: { Cookie: oc } }).then((r) => r.body?.cancel()),
    fetch(`${newBase}/admin/api/logout`, { method: "POST", headers: { Cookie: nc } }).then((r) => r.body?.cancel()),
  ]);
  return results;
}

export function formatReport(results: CaseResult[], oldBase: string, newBase: string): string {
  const failed = results.filter((r) => r.result === "diff").length;
  const lines = [
    "# 新舊後端比對",
    "",
    `- 舊：${oldBase}`,
    `- 新：${newBase}`,
    `- 比對時間：${new Date().toISOString()}`,
    `- 結果：${failed === 0 ? "✅ 全部一致" : `❌ ${failed} 項不同`}`,
    "",
    "| 類別 | 項目 | 結果 | 說明 |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.group} | ${r.name} | ${ICON[r.result]} | ${r.note} |`),
    "",
    "圖示：✅ 一致；ℹ️ 只有順序不同；❌ 內容不同；⏭️ 略過",
  ];
  const withDetails = results.filter((r) => r.details.length > 0);
  if (withDetails.length > 0) {
    lines.push("", "## 差異明細", "");
    for (const r of withDetails) {
      lines.push(`### ${r.group}：${r.name}`, "", ...r.details.map((d) => `- ${d}`), "");
    }
    lines.push(
      "「只在舊系統」的預約如果是最後一次匯入之後才新增或修改的，屬於資料時間差，重新匯入後再比對即可。",
    );
  }
  return lines.join("\n") + "\n";
}

async function main() {
  const out = process.argv[2];
  const oldBase = (process.env.OLD_API_BASE ?? "").replace(/\/+$/, "");
  const newBase = (process.env.NEW_API_BASE ?? "").replace(/\/+$/, "");
  if (!out || !oldBase || !newBase) throw new Error("用法：OLD_API_BASE=… NEW_API_BASE=… compare_apis.ts <報告.md>");
  const results = await runComparison({
    oldBase,
    newBase,
    adminPassword: process.env.ADMIN_PASSWORD || undefined,
    oldAdminPassword: process.env.OLD_ADMIN_PASSWORD || undefined,
  });
  const report = formatReport(results, oldBase, newBase);
  await writeFile(out, report);
  console.log(report);
  if (results.some((r) => r.result === "diff")) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
