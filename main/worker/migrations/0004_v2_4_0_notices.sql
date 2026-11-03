-- v2.4.0 更新日誌與「用 AI 預約」公告（部署時寫入；之後可在管理後台修改或刪除）
-- 已存在（例如已在後台手動新增）時不覆蓋
INSERT OR IGNORE INTO changelog (version, date, sections, created_time, updated_time) VALUES
  ('v2.4.0', '2026-11-04', '[{"title":"新功能","items":[{"text":"可以請 AI 助理預約會議室：在 ChatGPT 或 Claude（免費版也可以）開一個新對話，貼上 https://meetbook.pages.dev/ai 並說出需求，AI 會查空檔並給你預約連結，點開後按「確認預約」就完成。"},{"text":"使用可以新增連接器的 Claude 等 AI 工具時，也可以把 https://meetbook.pages.dev/mcp 加為連接器，直接在對話中查詢與預約。","experimental":true},{"text":"在 LINE 官方帳號傳送「ai」，可以看到上面兩種方式的設定教學；傳送其他看不懂的文字時，會列出可以使用的指令。"},{"text":"網站開啟時會顯示公告。"}]},{"title":"改善","items":[{"text":"公司網路也能正常使用預約系統。"},{"text":"再點一次目前的分頁重新讀取時，會立即顯示藍色更新條。"},{"text":"網頁放在背景（切到其他分頁或 App）時暫停自動更新，切回來時馬上更新成最新的預約。"}]}]', 1793721600000, 1793721600000);

INSERT OR IGNORE INTO announcements (id, title, body, start_date, end_date, created_time, updated_time) VALUES
  ('ai-booking-2026-11', '可以用 AI 預約會議室了', '在 ChatGPT 或 Claude（免費版也可以）開一個新對話，貼上：
https://meetbook.pages.dev/ai
再說出需求，例如「明天下午 Beta 一小時，行編 xxxx」。
AI 會查空檔並給你一個預約連結，點開後按「確認預約」就完成。

編輯密碼請在確認頁自己設定，不要告訴 AI。
詳細教學：在 LINE 官方帳號傳送「ai」。', '2026-11-04', '2026-11-17', 1793721600000, 1793721600000);
