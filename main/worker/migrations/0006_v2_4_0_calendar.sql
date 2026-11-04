-- v2.4.0 更新日誌補上「加到行事曆」（併入 v2.4.0，不另開新版號）
-- 加在「新功能」區塊最後；找不到 v2.4.0 或「新功能」區塊、或已經有這一項（例如已在後台手動加入）時不變動
UPDATE changelog
SET sections = json_insert(
      sections,
      '$[' || (SELECT key FROM json_each(changelog.sections) WHERE json_extract(value, '$.title') = '新功能' LIMIT 1) || '].items[#]',
      json('{"text":"預約後可以加到行事曆：在預約成功視窗或預約資訊視窗點日曆圖示，選擇加到 Google 行事曆，或把行事曆檔寄到自己的公司信箱，點開附件即可加入公司行事曆。AI 預約完成頁與 LINE 預約成功回覆也有相同功能。"}')
    ),
    updated_time = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE version = 'v2.4.0'
  AND EXISTS (SELECT 1 FROM json_each(changelog.sections) WHERE json_extract(value, '$.title') = '新功能')
  AND sections NOT LIKE '%加到行事曆%';
