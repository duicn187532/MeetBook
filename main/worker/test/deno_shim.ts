// 讓 Deno 版的單元測試幾乎原樣在 Vitest 執行：提供 Deno.test 與 @std/assert 的同名函式
import { expect, test } from "vitest";

export const Deno = {
  test: (name: string, fn: () => void | Promise<void>) => test(name, fn),
};

export function assert(value: unknown, message?: string): asserts value {
  expect(value, message).toBeTruthy();
}

export function assertEquals(actual: unknown, expected: unknown, message?: string): void {
  expect(actual, message).toStrictEqual(expected);
}

// deno-lint-ignore no-explicit-any
export function assertThrows(fn: () => unknown, ErrorClass?: new (...args: any[]) => Error, msgIncludes?: string): void {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  expect(thrown, "預期丟出例外").toBeDefined();
  if (ErrorClass) expect(thrown).toBeInstanceOf(ErrorClass);
  if (msgIncludes) expect((thrown as Error).message).toContain(msgIncludes);
}
