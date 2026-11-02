import { describe, expect, it } from "vitest";
import { insertStatements, sqlLiteral } from "../lib/sql.ts";
import { compareBookings, isClean } from "../lib/compare.ts";
import { transform } from "../lib/normalize.ts";
import { legacyBookings } from "./fixtures.ts";

describe("sqlLiteral", () => {
  it("跳脫單引號、處理 NULL 與數字", () => {
    expect(sqlLiteral("O'Neil")).toBe("'O''Neil'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(1764554400000)).toBe("1764554400000");
    expect(sqlLiteral(2.5)).toBe("2.5");
  });

  it("拒絕 NUL 字元與非有限數字", () => {
    expect(() => sqlLiteral("a\0b")).toThrow();
    expect(() => sqlLiteral(Number.NaN)).toThrow();
  });
});

describe("insertStatements", () => {
  it("超過大小上限時拆成多個 INSERT，每個都在上限內，且資料不會遺漏", () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ a: `row-${i}`, b: i }));
    const statements = insertStatements<{ a: string; b: number }>("t", ["a", "b"], rows, 200);
    expect(statements.length).toBeGreaterThan(1);
    for (const s of statements) expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(200);
    const joined = statements.join("\n");
    for (const r of rows) expect(joined).toContain(`'${r.a}'`);
  });
});

describe("compare", () => {
  it("找出缺少、多出與欄位不同的資料", () => {
    const expected = transform(legacyBookings(), []).bookings;
    const actual = expected.map((r) => ({ ...r })) as Record<string, unknown>[];
    expect(isClean(compareBookings(expected, actual))).toBe(true);

    actual[0].title = "被改過";
    actual.pop();
    actual.push({ ...actual[1], id: "extra" });
    const c = compareBookings(expected, actual);
    expect(c.mismatched).toEqual([{ key: expected[0].id, columns: ["title"] }]);
    expect(c.missing).toEqual([expected[expected.length - 1].id]);
    expect(c.extra).toEqual(["extra"]);
    expect(isClean(c)).toBe(false);
  });
});
