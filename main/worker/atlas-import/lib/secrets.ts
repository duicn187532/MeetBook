// 避免連線字串、主機名稱、帳號密碼出現在 log：
// 在 GitHub Actions 中註冊遮罩，錯誤訊息輸出前也先替換掉
export function secretPartsOfUri(uri: string): string[] {
  const parts = new Set<string>();
  if (uri) parts.add(uri);
  const m = /^mongodb(?:\+srv)?:\/\/(?:([^:@/]*)(?::([^@/]*))?@)?([^/?]+)/.exec(uri);
  if (m) {
    const [, user, pass, hosts] = m;
    for (const v of [user, pass]) {
      if (v) {
        parts.add(v);
        try {
          parts.add(decodeURIComponent(v));
        } catch {
          // 編碼不正確時只遮蔽原字串
        }
      }
    }
    for (const host of hosts.split(",")) {
      const name = host.replace(/:\d+$/, "");
      if (name) parts.add(name);
      // mongodb+srv 會解析出 cluster0-shard-00-00.xxxxx.mongodb.net 這類主機，遮蔽共同的網域部分
      const domain = name.split(".").slice(1).join(".");
      if (domain.includes(".")) parts.add(domain);
    }
  }
  return [...parts].filter((p) => p.length >= 3).sort((a, b) => b.length - a.length);
}

export function registerMasks(parts: string[]): void {
  if (process.env.GITHUB_ACTIONS !== "true") return;
  for (const p of parts) process.stdout.write(`::add-mask::${p}\n`);
}

export function scrub(text: string, parts: string[]): string {
  let out = text;
  for (const p of parts) out = out.split(p).join("***");
  // 保險起見，任何連線字串形式的內容一律遮蔽
  return out.replace(/mongodb(\+srv)?:\/\/\S+/g, "mongodb://***");
}
