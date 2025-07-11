export interface UserInfo {
  id: string;
  name: string;
  extension: string;
  department: {
    code: string;
    label: string;
  };
  group: {
    code: string;
    label: string;
  };
}

export interface Meeting {
  id: string;
  title: string;
  user: UserInfo;
  startTime: string;
  endTime: string;
  date: string; // "YYYY-MM-DD"
  color: string;
  room: string;
  participantsNum: number;
  cancelled: boolean;
}

export interface MeetingInfo {
  id: string;
  user: UserInfo;
  room: string;
  title: string;
  participantsNum: number;
  date: string; // "YYYY-MM-DD"
  startTime: string;
  endTime: string;
}

export interface BookingForm {
  title: string;
  user: string;
  room: string[];
  participantsNum: number;
  selectedDate: string;
  startTime: string;
  endTime: string;
  editPassword: string;
}

// export interface BookingFormData {
//   title: string;
//   user: string;
//   room: string;
//   participantsNum: number;
//   selectedDate: string;
//   startTime: string;
//   endTime: string;
//   editPassword: string;
// }

export interface ConfirmationModalProps {
  show: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmColor: string;
  iconColor: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface AlertModalProps {
  type: "success" | "error";
  title: string;
  message?: string;
  onClose: () => void;
}

export type ViewMode = "Day" | "Week" | "Month";

export type RoomKey = "A101" | "A102" | "A103";

export const roomNames: Record<RoomKey, string> = {
  A101: "Alpha",
  A102: "Beta",
  A103: "StartUp",
};

export interface BookingApiResponse {
  ok: boolean;
  status: number;
  body?: any; // 如果你有回傳資料可以具體定義型別
}
