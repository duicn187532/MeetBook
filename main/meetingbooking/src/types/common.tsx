// src/types/index.ts

export interface Meeting {
    id: string;
    title: string;
    user: string;
    startTime: string;
    endTime: string;
    date: string; // "YYYY-MM-DD"
    color: string;
    room: string;
    cancelled: boolean;
}
 export interface MeetingInfo {
    id: string;
    user: string;  // 預約者
    room: string;       // 會議室
    title: string;      // 會議名稱
    date: string;       // "YYYY-MM-DD"
    startTime: string; 
    endTime: string; 
  }
  export type ViewMode = "Day" | "Week" | "Month";
  