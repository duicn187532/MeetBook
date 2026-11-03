-- 預約來源：web（網站）、line（LINE 快速預約）、ai-link（AI 助理產生的預約連結，/b）、mcp（AI 連接器，/mcp）
-- NULL 為加上這個欄位之前的預約（管理後台顯示「未記錄」）；只在新增時寫入，修改預約不會改變來源
ALTER TABLE bookings ADD COLUMN source TEXT;
