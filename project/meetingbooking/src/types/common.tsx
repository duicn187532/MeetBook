// src/types/index.ts

export interface Meeting {
    id: string;
    title: string;
    organizer: string;
    startTime: string;
    endTime: string;
    date: string; // "YYYY-MM-DD"
    color: string;
    // 保留原始時間用來計算位置
    originalStart: string;
    originalEnd: string;
  }
  
  export type ViewMode = "Day" | "Week" | "Month";
  