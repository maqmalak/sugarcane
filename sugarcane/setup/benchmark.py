# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 9: time the screens and reports people use most, on whatever data the site holds.

    bench --site sugarcane.local execute sugarcane.setup.benchmark.run

Each call runs 3 times as Administrator (the first warms the caches); the median is reported in milliseconds."""
import statistics
import time

import frappe


def _calls():
	from sugarcane.api.v1 import accounts, erp, mis, procurement
	from sugarcane.cane_accounting.accounting import unpaid_cprs
	from sugarcane.sms import keyword_reply
	from sugarcane.sugar_mis.live import circle_performance

	season = frappe.db.get_value("Crushing Season", {"status": "Closed"}, "name", order_by="start_date desc") or \
		frappe.db.get_single_value("Sugar Settings", "active_season")
	s = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"], as_dict=True)
	peak = frappe.db.sql("""select posting_date from `tabCane Purchase Receipt` where docstatus = 1 and season = %s group by posting_date
		order by count(*) desc limit 1""", season)
	day = str(peak[0][0]) if peak else None
	grower = frappe.db.sql("""select grower from `tabCane Purchase Receipt` where docstatus = 1 and season = %s group by grower
		order by count(*) desc limit 1""", season)
	g = grower[0][0] if grower else None

	def report(name, **f):
		return lambda: frappe.get_module(f"sugarcane.{frappe.scrub(frappe.db.get_value('Report', name, 'module'))}.report."
			f"{frappe.scrub(name)}.{frappe.scrub(name)}").execute(f)

	return season, day, [
		("MIS wall snapshot (peak day)", lambda: mis.snapshot(day)),
		("Procurement insights (peak day)", lambda: procurement.insights(day)),
		("Yard board", lambda: procurement.yard()),
		("Cane accounts dashboard", lambda: accounts.dashboard()),
		("Unpaid CPRs (scroll builder)", lambda: unpaid_cprs(limit=500)),
		("Circle performance (season)", lambda: circle_performance(season)),
		("Keyword reply BAL (top grower)", lambda: keyword_reply("Balance", frappe._dict(name=g, grower_name="x"))),
		("Sales dashboard", lambda: erp.sales()),
		("Finance dashboard", lambda: erp.finance()),
		("Report: CPR Register (season)", report("CPR Register", from_date=str(s.start_date), to_date=str(s.end_date))),
		("Report: Season Progress", report("Season Progress", season=season)),
		("Report: Grower Supply Ranking", report("Grower Supply Ranking", season=season, top=500)),
		("Report: Grower Payable Aging", report("Grower Payable Aging")),
		("Report: Grower Ledger (top grower)", report("Grower Ledger", grower=g, from_date=str(s.start_date), to_date=str(s.end_date))),
		("Report: Cane Day Close (peak day)", report("Cane Day Close", to_date=day)),
	]


def run(rounds: int = 3) -> list[dict]:
	frappe.set_user("Administrator")
	season, day, calls = _calls()
	counts = {dt: frappe.db.count(dt, {"docstatus": 1}) for dt in ("Cane Purchase Receipt", "Cane Token", "Journal Entry", "GL Entry")}
	print(f"season {season} · peak day {day} · " + " · ".join(f"{k}: {v:,}" for k, v in counts.items()))
	out = []
	for label, fn in calls:
		times = []
		for _ in range(int(rounds)):
			t = time.perf_counter()
			try:
				fn()
			except Exception as e:  # a report that needs filters this site lacks
				times = None
				print(f"{label:<42} error: {str(e)[:80]}")
				break
			times.append((time.perf_counter() - t) * 1000)
			frappe.db.rollback()
		if times:
			ms = statistics.median(times)
			out.append({"call": label, "ms": round(ms, 1)})
			print(f"{label:<42} {ms:>9.1f} ms")
	return out
