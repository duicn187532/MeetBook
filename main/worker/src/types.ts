// 與 Deno 版相同的資料結構：D1 的資料列讀出後轉成這些型別（見 db.ts），
// 讓預約規則、後台統計等純函式可以原樣沿用
export interface LabelCode {
  code: string;
  label: string;
}

// 預約中儲存的使用者資訊
export interface UserInfo {
  id: string;
  name: string;
  extension: string;
  department: LabelCode;
  group: LabelCode;
}

export interface UserDoc {
  seq?: number;
  id: string;
  name?: string | null;
  extension?: string;
  department?: LabelCode;
  group?: LabelCode;
  email?: string | null;
  lineId?: string | null;
  role?: LabelCode;
  // false 代表停用，無法預約；舊資料沒有此欄位，視為啟用
  status?: boolean | null;
  // 管理後台早期版本寫入的停用標記，讀取時一併視為停用，修改時會改寫成 status
  disabled?: boolean;
  createdTime?: Date;
  updatedTime?: Date;
}

export interface BookingDoc {
  id: string;
  // 同一次預約多間會議室時共用；舊資料沒有此欄位
  groupId?: string;
  createdTime?: Date;
  updatedTime?: Date;
  title: string;
  // 非常舊的資料可能是字串；沒有預約者時為 undefined
  user?: UserInfo | string;
  room: string;
  // 舊資料可能不是數字（讀出時為 undefined）
  participantsNum?: number;
  // 舊資料沒有 cancelled 欄位時為 undefined（不算有效預約，也不算已取消）
  cancelled?: boolean;
  // D1 讀出的一律是 Date；保留字串型別讓 Deno 版的單元測試（舊資料情境）原樣沿用
  startTime: Date | string;
  endTime: Date | string;
  editPassword: string;
  updatedCount: number;
  date: string;
  // 同組其他會議室
  isMulti: string[];
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
