# MeetBook 後端（Cloudflare Workers + D1）

> 遷移進行中。這個 Worker 部署在 `https://meetbook.duicn187532.workers.dev`。依「[正式切換](#正式切換)」的步驟合併切換 PR 後，前端與 LINE 改用這個 Worker；在那之前正式環境仍是 Deno Deploy + MongoDB Atlas（`main/project`）。

| 路徑 | 內容 |
|---|---|
| `src/` | Worker（Hono）：API、管理後台、LINE webhook |
| `migrations/` | D1 資料表（由 wrangler 的 D1 migrations 管理） |
| `test/` | Worker 測試（在 workerd 中執行，D1 由 Miniflare 提供）與 CPU 時間量測 |
| `atlas-import/` | Atlas → D1 的轉檔工具（GitHub Actions 執行，Node 24） |
| `compare/` | 新舊後端比對與 CPU 時間報告（GitHub Actions 執行） |
| `wrangler.jsonc` | Worker 與 D1 設定 |

相關 workflow：

- `.github/workflows/deploy-worker.yml`：部署。main 上的 Worker 有變動時自動執行，也可以手動執行。
- `.github/workflows/atlas-to-d1.yml`：轉檔。
- `.github/workflows/ci.yml` 的 `worker` job：測試。

## 與 Deno 版的對應

路由、狀態碼、回應格式、錯誤訊息都與 Deno 版相同，前端不需要修改。

| Deno 版 | Worker |
|---|---|
| `server.ts` | `src/index.ts` |
| `controller.ts` | `src/bookings.ts` |
| `admin.ts` | `src/admin.ts`、`src/stats.ts` |
| `line_webhook.ts` | `src/line_webhook.ts` |
| `booking_rules.ts`、`admin_rules.ts`、`admin_auth.ts`、`line_bot.ts`、`logger.ts` | `src/` 中的同名檔案，幾乎原樣移植 |
| `admin/index.html` | 直接匯入同一個檔案（`main/project/admin/index.html`），不另外複製 |

和 Deno 版不同的實作方式，行為都相同：

| 項目 | Deno 版 | Worker |
|---|---|---|
| 防止重複預約 | MongoDB 交易 + 每間會議室一筆鎖文件 | D1 的 `db.batch()` 在同一個 SQL 交易中依序執行（見 `src/db.ts`） |
| 登入失敗次數 | 存在記憶體 | 存在 D1 的 `admin_login_attempts`（Workers 沒有跨請求共享的記憶體） |
| 統計 | 程式逐筆計算 | 在 SQL 中彙總（`src/stats.ts`） |
| 預約列表與後台紀錄 | 程式轉換後輸出 JSON | 每一列的 JSON 由 SQL 產生（`src/json_sql.ts`） |

D1 的做法細節：

- **防止重複預約**：每一句寫入都帶條件，例如「這個時段沒有其他有效預約才寫入」，後面再接一句檢查。只要任何一句沒有寫入，整批就回復，然後重新讀取再試，相當於 MongoDB 交易的自動重試。
- **統計**：與 Deno 版的 `computeStats` 比對隨機資料，結果完全相同。
- **列表 JSON**：與 Deno 版的轉換逐字相同。

### CPU 時間（免費方案每個請求上限 10ms）

D1 執行查詢的時間不算在 Worker 的 CPU 時間裡；Worker 本身逐筆解析、轉換、輸出 JSON 才是大量資料時的主要開銷。所以統計改在 SQL 彙總，列表改由 SQL 產生 JSON。

`test/cpu/cpu.test.ts` 量測各 API 在 Worker 中實際做的事。以下數字是在比 Cloudflare 慢的測試機上量到的：

| API | 5,000 筆，改寫前 | 2,000 筆，改寫後 | 5,000 筆，改寫後 |
|---|---:|---:|---:|
| 統計 | 24 ms | 1.2 ms | 3–5 ms |
| 後台預約紀錄 | 43 ms | 2.6 ms | 4–7 ms |
| 前端查詢 | 23 ms（2,000 筆） | 1.4–2.4 ms | 5–6 ms |

目前資料量約每年 770 筆，前端一次查約 5 個月。部署後可在 Cloudflare 的 Workers → meetbook → Metrics 看實際的 CPU 時間。

## 資料表設計

時間一律存 **UTC epoch 毫秒**（INTEGER），比較是否重疊時是單純的數字比較。

### `bookings`（MongoDB `booked`）

| MongoDB | D1 | 說明 |
|---|---|---|
| `id` | `id` | 主鍵 |
| `groupId` | `group_id` | 舊資料為 NULL |
| `createdTime`／`updatedTime` | `created_time`／`updated_time` | 舊資料可能為 NULL |
| `title` | `title` | |
| `user`（物件） | `user_id`、`user_name`、`user_extension`、`user_department_code`／`_label`、`user_group_code`／`_label` | 物件中缺少的欄位存空字串 |
| `user`（字串，非常舊的資料） | `user_raw` | 此時上面 7 欄為 NULL |
| `room` | `room` | |
| `participantsNum` | `participants_num` | 不是數字的舊資料存 NULL |
| `cancelled` | `cancelled` | 1／0；**沒有此欄位的舊資料存 NULL**，`cancelled = 0` 不會選到它，與 MongoDB 的 `cancelled: false` 行為相同 |
| `startTime`／`endTime`（Date 或字串） | `start_time`／`end_time` | 一律轉成 epoch 毫秒 |
| `editPassword` | `edit_password` | |
| `updatedCount` | `updated_count` | |
| `date` | `date` | 台北日期 YYYY-MM-DD |
| `isMulti` | `is_multi` | JSON 陣列文字 |

索引：

- `(room, cancelled, end_time)`：衝突檢查。
- `(cancelled, end_time)`：查詢區間內所有會議室。
- `group_id`：只有 `group_id` 不是 NULL 才建立的部分索引，作用等同 MongoDB 的 sparse 索引。

範圍條件用 `end_time`，不用 `start_time`。查詢時只會掃到結束時間在查詢起點之後的預約，不會掃過全部歷史資料；D1 依掃描列數計費。

### `users`（MongoDB `users`）

- 行編在 MongoDB 沒有唯一限制，所以另外設流水號 `seq` 當主鍵，保留匯入順序。查找時取第一筆，與舊系統的 `findOne` 相同。
- `department`、`group`、`role` 的 code／label 拆成欄位。
- `status`：1／0／NULL，NULL 視為啟用。
- `disabled`：早期後台留下的停用標記，1 代表停用。

### `changelog`、`announcements`（Worker 新增，Deno 版沒有）

網站的更新日誌與公告，由管理後台維護（`src/notices.ts`）。原本寫在前端 `src/config/changelog.ts` 的 v2.1.0～v2.3.0 已由 `0003_notices.sql` 帶入。

- `GET /api/notices`：目前在公告期間內的項目（台北時間）。更新日誌為改版日起 7 天內，公告為開始日到結束日（含當天）。
- 管理後台 API（需登入；修改需 `X-Admin`）：`GET/POST /admin/api/changelog`、`PUT/DELETE /admin/api/changelog/:version`、`GET/POST /admin/api/announcements`、`PUT/DELETE /admin/api/announcements/:id`。
- 管理後台頁面與 Deno 版共用；Deno 版沒有這些 API，打開「公告」分頁會顯示錯誤（Deno 版已停用，不影響）。

### `admin_login_attempts`

管理後台登入失敗次數。原本存在記憶體，Workers 沒有共享記憶體，所以改存 D1。

### `write_guard`

原子寫入用的檢查表，只會有一列，見 `src/db.ts` 的 `atomicWrites`。

## 轉檔 workflow：轉檔 Atlas → D1

在 GitHub 的 **Actions → 轉檔 Atlas → D1 → Run workflow** 執行。

| 模式 | 做什麼 | 需要的設定 |
|---|---|---|
| `dry-run`（預設） | 唯讀匯出 Atlas → 加密備份並驗證可還原 → 轉換 → 產生報告。**不連線 Cloudflare，不寫入 D1** | `MONGODB_URI`、`BACKUP_PASSPHRASE`、`MONGODB_DB_NAME` |
| `import` | dry-run 的全部步驟，接著依序執行下列步驟（見下方說明） | 再加上 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`，以及在 confirm 欄位輸入「清空D1並匯入」 |

`import` 模式在 dry-run 之後會：

1. 建立 D1（如果還沒建立）。
2. 套用 migrations。
3. 備份 D1 現有資料。
4. 清空 D1 後匯入。
5. 讀回全部資料，逐筆逐欄比對。

報告在該次執行的 **Summary** 頁面。報告只有筆數統計、預約 id 與 MongoDB `_id`，不含姓名、行編、分機或密碼。

`import` 可以重複執行，每次都會先清空 D1 再匯入。但有兩點要注意：

- 每次匯入都會用掉 D1 的每日寫入額度。免費方案每天 10 萬列，台北時間早上 8 點重置。報告中有估計值。**正式切換之後，同一天不要再匯入。**
- 正式切換後，請到 repo 的 Variables 設定 `D1_IS_PRODUCTION` = `true`。設定之後 workflow 會拒絕匯入，避免誤把正式資料清掉。

### 新舊 API 比對

用 `.github/workflows/compare-apis.yml`（Actions →「比對新舊後端」）。程式在 `compare/`。

**執行步驟：**

1. 先從 Atlas 重新匯入 D1，讓兩邊資料相同。可以取消勾選來略過這一步；正式切換後一定要取消。
2. 同時查詢舊系統（Deno）與新系統（Worker），逐筆比對。
3. 向 Cloudflare 查詢 Worker 實際的 CPU 時間。

**比對的項目：**

- **預約查詢**：今天、本月、上個月、前端預設範圍、最大範圍、各會議室、沒帶參數。
- **錯誤處理**：參數錯誤、缺少欄位、找不到使用者、找不到預約。
- **CORS**。
- **管理後台**：使用者清單、預約紀錄、統計。需要 `ADMIN_PASSWORD`；Deno 版密碼不同時，另外設定 `OLD_ADMIN_PASSWORD`。

只送出不會改變資料的請求：查詢，以及一定會在寫入前被拒絕的錯誤請求。報告只有狀態碼、筆數、欄位路徑與預約 id，不含資料內容。

**已知、不影響使用的差異：**

- **預約順序**：新系統嚴格依開始時間排序；舊系統會把時間存成文字的舊預約排在前面。前端畫面本來就依時間顯示，不受影響。
- **`date` 欄位**：17 筆舊資料的 `date` 不是字串。舊 API 回傳 null 或不回傳，新 API 回傳空字串。前端一律以 `startTime` 重新計算日期，不受影響。

查詢實際 CPU 時間，需要在 Cloudflare API token 加上 `Account` → `Account Analytics` → `Read`；沒有這個權限時會略過，不會讓 workflow 失敗。

## 備份

**每一次**執行轉檔 workflow（包括 dry-run）都會先備份。備份失敗或無法解密還原時，workflow 會停止，不會進行任何後續步驟。

| 備份 | 內容 | 保存位置 |
|---|---|---|
| Atlas 備份 | 資料庫中**所有** collection（包括 `roomLocks`）與索引定義。格式是 EJSON canonical，保留 Date／字串等原始型別，可以原樣還原 | artifact `atlas-backup-<執行編號>`，保存 90 天 |
| D1 匯入前備份（只有 import） | 匯入前 D1 的完整 SQL 匯出，以及 Time Travel bookmark | artifact `d1-backup-<執行編號>`，保存 90 天。bookmark 寫在 Summary；免費方案可還原到 7 天內的任一時間點 |

為什麼一定要加密：**公開 repo 的 artifact，任何登入 GitHub 的人都可以下載。**

- 備份用 GnuPG 以 AES-256 加密，密碼是 GitHub Secret `BACKUP_PASSPHRASE`。
- 每次加密完都會立刻解密，比對內容與原始檔完全相同，才算備份成功。
- **`BACKUP_PASSPHRASE` 遺失，備份就無法解開。** 請另外存在密碼管理工具。
- artifact 90 天後會自動刪除。正式切換前最後一次轉檔的備份，建議下載到自己的雲端硬碟長期保存。

解密方式（在任何裝了 GnuPG 的電腦上；需要還原時也可以請我做成 workflow）：

```sh
unzip atlas-backup-<執行編號>.zip
gpg --decrypt atlas-backup-*.tar.gz.gpg > backup.tar.gz   # 會詢問 BACKUP_PASSPHRASE
tar -xzf backup.tar.gz                                      # 得到 atlas/booked.ndjson、users.ndjson…
```

## 部署

合併到 main 時自動執行。步驟依序是：

1. 型別檢查。
2. 準備 D1（不存在就建立）並套用 migrations。
3. 部署 Worker，同時寫入 secrets。
4. 檢查 `/healthz`。

部署完成後，Summary 會列出 Worker 的網址。

Worker 的 secrets 由 GitHub Secrets 寫入，部署時用 `wrangler deploy --secrets-file`；沒有設定的 secret 會保留 Worker 上原本的值。

| GitHub Secret | 用途 |
|---|---|
| `ADMIN_PASSWORD` | 管理後台密碼（至少 8 個字元，少於 8 個字元時 `/admin` 一律 404） |
| `LINE_CHANNEL_SECRET` | LINE 簽章驗證 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE 回覆訊息 |

還沒設定 `CLOUDFLARE_API_TOKEN`／`CLOUDFLARE_ACCOUNT_ID` 時，workflow 會略過部署，不會失敗。

## 正式切換

建議在**下班後或週末**進行，整個過程約 15 分鐘。切換期間舊系統只能查詢，不能預約。

### 切換前（前一天就可以做）

- [ ] **PR 4a（舊後端唯讀開關）已合併**，Deno Deploy 已自動部署完成。
- [ ] 到 repo 的 **Settings → Secrets and variables → Actions → Variables** 分頁，看有沒有 `VITE_API_URL`。
  - **有的話請刪除。** 它會蓋過程式中的預設網址，前端就不會切到新後端。
- [ ] 到 Actions →「比對新舊後端」→ Run workflow，**勾選**「重新匯入」，確認報告全部 ✅（只有順序不同的 ℹ️ 沒關係）。

### 切換當天（依序做）

1. **讓舊系統停止寫入**：Deno Deploy → `meetingbooking` → **Settings → Environment Variables** → 新增 `READ_ONLY`，值為 `true`，Production 與 Development 都勾選 → 儲存。儲存後會自動重新部署，約 1 分鐘。
   - 確認方式：在現在的網站試著預約，應該出現「預約系統已搬到新主機，請重新整理頁面後再操作」。
2. **最後一次轉檔**：Actions →「轉檔 Atlas → D1」→ mode 選 `import`，confirm 輸入 `清空D1並匯入` → 等它完成。
   - Summary 的「匯入後驗證」要兩列都是 ✅。
3. **合併 PR 4b（切換）**：合併後「Deploy frontend」會自動執行，約 2 分鐘。到 Actions 確認它成功（綠色勾勾）。
4. **防止 D1 被覆蓋**：Settings → Secrets and variables → Actions → **Variables** → New repository variable，`D1_IS_PRODUCTION`，值為 `true`。從此轉檔 workflow 會拒絕再匯入。
5. **LINE webhook**：LINE Developers → 你的 Channel → **Messaging API** → Webhook URL 改成 `https://meetbook.duicn187532.workers.dev/line/webhook` → **Update** → **Verify**（要出現 Success）。
6. **停止喚醒舊系統**：cron-job.org → 把喚醒 Deno 的那個 job 停用（Disable）。Workers 不需要喚醒。
7. **驗證**（用手機）：
   - [ ] 打開 <https://duicn187532.github.io/MeetBook/>，重新整理，看得到預約。
   - [ ] 新增一筆測試預約，再用編輯密碼取消。
   - [ ] 打開新的管理後台 <https://meetbook.duicn187532.workers.dev/admin>，「預約紀錄 → 送出時間 → 今天」看得到剛剛那筆測試預約。
   - [ ] LINE 傳「快速查詢」，有回覆。
8. **通知同事**：請大家重新整理頁面。如果還看到「已搬到新主機」，等幾分鐘再試，這是 GitHub Pages 的快取。
   - 管理後台的網址改為 `https://meetbook.duicn187532.workers.dev/admin`。

### 切換後

- 隔天到 Actions →「比對新舊後端」→ Run workflow，**不要勾**「重新匯入」，看報告最下方的實際 CPU 時間。
  - 切換後兩邊資料本來就會不同（新預約只在新系統），所以預約比對出現 ❌ 是正常的。
- 舊系統（Deno Deploy、Atlas）先保留，維持唯讀。至少穩定兩週後，再移除舊程式。

### 回復（新系統出問題時）

依照先前的決定（回復策略 A）：切換後在新系統建立的預約不會自動回到舊系統，需要手動補登。

1. **先記下新系統的新預約**：打開新的管理後台 → 預約紀錄 → 送出時間 → 從切換當天到今天 → 截圖。這些是要補登到舊系統的預約。
2. **前端改回舊後端**：Settings → Secrets and variables → Actions → Variables → 新增（或修改）`VITE_API_URL`，值為 `https://meetingbooking.duicn187532.deno.net/api/bookings/`；然後 Actions →「Deploy frontend」→ Run workflow。
3. **舊系統恢復寫入**：Deno Deploy → Environment Variables → 刪除 `READ_ONLY`。
4. **LINE webhook 改回**：`https://meetingbooking.duicn187532.deno.net/line/webhook` → Update → Verify。
5. **cron-job.org**：重新啟用喚醒 job。
6. 依第 1 步的截圖補登預約。

之後要再切換一次時，先刪除 Variable `D1_IS_PRODUCTION`，再從「切換當天」第 1 步重新開始。

## 手機設定步驟

以下都在手機瀏覽器操作。GitHub 的 Settings 頁面在手機 App 裡沒有，請用瀏覽器開 github.com。

### 1. 建立 Atlas 唯讀帳號（強烈建議）

讓轉檔用的帳號**本身就沒有寫入權限**，不只是程式不寫入。

1. 登入 <https://cloud.mongodb.com>，進入 MeetBook 的專案。
2. 左側選單 **Security → Database & Network Access → Database Users**（舊版介面是 **Database Access**），按 **Add New Database User**。
3. 驗證方式選 **Password**。
   - 使用者名稱：例如 `meetbook-export`。
   - 按 **Autogenerate Secure Password** 產生密碼，先複製起來。
4. **Database User Privileges** 選 **Built-in Role → Only read any database**。
   - 或者用 **Specific Privileges**，設定 `read` @ 你的資料庫名稱。
5. 按 **Add User**。
6. 確認 **Network Access**（IP Access List）裡有 `0.0.0.0/0`。
   - Deno Deploy 目前能連線，通常表示已經有這一筆。
   - 沒有的話，GitHub Actions 會連不上，因為它的 IP 不固定。
7. 回到 **Database → Clusters → Connect → Drivers**，複製連線字串，把 `<db_password>` 換成剛剛的密碼。
   - 形如：`mongodb+srv://meetbook-export:密碼@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

轉檔報告的「Atlas 帳號權限」欄會顯示這個帳號是否唯讀。

### 2. 確認正式資料庫名稱

用下列任一種方式確認：

- 到 Deno Deploy 專案的 **Settings → Environment Variables**，看 `DB_NAME` 的值。沒有設定的話，程式預設是 `todo_db`。
- 在 Atlas 的 **Browse Collections** 中，找有 `booked` 和 `users` 的那個資料庫。

### 3. 產生備份密碼

用密碼管理工具（例如 iPhone 的「密碼」App、Google 密碼管理工具）產生一組**至少 20 個字元**的隨機密碼，並保存在那裡。

### 4. 設定 GitHub Secrets 與 Variables

用瀏覽器打開 repo → **Settings → Secrets and variables → Actions**。

**Secrets** 分頁 → **New repository secret**：

| 名稱 | 值 | 什麼時候需要 |
|---|---|---|
| `MONGODB_URI` | 步驟 1 的唯讀連線字串 | dry-run 開始 |
| `BACKUP_PASSPHRASE` | 步驟 3 的密碼 | dry-run 開始 |
| `CLOUDFLARE_API_TOKEN` | 見步驟 6 | import 開始 |
| `CLOUDFLARE_ACCOUNT_ID` | 見步驟 7 | import 開始 |

**Variables** 分頁 → **New repository variable**：

| 名稱 | 值 |
|---|---|
| `MONGODB_DB_NAME` | 步驟 2 的資料庫名稱 |

### 5. 執行 dry-run

repo → **Actions** → 左側 **轉檔 Atlas → D1** → **Run workflow**，mode 選 `dry-run` → **Run workflow**。GitHub 手機 App 也可以操作。

跑完後打開該次執行，**Summary** 頁面就是報告。

### 6. 建立 Cloudflare 帳號與 API token（import 前才需要）

1. 到 <https://dash.cloudflare.com/sign-up> 用 email 註冊，並完成信箱驗證。
   - Workers 免費方案預設就是啟用的。
   - **如果任何畫面要求填信用卡，請停下來告訴我。** 這次遷移只用免費方案，不需要付款資訊。
2. 右上角頭像 → **My Profile** → **API Tokens** → **Create Token** → 最下方 **Create Custom Token** 的 **Get started**。
3. 設定：
   - **Token name**：`meetbook-github-actions`
   - **Permissions**（兩列）：
     - `Account` ／ `D1` ／ `Edit`
     - `Account` ／ `Workers Scripts` ／ `Edit`（部署 Worker 用）
   - **Account Resources**：`Include` ／ 你的帳號
   - 其他欄位留空。
4. **Continue to summary → Create Token**。token 只會顯示一次，複製後存成 GitHub Secret `CLOUDFLARE_API_TOKEN`。

### 7. 找 Account ID

用下列任一種方式找：

- 登入 Cloudflare 後，網址列 `dash.cloudflare.com/` 後面那串 32 個字元的英數字就是 Account ID。
- 在 **Account home** 帳號名稱旁的 **⋯** 選單裡，選 **Copy account ID**。

存成 GitHub Secret `CLOUDFLARE_ACCOUNT_ID`。

### 8. D1 資料庫

**不用手動建立。** 第一次以 `import` 模式執行時，workflow 會自動建立名為 `meetbook` 的資料庫，location hint 是 `apac`（亞太）。之後每次執行都用名稱找到它。

## 本機開發（給有電腦的人）

```sh
cd main/worker
npm ci
npm run typecheck
npm test   # Worker 測試、CPU 量測與轉檔流程測試；會下載 MongoDB 執行檔並啟動本機 D1，需要約 1 分鐘
```
