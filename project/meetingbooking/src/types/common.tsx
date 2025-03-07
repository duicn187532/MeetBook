// src/types/index.ts

export interface Meeting {
    id: string;
    title: string;
    organizer: string;
    startTime: string;
    endTime: string;
    date: string; // "YYYY-MM-DD"
    color: string;
    room: string;
    cancelled: boolean;
    originalStart: string;
    originalEnd: string;
  }
  
  export type ViewMode = "Day" | "Week" | "Month";
  