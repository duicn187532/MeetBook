-- MeetBook D1 初始資料表
-- 時間一律存 UTC epoch 毫秒（INTEGER）；沒有值的舊資料存 NULL。
-- 與 MongoDB 的對應見 main/worker/README.md「資料表設計」。

-- 預約（對應 MongoDB 的 booked collection）
CREATE TABLE bookings (
  id TEXT NOT NULL PRIMARY KEY,
  -- 同一次預約多間會議室時共用；舊資料沒有
  group_id TEXT,
  -- 預約送出時間；非常舊的資料沒有
  created_time INTEGER,
  updated_time INTEGER,
  title TEXT NOT NULL DEFAULT '',
  -- 預約者：user 是物件時以下 6 欄都有值（缺的欄位存空字串），user_raw 為 NULL；
  -- 非常舊的資料 user 是字串時存在 user_raw，以下 6 欄為 NULL；沒有 user 時全部為 NULL
  user_id TEXT,
  user_name TEXT,
  user_extension TEXT,
  user_department_code TEXT,
  user_department_label TEXT,
  user_group_code TEXT,
  user_group_label TEXT,
  user_raw TEXT,
  room TEXT NOT NULL,
  -- 不是數字的舊資料存 NULL
  participants_num REAL,
  -- 1 = 已取消、0 = 有效；NULL = 舊資料沒有 cancelled 欄位
  -- （MongoDB 的 cancelled: false 條件不會選到這種資料，查詢 cancelled = 0 時同樣不會選到）
  cancelled INTEGER CHECK (cancelled IN (0, 1)),
  start_time INTEGER NOT NULL,
  end_time INTEGER NOT NULL,
  edit_password TEXT NOT NULL DEFAULT '',
  updated_count INTEGER NOT NULL DEFAULT 0,
  -- 台北日期 YYYY-MM-DD（LINE 快速查詢以此篩選今天）
  date TEXT NOT NULL DEFAULT '',
  -- 同組其他會議室，JSON 陣列文字，例如 ["A102","A103"]
  is_multi TEXT NOT NULL DEFAULT '[]'
);

-- 衝突檢查（某會議室、未取消、與時段重疊）：以 end_time 為範圍條件，只會掃到結束時間在新時段開始之後的預約，
-- 不必掃過該會議室全部的歷史資料（D1 依掃描列數計費）
CREATE INDEX bookings_room_active_end ON bookings (room, cancelled, end_time);
-- 前端與 LINE 查詢區間內所有會議室的預約
CREATE INDEX bookings_active_end ON bookings (cancelled, end_time);
-- 同組預約（只有多會議室預約才有 group_id，與 MongoDB 的 sparse 索引相同）
CREATE INDEX bookings_group ON bookings (group_id) WHERE group_id IS NOT NULL;

-- 使用者（對應 MongoDB 的 users collection）
CREATE TABLE users (
  -- 行編在 MongoDB 沒有唯一限制，舊資料可能重複，因此另設流水號主鍵並保留匯入順序
  seq INTEGER PRIMARY KEY,
  id TEXT NOT NULL,
  -- 沒填姓名時為 NULL（與既有資料相同）
  name TEXT,
  extension TEXT NOT NULL DEFAULT '',
  department_code TEXT NOT NULL DEFAULT '',
  department_label TEXT NOT NULL DEFAULT '',
  group_code TEXT NOT NULL DEFAULT '',
  group_label TEXT NOT NULL DEFAULT '',
  email TEXT,
  line_id TEXT,
  role_code TEXT NOT NULL DEFAULT '',
  role_label TEXT NOT NULL DEFAULT '',
  -- 1 = 啟用、0 = 停用；NULL = 舊資料沒有 status 欄位（視為啟用）
  status INTEGER CHECK (status IN (0, 1)),
  -- 早期管理後台寫入的停用標記：1 = 停用
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_time INTEGER,
  updated_time INTEGER
);

CREATE INDEX users_id ON users (id);
CREATE INDEX users_extension ON users (extension);

-- 管理後台登入失敗次數（取代原本存在記憶體的 LoginLimiter）
-- source 為來源 IP；'*' 代表所有來源合計
CREATE TABLE admin_login_attempts (
  source TEXT NOT NULL PRIMARY KEY,
  fails INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
