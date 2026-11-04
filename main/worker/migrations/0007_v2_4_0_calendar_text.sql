-- v2.4.0 更新日誌「加入行事曆」說明改為目前的做法（點日曆圖示開啟 .ics 行事曆檔）
-- 只在內容仍是 0006 寫入的原文時取代；已在後台改過的不動
UPDATE changelog
SET sections = (
      SELECT json_set(changelog.sections, '$[' || s.key || '].items[' || i.key || '].text',
        '預約後可以加入行事曆：在預約成功視窗或預約資訊視窗點日曆圖示，iPhone 會直接顯示「加入行事曆」；在公司電腦點開下載的檔案即可加入公司行事曆。AI 預約完成頁與 LINE 預約成功回覆也有相同功能。')
      FROM json_each(changelog.sections) s, json_each(s.value, '$.items') i
      WHERE json_extract(i.value, '$.text') = '預約後可以加到行事曆：在預約成功視窗或預約資訊視窗點日曆圖示，即可分享 ics 行事曆檔（寄到自己的公司信箱，點開附件即可加入公司行事曆）。AI 預約完成頁與 LINE 預約成功回覆也有相同功能。'
      LIMIT 1
    ),
    updated_time = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE version = 'v2.4.0'
  AND EXISTS (
    SELECT 1 FROM json_each(changelog.sections) s, json_each(s.value, '$.items') i
    WHERE json_extract(i.value, '$.text') = '預約後可以加到行事曆：在預約成功視窗或預約資訊視窗點日曆圖示，即可分享 ics 行事曆檔（寄到自己的公司信箱，點開附件即可加入公司行事曆）。AI 預約完成頁與 LINE 預約成功回覆也有相同功能。'
  );
