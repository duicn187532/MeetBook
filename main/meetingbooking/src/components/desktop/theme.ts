// 電腦版各會議室的配色（沿用手機版的會議室顏色）
import { RoomKey } from "../../types/common";

export interface RoomTheme {
  main: string; // 分頁、按鈕
  soft: string; // 會議區塊底色
  bar: string; // 會議區塊左側色條
  ink: string; // 區塊內的次要文字
  nav: string; // 側欄選取時的底色
}

export const roomTheme: Record<RoomKey, RoomTheme> = {
  A101: { main: "#60AAFF", soft: "#D1E7FF", bar: "#8CC3FF", ink: "#3F6E9E", nav: "#EEF6FF" },
  A102: { main: "#FF3F3F", soft: "#FDE4E4", bar: "#FF8787", ink: "#A84545", nav: "#FFF1F1" },
  A103: { main: "#17C2B6", soft: "#D7F3F1", bar: "#42E9DD", ink: "#1D7B74", nav: "#EBFAF8" },
};

export const ROOMS: RoomKey[] = ["A101", "A102", "A103"];
export const WEEK = ["日", "一", "二", "三", "四", "五", "六"];

// 沒有填會議名稱時，前端會以「HH:mm ~ HH:mm」代替；區塊上改顯示「未命名會議」避免時間重複
export const meetingTitle = (title: string) => (/^\d{2}:\d{2} ~ \d{2}:\d{2}$/.test(title) ? "未命名會議" : title);
