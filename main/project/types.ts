import type { ObjectId } from "mongodb";

export interface LabelCode {
  code: string;
  label: string;
}

// 資料庫中儲存的完整使用者資訊（只在後端使用）
export interface UserInfo {
  id: string;
  name: string;
  extension: string;
  department: LabelCode;
  group: LabelCode;
}

export interface UserDoc {
  _id?: ObjectId;
  id: string;
  name?: string;
  extension?: string;
  department?: LabelCode;
  group?: LabelCode;
}

export interface BookingDoc {
  _id?: ObjectId;
  id: string;
  // 同一次預約多間會議室時共用；舊資料沒有此欄位
  groupId?: string;
  createdTime: Date;
  updatedTime?: Date;
  title: string;
  // 非常舊的資料可能是字串
  user: UserInfo | string;
  room: string;
  participantsNum: number;
  cancelled: boolean;
  // 舊版 PATCH 會把 ISO 字串直接寫入，因此可能是字串
  startTime: Date | string;
  endTime: Date | string;
  editPassword: string;
  updatedCount: number;
  date: string;
  // 同組其他會議室
  isMulti: string[];
}

export interface RoomLockDoc {
  _id: string;
  version: number;
}

// 對外公開的使用者資訊：不含部門／組別代碼；沒有姓名時 name 為行編後 4 碼
export interface PublicUser {
  name: string;
  extension: string;
  department: { label: string };
  group: { label: string };
}

export interface PublicBooking {
  id: string;
  title: string;
  user: PublicUser;
  room: string;
  participantsNum: number;
  startTime: Date | string;
  endTime: Date | string;
  date: string;
  updatedCount: number;
  isMulti: string[];
}
