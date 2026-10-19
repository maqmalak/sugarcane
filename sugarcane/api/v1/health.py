# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 9: one health check for monitoring (Uptime Kuma, a cron job, the IT office).

GET /api/method/sugarcane.api.v1.health.status
- anyone: {"ok": true|false} — enough for an uptime monitor;
- a System Manager / Cane Admin: every check with its detail, so a failure says what to fix.
"""
import glob
import os
import shutil
import time

import frappe
from frappe.rate_limiter import rate_limit
from frappe.utils import add_days, cint, get_datetime, now_datetime, nowdate

DETAIL = {"System Manager", "Cane Admin"}
BACKUP_MAX_HOURS = 26
DISK_MIN_GB = 10


def _check(name, ok, detail, warn=False):
	return {"check": name, "ok": bool(ok), "level": "ok" if ok else ("warn" if warn else "fail"), "detail": detail}


def checks() -> list[dict]:
	out = []
	try:
		frappe.db.sql("select 1")
		out.append(_check("database", True, "connected"))
	except Exception as e:
		out.append(_check("database", False, str(e)[:120]))
	try:
		frappe.cache.set_value("sc_health_ping", "1", expires_in_sec=30)
		out.append(_check("redis cache", frappe.cache.get_value("sc_health_ping") == "1", "read / write"))
	except Exception as e:
		out.append(_check("redis cache", False, str(e)[:120]))
	# the scheduler: enabled, and a scheduled job ran in the last 15 minutes
	from frappe.utils.scheduler import is_scheduler_disabled

	enabled = not is_scheduler_disabled(verbose=False)
	last = frappe.db.sql("select max(creation) from `tabScheduled Job Log`")[0][0]
	age = (now_datetime() - get_datetime(last)).total_seconds() / 60 if last else None
	out.append(_check("scheduler", enabled and age is not None and age < 15,
		f"{'enabled' if enabled else 'DISABLED'}; last job {int(age)} min ago" if age is not None else f"{'enabled' if enabled else 'DISABLED'}; no job has run",
		warn=bool(frappe.conf.get("developer_mode"))))  # a development PC runs no scheduler
	# the background queue
	try:
		from frappe.utils.background_jobs import get_queue

		depth = sum(len(get_queue(q)) for q in ("short", "default", "long"))
		out.append(_check("job queue", depth < 500, f"{depth} jobs waiting", warn=True))
	except Exception as e:
		out.append(_check("job queue", False, str(e)[:120], warn=True))
	# backups: the newest database backup of this site
	files = glob.glob(frappe.get_site_path("private", "backups", "*-database.sql.gz"))
	if files:
		newest = max(files, key=os.path.getmtime)
		hours = (time.time() - os.path.getmtime(newest)) / 3600
		out.append(_check("backup", hours < BACKUP_MAX_HOURS, f"last {hours:.1f} h ago ({os.path.basename(newest)})"))
	else:
		out.append(_check("backup", False, "no database backup on this server"))
	free = shutil.disk_usage(frappe.get_site_path()).free / 1e9
	out.append(_check("disk", free > DISK_MIN_GB, f"{free:.0f} GB free"))
	errors = frappe.db.count("Error Log", {"creation": [">", add_days(now_datetime(), -1)]})
	out.append(_check("errors (24 h)", errors < 50, f"{errors} in the Error Log", warn=True))
	# mill-specific: weighbridge agents alive, crushing days left open, messages stuck
	from sugarcane.cane_procurement import procurement as p

	stale = []
	for t in frappe.get_all("Weighbridge Terminal", filters={"is_active": 1, "indicator_protocol": ["!=", "Simulator"]}, pluck="name"):
		r = p.latest_reading(t)
		if not r or r.get("age_s", 1e9) > 120:
			stale.append(t)
	out.append(_check("weighbridge agents", not stale, f"silent: {', '.join(stale)}" if stale else "all reporting", warn=True))
	cfg = p.settings()
	cur = p.crushing_day(cfg=cfg)
	open_days = frappe.db.sql("""select count(distinct posting_date) from `tabCane Purchase Receipt` c where c.docstatus = 1
		and c.posting_date < %s and c.season = %s and not exists (select 1 from `tabDaily Cane Purchase` d where d.crushing_day = c.posting_date
		and d.docstatus = 1)""", (add_days(cur, -1), cfg.season))[0][0]
	out.append(_check("crushing days closed", not open_days, f"{open_days} past day(s) not closed" if open_days else "up to date", warn=True))
	stuck = frappe.db.count("Sugar SMS Log", {"status": "Queued", "queued_at": ["<", add_days(now_datetime(), -1)]})
	out.append(_check("messages", not stuck, f"{stuck} queued for more than a day" if stuck else "flowing", warn=True))
	return out


@frappe.whitelist(allow_guest=True, methods=["GET"])
@rate_limit(limit=60, seconds=60)
def status() -> dict:
	rows = checks()
	ok = all(r["ok"] or r["level"] == "warn" for r in rows)
	if DETAIL & set(frappe.get_roles()):
		return {"ok": ok, "at": str(now_datetime()), "site": frappe.local.site, "checks": rows}
	return {"ok": ok}
