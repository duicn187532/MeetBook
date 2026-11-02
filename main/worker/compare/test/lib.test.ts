import { describe, expect, it } from "vitest";
import { compareById, diffPaths, frontendRange, listIsEqual, taipeiMonthStart, taipeiYmd } from "../lib.ts";
import { formatCpuReport, parseWindow } from "../cpu_report.ts";

describe("diffPaths", () => {
  it("相同時沒有差異；鍵的順序不影響", () => {
    expect(diffPaths({ a: 1, b: [1, { c: "x" }] }, { b: [1, { c: "x" }], a: 1 })).toEqual([]);
  });
  it("列出不同的路徑", () => {
    expect(diffPaths({ a: 1, b: [1, 2], c: { d: null } }, { a: 2, b: [1], c: { d: "" }, e: 1 })).toEqual([
      "a",
      "b.length",
      "c.d",
      "e",
    ]);
  });
});

describe("compareById", () => {
  const row = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: "t", date: "2026-12-01", ...extra });

  it("內容相同、順序不同", () => {
    const c = compareById([row("a"), row("b")], [row("b"), row("a")]);
    expect(listIsEqual(c)).toBe(true);
    expect(c.sameOrder).toBe(false);
  });

  it("找出只在一邊、內容不同的預約", () => {
    const c = compareById([row("a"), row("b", { title: "x" }), row("c")], [row("a"), row("b"), row("d")]);
    expect(c.onlyOld).toEqual(["c"]);
    expect(c.onlyNew).toEqual(["d"]);
    expect(c.changed).toEqual([{ id: "b", fields: ["title"] }]);
    expect(listIsEqual(c)).toBe(false);
  });

  it("舊資料 date 為 null／沒有欄位、新系統為空字串：已知差異，不算不同", () => {
    const noDate = { id: "a", title: "t" };
    const c = compareById([noDate, row("b", { date: null })], [row("a", { date: "" }), row("b", { date: "" })]);
    expect(listIsEqual(c)).toBe(true);
    expect(c.known.map((k) => k.id)).toEqual(["a", "b"]);
    // date 有值但不同時仍算不同
    expect(listIsEqual(compareById([row("a")], [row("a", { date: "" })]))).toBe(false);
  });
});

describe("時間區間（台北）", () => {
  it("月初與前端預設範圍", () => {
    const now = Date.parse("2026-11-30T17:00:00Z"); // 台北 12/1 01:00
    expect(taipeiMonthStart(now, 0).toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(taipeiYmd(taipeiMonthStart(now, -1))).toBe("2026-11-01");
    expect(frontendRange(now)).toEqual({ from: "2026-10-31T16:00:00.000Z", to: "2027-03-31T15:59:59.999Z" });
  });
});

describe("CPU 報告", () => {
  it("微秒換算成毫秒，標示超過上限的請求", () => {
    const w = parseWindow("最近 24 小時", {
      overall: [{ sum: { requests: 120, errors: 1 }, quantiles: { cpuTimeP50: 850, cpuTimeP99: 3200 } }],
      byStatus: [
        { sum: { requests: 119 }, quantiles: { cpuTimeP99: 3100 }, dimensions: { status: "success" } },
        { sum: { requests: 1 }, quantiles: { cpuTimeP99: 12000 }, dimensions: { status: "exceededResources" } },
      ],
    });
    expect(w).toMatchObject({ requests: 120, errors: 1, p50ms: 0.85, p99ms: 3.2 });
    const report = formatCpuReport([w]);
    expect(report).toContain("| 最近 24 小時 | 120 | 1 | 0.85 ms | 3.2 ms |");
    expect(report).toContain("1 個請求超過資源上限");
  });
  it("沒有資料時", () => {
    const report = formatCpuReport([parseWindow("最近 7 天", { overall: [], byStatus: [] })]);
    expect(report).toContain("exceededResources = 0");
  });
});
