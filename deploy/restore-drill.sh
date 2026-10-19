#!/usr/bin/env bash
# MicroMax Sugar ERP — monthly restore drill (Phase 9). A backup is only proven by restoring it.
#
# Restores the newest backup of SITE into a throw-away site DRILL_SITE on the same bench, checks that the counts match
# the live site, then drops the drill site. Needs the MariaDB root password (DB_ROOT_PASSWORD).
#   DB_ROOT_PASSWORD=… ./restore-drill.sh
set -euo pipefail

BENCH="${BENCH:-$HOME/frappe-bench}"
SITE="${SITE:-sugarcane.local}"
DRILL_SITE="${DRILL_SITE:-restore-drill.local}"
DIR="$BENCH/sites/$SITE/private/backups"
: "${DB_ROOT_PASSWORD:?set DB_ROOT_PASSWORD}"

cd "$BENCH"
DB=$(ls -t "$DIR"/*-database.sql.gz | head -1)
STAMP=$(basename "$DB" | cut -d- -f1-2)
PUB=$(ls -t "$DIR"/"$STAMP"*-files.tar 2>/dev/null | head -1 || true)
PRIV=$(ls -t "$DIR"/"$STAMP"*-private-files.tar 2>/dev/null | head -1 || true)
echo "restoring $DB into $DRILL_SITE"

bench new-site "$DRILL_SITE" --db-root-password "$DB_ROOT_PASSWORD" --admin-password "$(openssl rand -hex 12)" --no-mariadb-socket >/dev/null
bench --site "$DRILL_SITE" restore "$DB" --db-root-password "$DB_ROOT_PASSWORD" \
  ${PUB:+--with-public-files "$PUB"} ${PRIV:+--with-private-files "$PRIV"} >/dev/null

COUNT='select (select count(*) from `tabCane Purchase Receipt` where docstatus=1), (select count(*) from `tabGL Entry`), (select count(*) from tabGrower)'
LIVE=$(bench --site "$SITE" mariadb -N -e "$COUNT")
DRILL=$(bench --site "$DRILL_SITE" mariadb -N -e "$COUNT")
echo "live : CPRs, GL entries, growers = $LIVE"
echo "drill: CPRs, GL entries, growers = $DRILL"

bench drop-site "$DRILL_SITE" --db-root-password "$DB_ROOT_PASSWORD" --force --no-backup >/dev/null
if [ "$LIVE" = "$DRILL" ]; then echo "RESTORE DRILL PASSED"; else echo "RESTORE DRILL: counts differ (backup older than today's entries?)"; fi
