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
    originalStart: string;
    originalEnd: string;
  }
 export interface MeetingInfo {
    id: string;
    user: string;  // 預約者
    room: string;       // 會議室
    title: string;      // 會議名稱
    date: string;       // "YYYY-MM-DD"
    startTime: string;  // "HH:mm"
    endTime: string;    // "HH:mm"
    // 如果需要更多欄位可自行加上
  }
  export type ViewMode = "Day" | "Week" | "Month";
  