// 後端公開的預約者資訊（不含行編與部門／組別代碼）
export interface UserInfo {
  name: string;
  extension: string;
  department?: { label: string };
  group?: { label: string };
}

// 後端 GET /api/bookings/:room 回傳的單筆資料
export interface ApiBooking {
  id: string;
  title: string;
  user: UserInfo;
  room: string;
  participantsNum: number;
  startTime: string;
  endTime: string;
  date: string; // "YYYY-MM-DD"
  updatedCount: number;
  isMulti: string[];
}

export interface Meeting extends ApiBooking {
  TaipeiStartTime: string; // "HH:mm"
  TaipeiEndTime: string; // "HH:mm"
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

// POST /api/bookings 的內容
export interface BookingPayload {
  title: string;
  user: string;
  room: string[];
  participantsNum: number;
  date: string;
  startTime: string;
  endTime: string;
  editPassword: string;
}

// PATCH /api/bookings/:id 修改內容（後端只接受這些欄位）
export interface BookingUpdatePayload {
  title: string;
  participantsNum: number;
  room: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface DateRange {
  from: string; // ISO
  to: string; // ISO
}

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

export interface BookingResponseBody {
  success?: boolean;
  message?: string;
  error?: string;
  bookedRooms?: string[];
  conflicts?: unknown[];
}

export interface BookingApiResponse {
  ok: boolean;
  status: number;
  body: BookingResponseBody;
}

export interface ConfirmModalConfig {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmColor: string;
  iconColor: string;
}
