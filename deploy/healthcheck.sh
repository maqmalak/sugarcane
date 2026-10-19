#!/usr/bin/env bash
# MicroMax Sugar ERP — health check for cron or a monitor (Phase 9). Exits 1 when the ERP reports a failure.
#   */5 * * * *  /home/frappe/frappe-bench/apps/sugarcane/deploy/healthcheck.sh https://erp.example.com || <alert>
# With API_KEY / API_SECRET of a System Manager it prints every check; without them only ok / not ok.
set -euo pipefail
URL="${1:-http://127.0.0.1:8000}"
AUTH=()
if [ -n "${API_KEY:-}" ]; then AUTH=(-H "Authorization: token ${API_KEY}:${API_SECRET}"); fi
OUT=$(curl -fsS --max-time 20 "${AUTH[@]}" "$URL/api/method/sugarcane.api.v1.health.status")
echo "$OUT"
echo "$OUT" | grep -q '"ok": *true' || exit 1
