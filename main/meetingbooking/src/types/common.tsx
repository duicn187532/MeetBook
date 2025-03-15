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
    participantsNum: number,
    cancelled: boolean;
}
export interface MeetingInfo {
    id: string;
    user: string;  // 預約者
    room: string;       // 會議室
    title: string;      // 會議名稱
    participantsNum: number;
    date: string;       // "YYYY-MM-DD"
    startTime: string; 
    endTime: string; 
  }

export interface BookingForm {
    title: string;
    user: string;
    room: string;
    participantsNum: number;
    selectedDate: string;
    startTime: string;
    endTime: string;
    editPassword: string;
  };

  export type ViewMode = "Day" | "Week" | "Month";
  
  export type RoomKey = "A101" | "A102" | "A103";

  export const roomNames: Record<RoomKey, string> = {
    A101: "Alpha",
    A102: "Beta",
    A103: "StartUp",
  };
  