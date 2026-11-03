// 公告與更新日誌：內容由管理後台（/admin →「公告」）維護，開啟網站時向後端讀取（GET /api/notices）
// 沒看過、且還在公告期間內的項目，開啟網站時跳出一次：先顯示公告，關閉後再顯示更新日誌
//
// 更新日誌的版號規則（主版號.次版號.修訂號）：
// - 主版號：整體改版（第一階段 v1、第二階段 v2）
// - 次版號：新增功能或一批體驗改善
// - 修訂號：只有錯誤修正

const DAY = 24 * 60 * 60 * 1000;

// 更新日誌的公告期間：改版日（台北時間）當天起 7 天
export const ANNOUNCE_DAYS = 7;

export interface ChangelogItem {
  text: string;
  experimental?: boolean; // 顯示「實驗性功能」標籤
}

export interface ChangelogEntry {
  version: string; // 唯一代號；記錄「看過的最新一筆」
  date: string; // 改版日 YYYY-MM-DD（台北時間）
  sections: { title: string; items: ChangelogItem[] }[];
}

export interface Announcement {
  id: string;
  title: string;
  body: string; // 可能有換行
  startDate: string; // YYYY-MM-DD（台北時間）
  endDate: string; // YYYY-MM-DD（含當天）
}

export interface Notices {
  changelog: ChangelogEntry[]; // 新的在前
  announcements: Announcement[];
}

// 台北時間某天 00:00 的時間戳；格式不正確時為 NaN
function taipeiDayStart(date: string): number {
  return Date.parse(`${date.split("/").join("-")}T00:00:00+08:00`);
}

/** 顯示用日期：YYYY/MM/DD */
export const slashDate = (date: string) => date.split("-").join("/");

export function isAnnouncing(date: string, now: number): boolean {
  const start = taipeiDayStart(date);
  if (isNaN(start)) return false;
  return now >= start && now < start + ANNOUNCE_DAYS * DAY;
}

export function isAnnouncementActive(a: Pick<Announcement, "startDate" | "endDate">, now: number): boolean {
  const start = taipeiDayStart(a.startDate);
  const end = taipeiDayStart(a.endDate);
  if (isNaN(start) || isNaN(end)) return false;
  return now >= start && now < end + DAY;
}

/**
 * 還沒看過的更新日誌：比 seen（看過的最新一筆版號）新的那幾筆；seen 不在清單中時全部算沒看過。
 * 只保留還在公告期間內的。
 */
export function unseenChangelog(list: ChangelogEntry[], seen: string | null, now: number): ChangelogEntry[] {
  const index = list.findIndex((entry) => entry.version === seen);
  const unseen = index === -1 ? list : list.slice(0, index);
  return unseen.filter((entry) => isAnnouncing(entry.date, now));
}

/** 還沒看過、且在公告期間內的公告 */
export function unseenAnnouncements(list: Announcement[], seen: string[], now: number): Announcement[] {
  return list.filter((a) => !seen.includes(a.id) && isAnnouncementActive(a, now));
}

/** 記錄看過的公告時只保留還在公告期間內的，避免越存越多 */
export function seenAnnouncementIds(list: Announcement[], seen: string[], shown: Announcement[], now: number): string[] {
  const active = new Set(list.filter((a) => isAnnouncementActive(a, now)).map((a) => a.id));
  return [...new Set([...seen.filter((id) => active.has(id)), ...shown.map((a) => a.id)])];
}
