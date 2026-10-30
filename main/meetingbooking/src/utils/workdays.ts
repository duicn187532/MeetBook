// 工作日（週一到週五）：週六、週日不上班，行事曆與日期選擇都跳過
import dayjs from "dayjs";

export const WORKDAYS_PER_WEEK = 5;

export const isWorkday = (d: dayjs.Dayjs) => d.day() >= 1 && d.day() <= 5;

/** 週末時往後（或往前）移到最近的工作日；本身是工作日則不變 */
export function rollToWorkday(d: dayjs.Dayjs, direction: 1 | -1 = 1): dayjs.Dayjs {
  let r = d;
  while (!isWorkday(r)) r = r.add(direction, "day");
  return r;
}

/**
 * 往後（n > 0）或往前（n < 0）移動 n 個工作日
 * 起點是週末時，移到該方向最近的工作日就算第一步（週六往前 1 天是週五、往後 1 天是週一）
 */
export function addWorkdays(d: dayjs.Dayjs, n: number): dayjs.Dayjs {
  if (n === 0) return rollToWorkday(d);
  const step = n > 0 ? 1 : -1;
  let r = d;
  let remaining = Math.abs(n);
  if (!isWorkday(r)) {
    r = rollToWorkday(r, step);
    remaining -= 1;
  }
  for (let i = 0; i < remaining; i++) r = rollToWorkday(r.add(step, "day"), step);
  return r;
}

/** 從 start（週末則從下一個工作日）起連續 count 個工作日 */
export function workdaysFrom(start: dayjs.Dayjs, count: number): dayjs.Dayjs[] {
  const first = rollToWorkday(start);
  return Array.from({ length: count }, (_, i) => addWorkdays(first, i));
}

/** 該週的週一到週五 */
export function weekWorkdays(d: dayjs.Dayjs): dayjs.Dayjs[] {
  const monday = d.startOf("week").add(1, "day"); // dayjs 預設週日為一週的開始
  return Array.from({ length: WORKDAYS_PER_WEEK }, (_, i) => monday.add(i, "day"));
}

// 日期選擇器：週末不能選
export const disableWeekend = (d: dayjs.Dayjs) => !isWorkday(d);
