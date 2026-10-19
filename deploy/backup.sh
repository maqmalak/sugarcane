#!/usr/bin/env bash
# MicroMax Sugar ERP — nightly backup (Phase 9). Run from cron as the bench user:
#   15 1 * * *  /home/frappe/frappe-bench/apps/sugarcane/deploy/backup.sh >> /home/frappe/logs/sugar-backup.log 2>&1
#
# 1. bench backup with files (database + public + private files), compressed
# 2. keeps KEEP_DAYS days on the server
# 3. copies the new set off the server with rclone (S3, Backblaze, Google Drive, another server over SFTP…)
#    when REMOTE is set (configure once: `rclone config`)
set -euo pipefail

BENCH="${BENCH:-$HOME/frappe-bench}"
SITE="${SITE:-sugarcane.local}"
KEEP_DAYS="${KEEP_DAYS:-14}"
REMOTE="${REMOTE:-}"            # e.g. offsite:micromax-erp-backups
DIR="$BENCH/sites/$SITE/private/backups"

cd "$BENCH"
echo "$(date -Is) backup of $SITE starting"
bench --site "$SITE" backup --with-files --compress
# newest set = the files written in the last 30 minutes
NEW=$(find "$DIR" -maxdepth 1 -type f -mmin -30 -printf '%f\n')
echo "$(date -Is) written: $(echo "$NEW" | tr '\n' ' ')"

find "$DIR" -maxdepth 1 -type f -mtime "+$KEEP_DAYS" -print -delete

if [ -n "$REMOTE" ]; then
  for f in $NEW; do rclone copy "$DIR/$f" "$REMOTE/$SITE/$(date +%Y-%m)/" ; done
  echo "$(date -Is) copied off the server to $REMOTE"
else
  echo "$(date -Is) WARNING: REMOTE not set — the backup is only on this server"
fi
echo "$(date -Is) done"
