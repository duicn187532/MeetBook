-- 原子寫入用的檢查表（見 src/db.ts 的 atomicWrites）
-- 每一句條件式寫入後執行 INSERT OR REPLACE INTO write_guard (id, ok) VALUES (1, changes() = 1)：
-- 前一句沒有寫入剛好 1 列時 ok = 0，違反 write_conflict 條件，整批（db.batch）回復。
-- 只會有 id = 1 這一列。
CREATE TABLE write_guard (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  ok INTEGER NOT NULL,
  CONSTRAINT write_conflict CHECK (ok = 1)
);
