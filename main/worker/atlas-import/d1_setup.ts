// 確認 D1 資料庫存在（沒有就以亞太區 location hint 建立），並把資料庫 id 填進工作目錄中的 wrangler.jsonc
// 只修改 GitHub Actions 執行時的工作目錄，不會 commit 回 repo；資料庫 id 不是機密，會印在 log 中。
//
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node atlas-import/d1_setup.ts
import { readFile, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseJsonOutput, wrangler } from "./lib/wrangler.ts";

export const D1_NAME = "meetbook";
export const D1_LOCATION = "apac";
// wrangler.jsonc 中的佔位 id；本機測試（Miniflare）不需要真正的 id
export const PLACEHOLDER_ID = "00000000-0000-0000-0000-000000000000";

const workerDir = join(dirname(fileURLToPath(import.meta.url)), "..");

interface D1Info {
  uuid: string;
  name: string;
}

async function findDatabase(): Promise<D1Info | undefined> {
  const list = parseJsonOutput<D1Info[]>(await wrangler(["d1", "list", "--json"], workerDir));
  return list.find((d) => d.name === D1_NAME);
}

export function fillDatabaseId(config: string, id: string): string {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("D1 資料庫 id 格式不正確");
  if (!config.includes(PLACEHOLDER_ID)) throw new Error("wrangler.jsonc 中找不到佔位的 database_id");
  return config.replace(PLACEHOLDER_ID, id);
}

async function main() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("沒有設定 CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_ACCOUNT_ID（GitHub Secrets）");
  }
  let db = await findDatabase();
  if (db) {
    console.log(`D1 資料庫 ${D1_NAME} 已存在：${db.uuid}`);
  } else {
    console.log(`建立 D1 資料庫 ${D1_NAME}（location hint：${D1_LOCATION}）`);
    await wrangler(["d1", "create", D1_NAME, "--location", D1_LOCATION], workerDir);
    db = await findDatabase();
    if (!db) throw new Error("建立後仍找不到 D1 資料庫");
    console.log(`已建立：${db.uuid}`);
  }

  const configPath = join(workerDir, "wrangler.jsonc");
  await writeFile(configPath, fillDatabaseId(await readFile(configPath, "utf8"), db.uuid));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `database_id=${db.uuid}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
