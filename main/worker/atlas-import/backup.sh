#!/usr/bin/env bash
# 把資料夾打包並以 GPG（AES-256）加密，然後立刻解密比對，確認備份可以還原。
#
#   BACKUP_PASSPHRASE=... atlas-import/backup.sh <要備份的資料夾> <輸出 .tar.gz.gpg 路徑> <備份資訊 json 路徑>
#
# 解密方式（任何裝了 GnuPG 的電腦）：
#   gpg --decrypt 檔名.tar.gz.gpg > backup.tar.gz   # 會詢問密碼
#   tar -xzf backup.tar.gz
set -euo pipefail

src="$1"
out="$2"
info="$3"

if [ "${#BACKUP_PASSPHRASE}" -lt 20 ]; then
  echo "BACKUP_PASSPHRASE 至少要 20 個字元" >&2
  exit 1
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$(dirname "$out")"

tar -C "$(dirname "$src")" -czf "$work/plain.tar.gz" "$(basename "$src")"

# 密碼由 stdin 傳入，不會出現在指令列或 log
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --output "$out" "$work/plain.tar.gz"

# 還原驗證：解密後必須與原始壓縮檔完全相同，壓縮檔也必須能正常解開
printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --decrypt --output "$work/restored.tar.gz" "$out"
cmp -s "$work/plain.tar.gz" "$work/restored.tar.gz"
tar -tzf "$work/restored.tar.gz" > /dev/null

bytes="$(stat -c %s "$out")"
sha="$(sha256sum "$out" | cut -d' ' -f1)"
printf '{"file":"%s","bytes":%s,"sha256":"%s","verified":true}\n' "$(basename "$out")" "$bytes" "$sha" > "$info"
echo "備份完成：$(basename "$out")（${bytes} bytes），解密還原驗證通過"
