# MeetBook

會議室預約系統：前端 React + Vite（部署在 GitHub Pages），後端 Deno + Oak + MongoDB Atlas（部署在 Deno Deploy）。

```
main/
├── meetingbooking/   前端（React 19、MUI DatePicker、Tailwind）
└── project/          後端（Deno 2、Oak、MongoDB driver）
```

## 後端（main/project）

### 本地開發

```bash
cd main/project
cp .env.development.example .env.development   # 填入 MONGODB_URI 等
deno task dev                                   # http://localhost:8080
```

| 環境變數 | 說明 |
| --- | --- |
| `ENV` | `production` 時只讀平台環境變數、CORS 限制為 GitHub Pages；其他值會載入 `.env.development` |
| `MONGODB_URI` | MongoDB 連線字串（必填，需為 replica set，Atlas 預設即是） |
| `DB_NAME` | 資料庫名稱，預設 `todo_db` |
| `LOG_LEVEL` | `debug` / `info` / `warning` / `error`，預設 `info` |
| `PORT` | 監聽埠，預設 `8080` |
| `LINE_CHANNEL_SECRET` / `LINE_CHANNEL_ACCESS_TOKEN` | LINE 官方帳號 Messaging API（選填，見下方「LINE 官方帳號」） |

Log 以 JSON 輸出到 stdout/stderr，部署後可在 Deno Deploy 的 Logs 頁面查詢；`editPassword` 等欄位會自動遮蔽。

### API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/healthz` | 健康檢查 |
| GET | `/api/bookings/:room?from=ISO&to=ISO` | 取得指定會議室（可省略）在區間內、未取消的預約。未帶 `from`/`to` 時預設為過去 90 天到未來 180 天，單次最多 400 天 |
| POST | `/api/bookings` | 新增預約，`room` 可為陣列（同步預約多間）；任一間衝突則整筆不寫入 |
| PATCH | `/api/bookings/:id/:editPassword?` | 修改或取消（body `{ "cancelled": true }`）預約 |
| POST | `/line/webhook` | LINE 官方帳號 webhook（驗證 `X-Line-Signature`） |

- GET 只回傳畫面需要的欄位：不含編輯密碼、`_id`、部門／組別代碼；預約者沒有姓名時 `user.name` 以行編後 4 碼代替。
- PATCH 只接受 `title`、`participantsNum`、`room`、`startTime`、`endTime`、`cancelled`，其他欄位會被忽略。
- 多會議室預約共用 `groupId`：修改時間／名稱／人數會同步到同組所有會議室並一起檢查衝突；取消只取消該間。
- 新增與修改的「衝突檢查 + 寫入」在 MongoDB 交易中進行，並對每間相關會議室的 `roomLocks` 文件寫入一次，讓同時操作同一間會議室的請求互斥，避免重複預約。

### LINE 官方帳號（快速查詢／快速預約）

使用者在官方帳號（含群組）傳送：

- `快速查詢`：回覆今天各會議室的預約（沒有預約的會議室不列出）。
- `快速預約`：回覆填寫說明與一份預約模板（開始時間帶入現在時間），使用者複製模板填好後送出即預約今天的時段。
  - 欄位：會議名稱（空白為「臨時會議」）、開始時間（24 小時制，接受 `14:30`、`14：30`、`1430`）、會議時長（半小時為單位，`0.5hr`、`1hr`、`1.5小時`、`30分`）、預約人（行編，檢查碼可省略）、會議室（`A`／`B`／`S`，大小寫皆可，可填多間如 `A S`）。
  - 只能預約今天 08:45–18:15 之間；開始時間可比現在早 15 分鐘內（模板帶入的是傳送時間）。
  - 成功時回覆一組隨機 4 位數編輯密碼，供在網頁修改或取消；衝突時列出占用的預約。
- 其他訊息不回覆。LINE 重送（redelivery）的事件會略過，避免重複預約。

解析與回覆文字在 `line_bot.ts`（有單元測試），webhook 在 `line_webhook.ts`，寫入沿用網頁的 `createBooking`（同一套衝突檢查與交易）。

設定（需要官方帳號管理權限）：

1. LINE Developers → 該官方帳號的 Messaging API channel：取得 Channel secret（Basic settings）與 Channel access token（Messaging API，long-lived）。
2. Deno Deploy → Environment Variables 新增 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`（設為 secret，Production 與 Development 都勾選）。
3. LINE Developers → Messaging API → Webhook URL 設為 `https://meetingbooking.duicn187532.deno.net/line/webhook`，按 Verify，並開啟 Use webhook。舊伺服器的 webhook 會被取代。
4. LINE Official Account Manager → 關閉「自動回應訊息」（否則會多一則預設回覆）；圖文選單的按鈕設為傳送文字 `快速查詢`／`快速預約`。

### 測試

```bash
deno task test    # 單元測試
# 衝突檢查整合測試（需要 MongoDB replica set，未設定 MONGODB_TEST_URI 時略過）
MONGODB_TEST_URI="mongodb://localhost:27017/?replicaSet=rs0" deno task test:integration
deno task check   # 型別檢查
deno lint && deno fmt --check
```

### 資料整理：字串時間轉回 Date

舊版修改預約時會把 `startTime` / `endTime` 存成 ISO 字串，造成衝突檢查漏掉這些預約（目前程式已能同時比對兩種型別）。`scripts/migrate_string_times.ts` 會把它們轉回 Date：

```bash
cd main/project
deno task migrate:times           # 預覽：列出會轉換幾筆，不寫入
deno task migrate:times --apply   # 實際寫入；寫入前會產生 migration-backup-*.json（已被 .gitignore 排除）
```

連線設定同後端：`ENV=production` 時讀取 `MONGODB_URI`、`DB_NAME` 環境變數，否則讀取 `.env.development`。可重複執行；無法解析的值會列出並略過。

### 部署到 Deno Deploy

App：`duicn187532/meetingbooking`（https://meetingbooking.duicn187532.deno.net）

1. App Settings 已連結 GitHub：Root directory 設為 `main/project`，Entrypoint 為 `server.ts`。push 到正式分支即部署；其他分支會產生 preview。
2. App Settings → Environment Variables 設定 `ENV=production`、`MONGODB_URI`、`DB_NAME`（`MONGODB_URI` 設為 secret）。**Production 與 Development 兩個 context 都要勾選**：建置時的 warm up 跑在 preview（Development context），缺變數時預覽環境會連不到資料庫。
3. MongoDB Atlas → Network Access 需允許 Deno Deploy 連線（Deno Deploy 沒有固定 IP，通常需開放 `0.0.0.0/0`，請搭配強密碼）。

服務啟動時不等待資料庫，連不上時 API 回 503、log 會記錄 `MongoDB 連線失敗` 與真正原因，資料庫恢復後自動重連。部署後確認：

```bash
curl https://meetingbooking.duicn187532.deno.net/healthz   # {"ok":true,"db":"ok"}
```

log 中重複出現的 `oak send() does not work under Node.js.` 是 oak 的無害警告，可忽略。

## 前端（main/meetingbooking）

```bash
cd main/meetingbooking
cp .env.example .env     # 設定 VITE_API_URL（結尾要有 /）
npm ci
npm run dev
npm run deploy           # build 後發佈到 gh-pages 分支
```

前端依目前畫面（日／週／三個月的月檢視）計算查詢區間，一次取得所有會議室的預約，切換會議室不需重新讀取，切換月份時才會重新向後端取資料。衝突時的替代建議（其他有空的會議室、當天最近的空檔）以已載入的資料推算，僅供參考，實際仍以後端檢查為準。

使用者上次選的會議室、檢視模式與預約成功時的行編會存在瀏覽器 localStorage（`meetbook.*`）；localStorage 不能用時改存 sessionStorage（只在這次開啟有效），都不能用也不影響使用。

**Today 分頁（實驗性功能，尚未與設計師討論）**：會議室分頁最右邊。以已載入的資料計算三間會議室現在的狀態（使用中／N 分鐘後開始（15 分鐘內）／空閒／今日已結束）與今日時間表，每 30 秒更新時間、每 5 分鐘重新取得資料。卡片的「＋」會帶入該會議室與今天最近一段至少 15 分鐘的空檔（最長 1 小時）。狀態邏輯在 `src/utils/todayStatus.ts`。

**更新日誌**：`src/config/changelog.ts`，新的放最前面。新增一筆（新的 `id`）後，沒看過的使用者開啟網站時會看到一次（以 `meetbook.changelogSeen` 記錄）。

## CI

`.github/workflows/ci.yml` 在 push 到 `main` 與 PR 時執行：後端 fmt / lint / 型別檢查 / 單元測試、以 MongoDB replica set 跑衝突檢查整合測試，前端 lint / build。
