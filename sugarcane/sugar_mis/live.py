# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""The MIS wall: one snapshot of the mill right now, and a realtime nudge when something changes it.

`snapshot()` is what /sugar/mis shows (cane today, yard, on the road, payments, production, stock, plant, stoppage,
season progress, circles). `changed` (doc_event) publishes `sugar_mis` after the commit; the page then reloads the
snapshot — debounced, so a burst of CPRs costs one reload.
"""
from collections import defaultdict

import frappe
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.cane_procurement import procurement as p
from sugarcane.sms import cfg as sms_cfg
from sugarcane.stock import stock_qty


def changed(doc, method=None):
	frappe.publish_realtime("sugar_mis", {"doctype": doc.doctype, "name": doc.name, "event": method}, after_commit=True)


def _pct(a, b):
	return round(100.0 * flt(a) / flt(b), 1) if flt(b) else 0


def circle_performance(season: str, upto=None) -> list[dict]:
	"""Per circle: surveyed acres and expected maund, quota, indents issued / used, cane supplied, % of quota and of the survey."""
	upto = upto or "2999-12-31"
	survey = {r.circle: r for r in frappe.db.sql("""select circle, count(*) fields, sum(crop_land_acres) acres,
		sum(expected_production_maund) expected from `tabCane Survey` where docstatus = 1 and season = %s and survey_for = 'Company'
		group by circle""", season, as_dict=True)}
	quota = {r.circle: flt(r.quota_maund) for r in frappe.get_all("Season Circle Quota", filters={"parent": season,
		"parenttype": "Crushing Season"}, fields=["circle", "quota_maund"])}
	indents = {r.circle: r for r in frappe.db.sql("""select circle, count(*) n, sum(load_maund) maund, sum(status = 'Used') used,
		sum(status = 'Expired') expired from `tabCane Indent` where docstatus = 1 and season = %s group by circle""", season, as_dict=True)}
	supplied = {r.circle: r for r in frappe.db.sql("""select circle, count(*) loads, sum(payable_maund) maund, sum(payable_cpr) amount,
		count(distinct grower) growers from `tabCane Purchase Receipt` where docstatus = 1 and season = %s and posting_date <= %s
		group by circle""", (season, upto), as_dict=True)}
	circles = frappe.get_all("Cane Circle", filters={"is_active": 1}, fields=["name", "circle_name", "zone", "quota_maund"], order_by="name")
	out = []
	for c in circles:
		s, i, x = survey.get(c.name) or {}, indents.get(c.name) or {}, supplied.get(c.name) or {}
		q = quota.get(c.name) or flt(c.quota_maund)
		row = {"circle": c.name, "zone": c.zone, "fields": cint(s.get("fields")), "acres": round(flt(s.get("acres")), 1),
			"expected_maund": round(flt(s.get("expected")), 0), "quota_maund": q, "indents": cint(i.get("n")),
			"indent_maund": round(flt(i.get("maund")), 0), "indents_used": cint(i.get("used")), "indents_expired": cint(i.get("expired")),
			"loads": cint(x.get("loads")), "growers": cint(x.get("growers")), "supplied_maund": round(flt(x.get("maund")), 1),
			"amount": round(flt(x.get("amount")), 0)}
		row["pct_quota"] = _pct(row["supplied_maund"], q)
		row["pct_survey"] = _pct(row["supplied_maund"], row["expected_maund"])
		row["indent_use_pct"] = _pct(row["indents_used"], row["indents"])
		if row["fields"] or row["indents"] or row["loads"] or q:
			out.append(row)
	return sorted(out, key=lambda r: -r["supplied_maund"])


def snapshot(day=None) -> dict:
	cfg = p.settings()
	s = frappe.get_cached_doc("Sugar Settings")
	now = now_datetime()
	cur = p.crushing_day(cfg=cfg)
	# the demo lives in the past: show the last day that had cane when today has none
	last = frappe.db.sql("select max(posting_date) from `tabCane Purchase Receipt` where docstatus = 1")[0][0]
	d = getdate(day) if day else (cur if frappe.db.exists("Cane Token", {"crushing_day": cur, "docstatus": 1}) or not last else last)
	start, end = p.day_window(d, cfg)
	live = d == cur

	cane = frappe.db.sql("""select count(*) loads, coalesce(sum(payable_maund), 0) maund, coalesce(sum(net_kg), 0) net_kg,
		coalesce(sum(payable_cpr), 0) payable, coalesce(sum(govt_value), 0) value, count(distinct grower) growers,
		sum(purchase_depot is null or purchase_depot = '') gate_loads
		from `tabCane Purchase Receipt` where docstatus = 1 and posting_date = %s""", d, as_dict=True)[0]
	depot_buy = frappe.db.sql("""select purchase_depot depot, count(*) loads, sum(payable_maund) maund from `tabCane Purchase Receipt`
		where docstatus = 1 and posting_date = %s and ifnull(purchase_depot, '') != '' group by purchase_depot""", d, as_dict=True)
	hours = defaultdict(float)
	for r in frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": d}, fields=["posted_at", "payable_maund"], limit=0):
		h = int((get_datetime(r.posted_at) - start).total_seconds() // 3600)
		hours[max(0, min(h, 23))] += flt(r.payable_maund)
	tokens = {r.status: cint(r.n) for r in frappe.db.sql("""select status, count(*) n from `tabCane Token`
		where docstatus = 1 and ifnull(purchase_depot, '') = '' and status in ('Issued', 'Gross') group by status""", as_dict=True)}
	oldest = frappe.db.sql("""select min(issued_at) from `tabCane Token` where docstatus = 1 and ifnull(purchase_depot, '') = ''
		and status in ('Issued', 'Gross')""")[0][0]
	road = frappe.db.sql("""select count(*) trucks, coalesce(sum(dispatched_kg), 0) kg, min(depot_gross_at) since from `tabDepot Dispatch`
		where docstatus = 1 and status in ('In Transit', 'At Mill')""", as_dict=True)[0]
	unpaid = frappe.db.sql("""select count(*) n, coalesce(sum(payable_cpr), 0) amt, min(posting_date) oldest
		from `tabCane Purchase Receipt` where docstatus = 1 and payment_status = 'Unpaid'""", as_dict=True)[0]
	paid_today = flt(frappe.db.sql("""select coalesce(sum(total_amount), 0) from `tabCane Payment Scroll`
		where docstatus = 1 and posting_date = %s""", d)[0][0])
	bilties = frappe.db.sql("""select count(*) n, coalesce(sum(amount), 0) amt from `tabTPT Bilty`
		where docstatus = 1 and status = 'Unpaid'""", as_dict=True)[0]
	loans = flt(frappe.db.sql("""select coalesce(sum(outstanding), 0) from `tabGrower Loan`
		where docstatus = 1 and status = 'Disbursed'""")[0][0])

	dmr = frappe.db.get_value("Daily Manufacturing Report", {"crushing_day": ["<=", d], "docstatus": ["<", 2]},
		["name", "crushing_day", "status", "cane_crushed_maund", "sugar_bags", "recovery_pct", "std_recovery_pct", "crush_rate_tph",
		"capacity_use_pct", "stoppage_minutes", "running_hours", "loss_known", "loss_undetermined"], as_dict=True, order_by="crushing_day desc")
	stop = frappe.get_all("Mill Stoppage", filters={"crushing_day": d}, fields=["name", "start", "end", "minutes", "category", "section",
		"reason"], order_by="start desc", limit=0)
	open_stop = next((x for x in stop if not x.end), None)
	if open_stop:
		open_stop.minutes = max(0, int((now - get_datetime(open_stop.start)).total_seconds() // 60)) if live else cint(open_stop.minutes)
	from sugarcane.sugar_mis.plant import latest

	plant = latest()["points"]
	alerts = [pt for pt in plant if pt.get("out_of_range")]

	stock = {}
	for key, item, wh in (("sugar_bags", s.get("sugar_item"), s.get("sugar_warehouse")), ("molasses_kg", s.get("molasses_item"), s.get("byproduct_warehouse")),
			("cane_yard_kg", s.get("cane_item"), s.get("cane_yard_warehouse"))):
		stock[key] = round(stock_qty(item, wh), 1) if item and wh else 0

	season = frappe.db.get_value("Crushing Season", cfg.season, ["name", "start_date", "end_date", "crushing_target_maund",
		"daily_intake_maund", "standard_recovery_pct"], as_dict=True) or frappe._dict()
	tot = frappe.db.sql("""select coalesce(sum(payable_maund), 0) maund, coalesce(sum(payable_cpr), 0) amount, count(*) loads,
		count(distinct grower) growers, count(distinct posting_date) days from `tabCane Purchase Receipt`
		where docstatus = 1 and season = %s and posting_date <= %s""", (cfg.season, d), as_dict=True)[0]
	prod = frappe.db.sql("""select coalesce(sum(sugar_bags), 0) bags, coalesce(sum(cane_crushed_kg), 0) crushed_kg,
		coalesce(sum(sugar_kg), 0) sugar_kg from `tabDaily Manufacturing Report` where docstatus = 1 and season = %s and crushing_day <= %s""",
		(cfg.season, d), as_dict=True)[0]
	target = flt(season.get("crushing_target_maund"))
	trend = frappe.db.sql("""select posting_date day, sum(payable_maund) maund, count(*) loads from `tabCane Purchase Receipt`
		where docstatus = 1 and posting_date between %s and %s group by posting_date order by posting_date""", (add_days(d, -13), d), as_dict=True)
	made = {str(r.crushing_day): r for r in frappe.get_all("Daily Manufacturing Report", filters={"docstatus": ["<", 2],
		"crushing_day": ["between", [add_days(d, -13), d]]}, fields=["crushing_day", "sugar_bags", "recovery_pct"])}
	return {
		"at": str(now), "day": str(d), "current_day": str(cur), "live": live, "window": [str(start), str(end)],
		"mill": sms_cfg().mill, "capacity_tcd": flt(s.get("mill_capacity_tcd")),
		"cane": {**cane, "maund": round(flt(cane.maund), 1), "depots": depot_buy, "target_maund": flt(season.get("daily_intake_maund")),
			"pct_target": _pct(cane.maund, season.get("daily_intake_maund")),
			"hours": [{"hour": f"{(start.hour + h) % 24:02d}", "maund": round(hours.get(h, 0), 1)} for h in range(24)]},
		"yard": {"waiting_gross": tokens.get("Issued", 0), "waiting_tare": tokens.get("Gross", 0), "oldest": str(oldest) if oldest else None,
			"oldest_minutes": max(0, int((now - get_datetime(oldest)).total_seconds() // 60)) if oldest and live else None,
			"stock_kg": stock["cane_yard_kg"]},
		"road": {"trucks": cint(road.trucks), "kg": flt(road.kg), "since": str(road.since) if road.since else None},
		"payments": {"unpaid_cprs": cint(unpaid.n), "unpaid_amount": flt(unpaid.amt), "oldest_unpaid": str(unpaid.oldest) if unpaid.oldest else None,
			"paid_today": paid_today, "bilties": cint(bilties.n), "bilty_amount": flt(bilties.amt), "loans": loans},
		"production": dmr and {**dmr, "crushing_day": str(dmr.crushing_day)},
		"stock": stock,
		"cost": {"provisional_per_bag": flt(frappe.db.get_value("Daily Production Entry", {"docstatus": 1, "crushing_day": ["<=", d]},
				"provisional_cost_per_bag", order_by="crushing_day desc")),
			"final": frappe.db.get_value("Costing Run", {"docstatus": 1}, ["name", "cost_per_bag", "to_date", "price_after_gst", "factory_overhead"],
				as_dict=True, order_by="to_date desc")},
		"stoppages": {"count": len(stop), "minutes": sum(cint(x.minutes) for x in stop if x.end) + (cint(open_stop.minutes) if open_stop else 0),
			"open": open_stop and {**open_stop, "start": str(open_stop.start)}, "list": [{**x, "start": str(x.start), "end": str(x.end) if x.end else None} for x in stop[:6]]},
		"plant": {"points": len(plant), "alerts": alerts[:8], "alert_count": len(alerts)},
		"season": {**season, "maund": round(flt(tot.maund), 1), "amount": flt(tot.amount), "loads": cint(tot.loads), "growers": cint(tot.growers),
			"days": cint(tot.days), "pct_target": _pct(tot.maund, target), "bags": flt(prod.bags),
			"recovery_pct": round(100 * flt(prod.sugar_kg) / flt(prod.crushed_kg), 2) if flt(prod.crushed_kg) else 0,
			"avg_day_maund": round(flt(tot.maund) / cint(tot.days), 0) if cint(tot.days) else 0,
			"days_to_target": round((target - flt(tot.maund)) / (flt(tot.maund) / cint(tot.days)), 0) if cint(tot.days) and flt(tot.maund) and target > flt(tot.maund) else 0},
		"trend": [{"day": str(r.day), "maund": round(flt(r.maund), 1), "loads": cint(r.loads),
			"bags": flt((made.get(str(r.day)) or {}).get("sugar_bags")), "recovery": flt((made.get(str(r.day)) or {}).get("recovery_pct"))} for r in trend],
		"circles": circle_performance(cfg.season, d)[:12],
		"messages": {r.status: cint(r.n) for r in frappe.db.sql("""select status, count(*) n from `tabSugar SMS Log`
			where direction = 'Out' and queued_at >= %s and queued_at < %s group by status""", (start, end), as_dict=True)},
	}
