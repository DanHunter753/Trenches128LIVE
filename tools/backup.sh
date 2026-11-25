#!/usr/bin/env bash
# Trench 128 nightly backup of accounts and XP (run by trench128-backup.timer). Keeps the last 14 days in
# /var/backups/trench128. Copy them off the server now and then: scp -r root@YOUR_IP:/var/backups/trench128 .
set -uo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"; cd "$REPO" || exit 1
DEST=/var/backups/trench128; mkdir -p "$DEST"
day=$(date +%F)
if docker compose cp game:/data "$DEST/$day" >/dev/null; then echo "[backup] saved $DEST/$day";
else echo "[backup] failed (is the game running?)"; exit 1; fi
find "$DEST" -mindepth 1 -maxdepth 1 -type d -name '20??-??-??' -mtime +14 -exec rm -rf -- {} +   # drop backups older than 14 days
