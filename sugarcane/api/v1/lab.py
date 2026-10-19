"""Laboratory, production and plant (Phase 5).

Lab         GET masters · GET grid?day= (sample types × hours) · POST record {rows} · GET vehicle?day= · POST vehicle_sample {cpr, …}
            GET stoppages?day= · POST stoppage {start, end, category, section, reason} · POST end_stoppage {name, end}
DMR         GET dmr?day= (saved or a preview) · POST save_dmr {day, yard_closing_kg, sugar_bags, …} · POST prepare {day} · POST approve {day}
Production  GET production_days · POST post_production {day}
Plant       GET plant · POST plant_reading {reading_time, values: {point: value}} · GET plant_history?point=&hours=
Dashboard   GET insights?days=
"""

from collections import defaultdict
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.calc import lab as calc
from sugarcane.cane_laboratory import lab
from sugarcane.cane_procurement.procurement import crushing_day, day_window

VIEW = lab.LAB_ROLES | {"Cane Manager", "MIS Viewer", "Cane Accountant"}
DMR_FIELDS = ["yard_closing_kg", "sugar_bags", "molasses_kg", "bagasse_kg", "bagasse_burnt_kg", "press_mud_kg", "mixed_juice_kg", "pol_pct_cane", "remarks"]
SHIFT_FIELDS = ("mill_hours", "sugar_bags", "molasses_kg", "bagasse_kg", "bagasse_burnt_kg", "press_mud_kg", "remarks")


def _need(roles, what):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to {0}").format(what), frappe.PermissionError)


def _day(day):
	return getdate(day) if day else crushing_day()


@frappe.whitelist(methods=["GET"])
def masters() -> dict:
	_need(VIEW, _("see the laboratory"))
	types = []
	for t in frappe.get_all("Lab Sample Type", filters={"is_active": 1}, fields=["name", "code", "stage", "every_hours", "sequence"],
			order_by="sequence asc, name asc"):
		t.limits = frappe.get_all("Lab Parameter Limit", filters={"parent": t.name, "parenttype": "Lab Sample Type"},
			fields=["parameter", "min_value", "max_value", "target"], order_by="idx")
		types.append(t)
	return {"types": types, "day": str(crushing_day()), "can_record": bool(lab.LAB_ROLES & set(frappe.get_roles())),
		"can_approve": bool(lab.APPROVE_ROLES & set(frappe.get_roles())), "parameters": list(calc.PARAMETERS)}


@frappe.whitelist(methods=["GET"])
def grid(day: str | None = None) -> dict:
	"""The day's samples by type and hour (07:00 … 06:00)."""
	_need(VIEW, _("see the laboratory"))
	d = _day(day)
	start, _end = day_window(d)
	rows = frappe.get_all("Lab Sample", filters={"docstatus": 1, "crushing_day": d}, fields=["name", "sample_type", "hour", "sample_time",
		"out_of_range", "problems", *calc.PARAMETERS], limit=0)
	cells = defaultdict(dict)
	for r in rows:
		cells[r.sample_type][r.hour] = r
	return {"day": str(d), "hours": [(start + timedelta(hours=h)).strftime("%H:00") for h in range(24)],
		"start": str(start), "cells": cells, "averages": {a["sample_type"]: a for a in lab.analyses(d)}}


@frappe.whitelist(methods=["POST"])
def record(rows) -> dict:
	rows = frappe.parse_json(rows) if isinstance(rows, str) else rows
	return lab.record_samples(rows)


@frappe.whitelist(methods=["GET"])
def vehicle(day: str | None = None) -> dict:
	_need(VIEW, _("see the laboratory"))
	d = _day(day)
	done = frappe.get_all("Vehicle Recovery Sample", filters={"docstatus": 1, "crushing_day": d}, fields=["name", "cpr", "grower_name", "circle",
		"variety", "vehicle_no", "brix", "pol", "purity", "fibre_pct", "ccs_pct", "est_recovery_pct", "sample_time"], order_by="sample_time desc")
	sampled = {r.cpr for r in done}
	cprs = [c for c in frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": d}, fields=["name", "grower_name", "circle",
		"vehicle_no", "payable_maund", "posted_at", "point_name", "source"], order_by="posted_at desc", limit=300) if c.name not in sampled]
	return {"day": str(d), "samples": done, "cprs": cprs}


@frappe.whitelist(methods=["POST"])
def vehicle_sample(cpr: str, brix, pol, fibre_pct, variety=None, remarks=None) -> dict:
	_need(lab.LAB_ROLES, _("record vehicle samples"))
	doc = frappe.get_doc({"doctype": "Vehicle Recovery Sample", "cpr": cpr, "brix": flt(brix), "pol": flt(pol), "fibre_pct": flt(fibre_pct),
		"variety": variety or None, "remarks": remarks})
	doc.insert(ignore_permissions=True)
	doc.submit()
	return doc.as_dict()


@frappe.whitelist(methods=["GET"])
def stoppages(day: str | None = None) -> dict:
	_need(VIEW, _("see stoppages"))
	d = _day(day)
	minutes, rows = lab.stoppage_minutes(d)
	open_ = frappe.get_all("Mill Stoppage", filters={"end": ["is", "not set"]}, fields=["name", "start", "category", "section", "reason"])
	return {"day": str(d), "minutes": minutes, "rows": rows, "open": open_}


@frappe.whitelist(methods=["POST"])
def stoppage(start, category, reason, section=None, end=None) -> dict:
	_need(lab.LAB_ROLES, _("record stoppages"))
	doc = frappe.get_doc({"doctype": "Mill Stoppage", "start": get_datetime(start), "end": get_datetime(end) if end else None,
		"category": category, "section": section, "reason": reason})
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def end_stoppage(name: str, end=None) -> dict:
	_need(lab.LAB_ROLES, _("record stoppages"))
	doc = frappe.get_doc("Mill Stoppage", name)
	doc.end = get_datetime(end) if end else now_datetime()
	doc.save(ignore_permissions=True)
	return doc.as_dict()


# ---------------------------------------------------------------- DMR
def _dmr_name(d):
	return frappe.db.get_value("Daily Manufacturing Report", {"crushing_day": d, "docstatus": ["<", 2]}, "name")


@frappe.whitelist(methods=["GET"])
def dmr(day: str | None = None) -> dict:
	"""The day's DMR, or a preview built from the day's data when none is saved yet."""
	_need(VIEW, _("see the DMR"))
	d = _day(day)
	name = _dmr_name(d)
	if name:
		doc = frappe.get_doc("Daily Manufacturing Report", name)
		saved = True
	else:
		doc = frappe.new_doc("Daily Manufacturing Report")
		doc.crushing_day = d
		lab.build_dmr(doc)
		saved = False
	out = doc.as_dict()
	out["saved"] = saved
	out["stoppages"] = lab.stoppage_minutes(d)[1]
	out["production"] = frappe.db.get_value("Daily Production Entry", {"crushing_day": d, "docstatus": 1}, ["name", "stock_entry", "cost_per_bag"],
		as_dict=True)
	out["day_closed"] = bool(frappe.db.exists("Daily Cane Purchase", {"crushing_day": d, "docstatus": 1}))
	from sugarcane.sugar_production.doctype.sugar_grade.sugar_grade import grades

	out["grade_list"] = grades()
	return out


@frappe.whitelist(methods=["POST"])
def save_dmr(day: str, **values) -> dict:
	_need(lab.LAB_ROLES, _("prepare the DMR"))
	d = getdate(day)
	name = _dmr_name(d)
	doc = frappe.get_doc("Daily Manufacturing Report", name) if name else frappe.new_doc("Daily Manufacturing Report")
	if doc.docstatus == 1:
		frappe.throw(_("The DMR of {0} is approved; cancel it to change it").format(frappe.utils.formatdate(d)))
	doc.crushing_day = d
	for f in DMR_FIELDS:
		if f in values:
			v = values[f]
			doc.set(f, (v if f == "remarks" else (flt(v) if f == "pol_pct_cane" else cint(v))) if v not in (None, "") else None)
	if values.get("grades") not in (None, ""):  # {grade: bags}
		g = frappe.parse_json(values["grades"])
		doc.set("grades", [{"grade": k, "bags": cint(v)} for k, v in g.items() if cint(v)])
	if values.get("shifts") not in (None, ""):  # [{shift, sugar_bags, …}]
		doc.set("shifts", [{"shift": r.get("shift"), **{k: (r.get(k) if k == "remarks" else (flt(r.get(k)) if k == "mill_hours" else cint(r.get(k))))
			for k in SHIFT_FIELDS if r.get(k) not in (None, "")}} for r in frappe.parse_json(values["shifts"]) if r.get("shift")])
	doc.status = "Draft"
	doc.flags.ignore_permissions = True
	doc.save()
	return dmr(str(d))


@frappe.whitelist(methods=["POST"])
def prepare(day: str) -> dict:
	name = _dmr_name(getdate(day))
	if not name:
		frappe.throw(_("Save the DMR first"))
	lab.prepare_dmr(name)
	return dmr(day)


@frappe.whitelist(methods=["POST"])
def approve(day: str) -> dict:
	_need(lab.APPROVE_ROLES, _("approve the DMR"))
	doc = frappe.get_doc("Daily Manufacturing Report", _dmr_name(getdate(day)))
	doc.flags.ignore_permissions = True
	doc.submit()
	return dmr(day)


# ---------------------------------------------------------------- production
@frappe.whitelist(methods=["GET"])
def production_days(limit: int = 30) -> dict:
	_need(VIEW | {"Production Manager"}, _("see production"))
	from sugarcane.stock import stock_qty

	rows = frappe.get_all("Daily Manufacturing Report", filters={"docstatus": ["<", 2]}, fields=["name", "crushing_day", "status", "docstatus",
		"cane_crushed_kg", "sugar_bags", "recovery_pct", "molasses_kg", "bagasse_kg", "press_mud_kg", "running_hours", "crush_rate_tph"],
		order_by="crushing_day desc", limit=cint(limit))
	for r in rows:
		r.production = frappe.db.get_value("Daily Production Entry", {"crushing_day": r.crushing_day, "docstatus": 1},
			["name", "stock_entry", "work_order", "cost_per_bag", "sugar_value", "by_product_value", "cane_cost"], as_dict=True)
		r.day_closed = bool(frappe.db.exists("Daily Cane Purchase", {"crushing_day": r.crushing_day, "docstatus": 1}))
	s = frappe.get_cached_doc("Sugar Settings")
	stock = {}
	for label, item, wh in (("sugar_bags", s.sugar_item, s.sugar_warehouse), ("molasses_kg", s.molasses_item, s.byproduct_warehouse),
			("bagasse_kg", s.bagasse_item, s.byproduct_warehouse), ("press_mud_kg", s.press_mud_item, s.byproduct_warehouse),
			("packing_bags", s.packing_item, s.packing_warehouse), ("yard_kg", s.cane_item, s.cane_yard_warehouse)):
		stock[label] = stock_qty(item, wh)
	return {"rows": rows, "stock": stock, "can_post": bool({"System Manager", "Cane Admin", "Production Manager"} & set(frappe.get_roles()))}


@frappe.whitelist(methods=["POST"])
def post_production(day: str) -> dict:
	d = getdate(day)
	name = frappe.db.get_value("Daily Production Entry", {"crushing_day": d, "docstatus": 0}, "name")
	doc = frappe.get_doc("Daily Production Entry", name) if name else frappe.new_doc("Daily Production Entry")
	doc.crushing_day = d
	doc.flags.ignore_permissions = True
	doc.save()
	doc.submit()
	return frappe.get_doc("Daily Production Entry", doc.name).as_dict()


# ---------------------------------------------------------------- plant
@frappe.whitelist(methods=["GET"])
def plant() -> dict:
	_need(VIEW | {"Production Manager"}, _("see the plant"))
	from sugarcane.sugar_mis.plant import latest

	return {**latest(), "can_record": bool(lab.LAB_ROLES & set(frappe.get_roles()))}


@frappe.whitelist(methods=["POST"])
def plant_reading(values, reading_time=None, remarks=None) -> dict:
	_need(lab.LAB_ROLES, _("record plant readings"))
	values = frappe.parse_json(values) if isinstance(values, str) else values
	doc = frappe.get_doc({"doctype": "Plant Level Reading", "reading_time": get_datetime(reading_time) if reading_time else now_datetime(),
		"remarks": remarks, "readings": [{"point": k, "value": flt(v)} for k, v in values.items() if v not in (None, "")]})
	if not doc.readings:
		frappe.throw(_("Enter at least one reading"))
	doc.insert(ignore_permissions=True)
	return doc.as_dict()


@frappe.whitelist(methods=["GET"])
def plant_history(point: str | None = None, hours: int = 48, until: str | None = None) -> list:
	_need(VIEW | {"Production Manager"}, _("see the plant"))
	end = get_datetime(until) if until else frappe.db.sql("select max(reading_time) from `tabPlant Level Reading`")[0][0] or now_datetime()
	start = get_datetime(end) - timedelta(hours=cint(hours) or 48)
	cond = "and v.point = %(p)s" if point else ""
	return frappe.db.sql(f"""select p.reading_time, v.point, v.value, v.out_of_range from `tabPlant Level Value` v
		join `tabPlant Level Reading` p on p.name = v.parent where p.reading_time between %(s)s and %(e)s {cond}
		order by p.reading_time""", {"s": start, "e": end, "p": point}, as_dict=True)


# ---------------------------------------------------------------- dashboard
@frappe.whitelist(methods=["GET"])
def insights(days: int = 14, day: str | None = None) -> dict:
	_need(VIEW | {"Production Manager"}, _("see the laboratory"))
	last = frappe.db.sql("select max(crushing_day) from `tabLab Sample` where docstatus = 1")[0][0]
	d = getdate(day) if day else (last or crushing_day())
	start = add_days(d, -(cint(days) - 1))
	dmrs = frappe.get_all("Daily Manufacturing Report", filters={"docstatus": ["<", 2], "crushing_day": ["between", [start, d]]},
		fields=["crushing_day", "status", "cane_crushed_kg", "sugar_bags", "recovery_pct", "running_hours", "stoppage_minutes", "crush_rate_tph",
			"loss_bagasse", "loss_molasses", "loss_press_mud", "loss_undetermined", "pol_pct_cane", "molasses_pct_cane", "bagasse_pct_cane"],
		order_by="crushing_day")
	g = grid(str(d))
	mj = "Mixed Juice"
	hourly = [{"hour": h, **({k: g["cells"].get(mj, {}).get(h, {}).get(k) for k in ("brix", "pol", "purity")})} for h in g["hours"]]
	oor = frappe.get_all("Lab Sample", filters={"docstatus": 1, "crushing_day": d, "out_of_range": 1}, fields=["name", "sample_type", "hour",
		"problems"], order_by="sample_time")
	by_variety = frappe.db.sql("""select ifnull(variety, '—') variety, count(*) samples, avg(ccs_pct) ccs, avg(est_recovery_pct) recovery,
		avg(purity) purity, avg(fibre_pct) fibre from `tabVehicle Recovery Sample` where docstatus = 1 and crushing_day between %s and %s
		group by variety order by recovery desc""", (start, d), as_dict=True)
	by_circle = frappe.db.sql("""select ifnull(circle, '—') circle, count(*) samples, avg(est_recovery_pct) recovery, avg(ccs_pct) ccs
		from `tabVehicle Recovery Sample` where docstatus = 1 and crushing_day between %s and %s group by circle order by recovery desc""",
		(start, d), as_dict=True)
	stops = frappe.db.sql("""select category, count(*) n, sum(minutes) minutes from `tabMill Stoppage` where crushing_day between %s and %s
		group by category order by minutes desc""", (start, d), as_dict=True)
	today = next((x for x in dmrs if getdate(x.crushing_day) == d), None)
	return {"day": str(d), "from": str(start), "dmr": today, "trend": [{**x, "crushing_day": str(x.crushing_day)} for x in dmrs], "hourly": hourly,
		"averages": g["averages"], "out_of_range": oor, "by_variety": by_variety, "by_circle": by_circle, "stoppages": stops,
		"samples_today": sum(len(v) for v in g["cells"].values())}
