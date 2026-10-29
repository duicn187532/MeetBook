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

Log 以 JSON 輸出到 stdout/stderr，部署後可在 Deno Deploy 的 Logs 頁面查詢；`editPassword` 等欄位會自動遮蔽。

### API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| GET | `/healthz` | 健康檢查 |
| GET | `/api/bookings/:room?from=ISO&to=ISO` | 取得指定會議室（可省略）在區間內、未取消的預約。未帶 `from`/`to` 時預設為過去 90 天到未來 180 天，單次最多 400 天 |
| POST | `/api/bookings` | 新增預約，`room` 可為陣列（同步預約多間）；任一間衝突則整筆不寫入 |
| PATCH | `/api/bookings/:id/:editPassword?` | 修改或取消（body `{ "cancelled": true }`）預約 |

- GET 只回傳畫面需要的欄位：不含行編、編輯密碼、部門／組別代碼。
- PATCH 只接受 `title`、`participantsNum`、`room`、`startTime`、`endTime`、`cancelled`，其他欄位會被忽略。
- 多會議室預約共用 `groupId`：修改時間／名稱／人數會同步到同組所有會議室並一起檢查衝突；取消只取消該間。
- 新增與修改的「衝突檢查 + 寫入」在 MongoDB 交易中進行，並對每間相關會議室的 `roomLocks` 文件寫入一次，讓同時操作同一間會議室的請求互斥，避免重複預約。

### 測試

```bash
deno task test    # 單元測試
deno task check   # 型別檢查
deno lint && deno fmt --check
```

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

前端依目前畫面（日／週／三個月的月檢視）計算查詢區間，切換月份時才會重新向後端取資料。

## CI

`.github/workflows/ci.yml` 在 push 到 `main` 與 PR 時執行：後端 fmt / lint / 型別檢查 / 測試，前端 lint / build。
