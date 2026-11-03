# MeetBook

會議室預約系統：前端 React + Vite（部署在 GitHub Pages），後端 Deno + Oak + MongoDB Atlas（部署在 Deno Deploy）。

> **後端已遷移到 Cloudflare Workers + D1**（`main/worker`）。網站與管理後台使用 `https://meetbook.pages.dev`（Cloudflare Pages 入口，轉給 Worker；公司網路擋 `*.workers.dev`，見 `main/pages-entry`），LINE webhook 使用 `https://meetbook.duicn187532.workers.dev/line/webhook`。
> 正式切換的步驟與回復方式見 [`main/worker/README.md` 的「正式切換」](main/worker/README.md#正式切換)。
> 切換完成並穩定後，會移除下方 Deno 後端的說明與程式。

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

### LINE 官方帳號（快速查詢／快速預約／ai）

使用者在官方帳號（含群組）傳送：

- `快速查詢`：回覆今天各會議室的預約（沒有預約的會議室不列出）。
- `快速預約`：回覆填寫說明與一份預約模板（開始時間帶入現在時間），使用者複製模板填好後送出即預約今天的時段。
  - 欄位：會議名稱（空白為「臨時會議」）、開始時間（24 小時制，接受 `14:30`、`14：30`、`1430`）、會議時長（半小時為單位，`0.5hr`、`1hr`、`1.5小時`、`30分`）、預約人（行編，檢查碼可省略）、會議室（`A`／`B`／`S`，大小寫皆可，可填多間如 `A S`）。
  - 只能預約今天 08:45–18:15 之間；開始時間可比現在早 15 分鐘內（模板帶入的是傳送時間）。
  - 成功時回覆一組隨機 4 位數編輯密碼，供在網頁修改或取消；衝突時列出占用的預約。
- `ai`（也接受 `AI`、全形 `Ａｉ`、`ai預約`、`ai教學`、`ai設定`）：回覆三則用 AI 預約的設定教學（Worker 版才有）。
  - 方法一：在 ChatGPT、Claude（免費版也可以）貼上 `https://meetbook.pages.dev/ai`，並說明用 AI 預約的優點（例如同一個對話會記得行編與習慣）。
  - 範本：可以長按複製、貼到 AI 對話中填寫的訊息（行編、常用會議室與人數、這次想預約的內容）。
  - 方法二：把 `https://meetbook.pages.dev/mcp` 加為連接器。
- 其他訊息：一對一聊天時回覆可用的指令（含 `ai`）；群組中不回覆，避免打擾（Worker 版）。LINE 重送（redelivery）的事件會略過，避免重複預約。

解析與回覆文字在 `line_bot.ts`（有單元測試），webhook 在 `line_webhook.ts`，寫入沿用網頁的 `createBooking`（同一套衝突檢查與交易）。

設定（需要官方帳號管理權限）：

1. LINE Developers → 該官方帳號的 Messaging API channel：取得 Channel secret（Basic settings）與 Channel access token（Messaging API，long-lived）。
2. Deno Deploy → Environment Variables 新增 `LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`（設為 secret，Production 與 Development 都勾選）。
3. LINE Developers → Messaging API → Webhook URL 設為 `https://meetbook.duicn187532.workers.dev/line/webhook`（Cloudflare Worker；切換前為 `https://meetingbooking.duicn187532.deno.net/line/webhook`），按 Verify，並開啟 Use webhook。
4. LINE Official Account Manager → 關閉「自動回應訊息」（否則會多一則預設回覆）；圖文選單的按鈕設為傳送文字 `快速查詢`／`快速預約`／`ai`。

### 管理後台（/admin）

只給管理員用的手機網頁，入口是 `https://<後端網域>/admin`，前端網站上沒有任何連結。

- **啟用方式**：在 Deno Deploy 的環境變數加上 `ADMIN_PASSWORD`（至少 8 個字元）。沒設定或太短時，所有 `/admin` 路徑一律回 404，一般使用者完全看不到。
- **使用統計**：預約數、使用時數、整體使用率、取消率、各會議室使用率、平日熱門時段、各部門使用時數、預約最多的人。使用率只計算平日 08:45–18:15 的可預約時段（未扣除國定假日）。
- **預約紀錄**：依預約送出時間列出（含已取消），可選今天／近 7 天／本月／上月／自訂區間；可搜尋會議名稱、預約人、行編、分機，依會議室與狀態（有效、已取消、修改過、一次訂多間）篩選，並切換依送出時間或會議時間排序；點一筆可看明細。一次最多 5,000 筆。
- **預約來源**（Worker 版）：每筆新預約記錄來源（網站、LINE、AI 連結 `/b`、AI 連接器 `/mcp`），預約紀錄可依來源篩選，卡片與明細會顯示。加上來源欄位之前的預約顯示「未記錄」；修改預約不會改變來源（`migrations/0005_booking_source.sql`）。
- **使用者名單**：搜尋、新增、修改姓名／分機／部門／組別、停用或重新啟用。姓名為選填。部門與組別是固定的對應（金融科技部：創新研發、數據分析；數位策略部：個人產品、法人產品；數位行銷部：行銷推廣、維運管理），以代碼為準，定義在 `admin_rules.ts` 的 `ORG`。停用的人（`status: false`）無法再從網站或 LINE 預約，過去的預約紀錄保留。
- **公告**：新增、修改、刪除網站的公告與更新日誌（Cloudflare Worker 版才有；見前端說明的「公告與更新日誌」）。
- **安全性**：登入後以 HttpOnly + SameSite=Strict cookie 維持 8 小時；同一來源 15 分鐘內失敗 5 次即暫停，全部來源合計 30 次也會暫停；修改資料的請求需帶 `X-Admin` 標頭；更換 `ADMIN_PASSWORD` 會讓所有已登入的裝置立即登出。

### 用 AI 助理查詢與預約（/ai、/b）

同事在 ChatGPT、Claude 等 AI 助理（免費版也可以）開一個新對話，貼上 `https://meetbook.pages.dev/ai`，就能請 AI 查空檔並產生預約連結；點開連結、在確認頁按一下就完成預約。

- `GET /ai`（`main/worker/src/ai.ts`）：給 AI 讀的純文字說明，內容包括：
  - 現在時間、會議室、預約規則
  - 未來 10 個工作日的空檔（不含預約者與會議名稱）
  - 之後 20 個工作日的詳細網址
  - 如何產生預約連結
- `GET /ai/day/YYYY-MM-DD`：某天各會議室的空檔與預約，資料與網站公開的相同（預約者只顯示姓名，沒有姓名時顯示行編後 4 碼），不含行編與編輯密碼。只能查 31 天前到 180 天後。
- 免費版 ChatGPT 通常只能開啟使用者貼的網址，或已讀取頁面中出現的網址，所以每天的詳細網址都列在 `/ai` 上，空檔也直接寫在 `/ai`，只讀一頁就夠用。
- 預約連結：`https://meetbook.pages.dev/b?room=Beta&date=2026-11-05&start=14:00&end=15:00&title=週會&people=6&user=5977`（`main/worker/src/book_page.ts`）。
  - **打開連結不會預約**：連結預覽、資安掃描只會讀取頁面。確認頁只有幾 KB，外觀沿用網站，打開時先檢查時段與預約人。
  - 使用者按「確認預約」才以網站相同的 `createBooking` 預約；成功後轉到 `/b/ok` 結果頁，重新整理不會重複送出。
  - **編輯密碼不放在連結中**（會留在 AI 對話紀錄與瀏覽紀錄），由使用者在確認頁自行填寫；不填則與網站相同，任何人都能修改，結果頁會提醒。
- 回應標頭為 `Cache-Control: no-store` 與 `X-Robots-Tag: noindex`；`/robots.txt` 只允許 `/ai`。

使用範例：「請閱讀 https://meetbook.pages.dev/ai ，幫我找明天下午 Beta 一小時的空檔，並產生預約連結」。
### AI 助理預約（MCP 伺服器，/mcp）

給有付費版 AI（可新增連接器）的使用者的另一種方式；免費版請用上面的 `/ai`。

讓支援 MCP（Model Context Protocol）的 AI 助理（例如 Claude）用對話查詢與預約會議室。網址：`https://meetbook.pages.dev/mcp`（Cloudflare Worker 版才有，程式在 `main/worker/src/mcp.ts`）。

- **第一階段只能查詢與預約**，不能修改或取消（請到網站，用預約時取得的編輯密碼）。
- 工具：`list_rooms`（會議室、座位、設備與規則）、`list_bookings`（某天或連續幾天的預約）、`find_free_slots`（空檔）、`create_booking`（預約）。
- 與網站相同不需登入；預約一樣要提供已登記、未停用的行編（檢查碼可省略），沿用網站的防止重複預約。查詢結果與網站公開的資料相同（預約者只顯示姓名，沒有姓名時顯示行編後 4 碼），不含編輯密碼。
- 另外檢查：只能預約週一到週五 08:45–18:15、時間以 5 分鐘為單位、不能預約已經過去的時段、180 天內。編輯密碼不自動產生：使用者主動提供才設定，回覆中不重複密碼；沒提供時與網站相同不設密碼，並提醒任何人都能修改。
- 連線方式：
  - Claude（網頁版或 App）：設定 → Connectors（連接器）→ 新增自訂連接器，網址填 `https://meetbook.pages.dev/mcp`，不需要驗證；能否新增自訂連接器依 Claude 方案而定。
  - Claude Code：`claude mcp add --transport http meetbook https://meetbook.pages.dev/mcp`
- 協定：Streamable HTTP 的無狀態模式（每個 POST 回一個 JSON，不使用 session 與 SSE；GET 回 405）。

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
```

**部署**：合併到 `main` 後，GitHub Actions（`.github/workflows/deploy-frontend.yml`）會自動建置並發佈到 gh-pages，不需要在電腦上執行任何指令；也可以在 GitHub 的 Actions 頁面手動執行「Deploy frontend」。後端網址預設為正式環境，要換網址時到 repo 的 Settings → Secrets and variables → Actions → Variables 設定 `VITE_API_URL`。需要時仍可在本機用 `npm run deploy` 手動發佈。

前端一次取得所有會議室約 5 個月（前 1 個月 ~ 後 3 個月）的預約，切換會議室不需重新讀取；只有目前畫面需要的區間（月檢視 3 個月、日／週檢視前後再加 3 週）超出已讀取的範圍時，才以目前日期重新讀取。再點一次目前的會議室分頁（或 LIVE）會手動重新讀取。手機左右滑動換頁時畫面會跟著手指移動（`src/hooks/useSwipe.ts`）。衝突時的替代建議（其他有空的會議室、當天最近的空檔）以已載入的資料推算，僅供參考，實際仍以後端檢查為準。

開啟網站一律從 LIVE 分頁開始。使用者上次選的會議室、檢視模式與預約成功時的行編會存在瀏覽器 localStorage（`meetbook.*`），切到會議室分頁時沿用；localStorage 不能用時改存 sessionStorage（只在這次開啟有效），都不能用也不影響使用。

**LIVE 分頁**：會議室分頁最左邊，依設計稿實裝。以已載入的資料顯示三間會議室在選定工作日的狀況：上方可切換前後工作日，黃色摘要顯示資料更新時間、可預約與使用中的會議室數量；每張卡片列出還能預約的時段（例如「14:00前 · 16:30 後可預約」，至少 15 分鐘才列出）與 09:00–18:00 的時間軸。每 30 秒更新時間、每 5 分鐘重新取得資料；頁面看不到時（背景分頁、縮到最小、手機切到其他 App）暫停，回到頁面時若資料超過 1 分鐘沒更新會立即重新取得（各分頁皆同，`src/hooks/usePageVisible.ts`）。按卡片進入該會議室的週檢視；「立即預約」帶入該日最近一段至少 15 分鐘的空檔（最長 1 小時）。狀態與文字邏輯在 `src/utils/todayStatus.ts`，畫面在 `src/components/TodayOverview.tsx`。英數字型為 DM Sans（`@fontsource/dm-sans`，打包進網站），中文與日期用系統字型。

**只有工作日**：週六、週日不上班。週檢視與日檢視只顯示週一到週五，左右切換、滑動與 LIVE 都會跳過週末，週末開啟網站時從下週一開始；新增與修改預約的日期選擇器不能選週末（`src/utils/workdays.ts`）。後端也會拒絕開始時間（台北時間）在週末的新預約或改期，LINE 快速預約在週末會直接回覆不開放；既有的週末預約仍可改名稱、人數或取消。

**公告與更新日誌**：內容由管理後台（`/admin` →「公告」）維護，存在 D1，開啟網站時以 `GET /api/notices` 讀取（`src/config/notices.ts`）。沒看過、且在公告期間內的項目會跳出一次：先顯示公告，按「知道了」後再顯示更新日誌。
- **公告**：標題、內容（可換行）、開始日與結束日（台北時間，含當天；新增時預設 7 天）。看過的公告 id 記在 `meetbook.announcementsSeen`。
- **更新日誌**：一個版本一筆（版號為代號，建立後不能修改），改版日（台北時間）起 7 天內跳出；記錄看過的最新一筆版號（`meetbook.changelogSeen`）。版號為 `主版號.次版號.修訂號`：整體改版加主版號、新功能或一批改善加次版號、只有修正加修訂號。
- 修改已發佈的內容不會讓看過的人再看一次；讀取失敗時不顯示，不影響預約。視窗底部固定顯示聯絡窗口（#51164 祐晨）。

## CI

`.github/workflows/ci.yml` 在 push 到 `main` 與 PR 時執行：後端 fmt / lint / 型別檢查 / 單元測試、以 MongoDB replica set 跑衝突檢查整合測試，前端 lint / build。
