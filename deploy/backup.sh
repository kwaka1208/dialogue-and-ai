#!/usr/bin/env bash
#
# DBと添付ファイルの控えを取る。cron から日に1回まわす想定。
#
#   sudo /opt/dialogue-and-ai/deploy/backup.sh
#   sudo /opt/dialogue-and-ai/deploy/backup.sh /mnt/backup   # 置き場所を変える
#
# sqlite3 コマンドが必要 (apt install sqlite3)。
# 動いているまま cp で写すと WAL とずれるので、.backup を使う。

set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/dialogue-and-ai}"
DEST="${1:-/var/backups/dialogue-and-ai}"
KEEP="${KEEP:-14}"

DB="$DATA_DIR/dialogue-and-ai.sqlite"
UPLOADS="$DATA_DIR/uploads"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -f "$DB" ]; then
	echo "DBが見つかりません: $DB" >&2
	exit 1
fi

mkdir -p "$DEST"

sqlite3 "$DB" ".backup '$DEST/db-$STAMP.sqlite'"
gzip -f "$DEST/db-$STAMP.sqlite"

if [ -d "$UPLOADS" ]; then
	tar czf "$DEST/uploads-$STAMP.tar.gz" -C "$DATA_DIR" uploads
fi

# 古い世代を落とす。KEEP 個より多いものを消す
for prefix in db uploads; do
	ls -1t "$DEST/$prefix-"*.gz 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
		rm -f "$old"
	done
done

echo "控えを取りました: $DEST (db-$STAMP.sqlite.gz)"
