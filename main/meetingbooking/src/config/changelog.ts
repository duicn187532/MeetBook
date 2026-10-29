// 更新日誌：新的放最前面。新增一筆（新的 id）後，沒看過的使用者會在開啟時看到一次
export interface ChangelogItem {
  text: string;
  experimental?: boolean; // 顯示「實驗性功能」標籤
}

export interface ChangelogEntry {
  id: string; // 唯一代號，建議用日期
  date: string;
  sections: { title: string; items: ChangelogItem[] }[];
}

export const changelog: ChangelogEntry[] = [
  {
    id: "2026-10-30",
    date: "2026/10/30",
    sections: [
      {
        title: "新功能",
        items: [
          {
            text: "新增「Today」分頁（會議室分頁最右邊）：一次查看三間會議室現在是否使用中、還空閒多久，以及今日時間表；按卡片上的「＋」可直接預約該會議室最近的空檔。此功能尚未與設計師討論，畫面之後可能調整。",
            experimental: true,
          },
        ],
      },
      {
        title: "改善",
        items: [
          { text: "時段衝突時會列出重疊的預約，並建議同時段有空的會議室或當天最近的空檔。" },
          { text: "修改預約失敗（密碼錯誤、時段衝突）時，已填的內容會保留，錯誤原因直接顯示在修改視窗。" },
          { text: "在預約資訊輸入的編輯密碼，進入修改時會自動帶入，不用再輸入一次。" },
          { text: "會記住上次選擇的會議室、檢視模式與預約時輸入的行編。" },
          { text: "新增預約的預設時間改為下一個整點或半點，時間以 5 分鐘為單位選擇。" },
          { text: "切換會議室不需要重新讀取，畫面立即切換。" },
          { text: "手機可在行事曆上左右滑動切換日、週、月。" },
          { text: "同時預約多間會議室時，預約資訊會顯示同組的會議室；刪除前會提醒只取消該間。" },
          { text: "短會議顯示更清楚；月檢視一天超過 4 場時以「+N」表示。" },
          { text: "預約資料載入失敗時會跳出提示，避免誤以為沒有人預約。" },
        ],
      },
    ],
  },
];
