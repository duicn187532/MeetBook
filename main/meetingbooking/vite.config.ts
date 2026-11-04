import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

// 只用到環境變數，不另外安裝 Node 型別定義
declare const process: { env: Record<string, string | undefined> }

// 每次建置的版本代號：GitHub Actions 為 commit 前 12 碼，本機為建置時間
const APP_VERSION = (process.env.GITHUB_SHA ?? '').slice(0, 12) || `dev-${Date.now()}`

// 建置時輸出 version.json，網站開啟時比對，LINE 等內建瀏覽器快取到舊版時會自動更新（utils/appVersion.ts）
function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: APP_VERSION }) })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), versionFile()],
  base: '/MeetBook/', // 請替換成你的 repository 名稱
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
})
