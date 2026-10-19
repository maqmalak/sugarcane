"""Laboratory (Phase 5): hourly samples, vehicle (cane) samples, mill stoppages and the Daily Manufacturing Report.

Samples      one per sample type per hour of the crushing day; purity is computed; a value outside the type's limits is
             flagged (not refused — the lab records what it measured).
Vehicle      a core sample from a CPR's load → juice brix / pol, fibre → CCS and estimated recovery; grower, variety and
             circle come from the CPR (and its indent), so recovery can be compared by variety, circle and grower.
Stoppages    start / end; the minutes inside a crushing day count against that day's running hours; no two overlap.
DMR          built from the day's data: cane received (gate CPRs + depot trucks received), yard opening (yesterday's closing)
             and closing (entered), crushed = opening + received − closing; stoppages → running hours, crush rate;
             bags and by-products (entered) → recovery and % cane; average analyses of the day's samples; pol losses;
             season to date. Prepared by the lab, approved (submitted) by the Production Manager.
"""

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime

from sugarcane.calc import lab as calc
from sugarcane.cane_procurement.procurement import crushing_day, day_window, season_for, settings

LAB_ROLES = {"System Manager", "Cane Admin", "Lab Chemist", "Production Manager"}
APPROVE_ROLES = {"System Manager", "Cane Admin", "Production Manager"}
STREAMS = {"bagasse": "Bagasse", "press_mud": "Press Mud", "molasses": "Molasses"}  # DMR loss → sample stage


def shift_for(dt) -> str | None:
	t = get_datetime(dt).time()
	for s in frappe.get_all("Crushing Shift", filters={"is_active": 1}, fields=["name", "start_time", "end_time"]):
		start, end = _t(s.start_time), _t(s.end_time)
		if (start <= t < end) if start < end else (t >= start or t < end):
			return s.name
	return None


def _t(v):
	if isinstance(v, time):
		return v
	if isinstance(v, timedelta):
		return (datetime.min + v).time()
	return datetime.strptime(str(v).split(".")[0], "%H:%M:%S").time()


# ---------------------------------------------------------------- samples
def validate_sample(doc):
	st = frappe.get_cached_doc("Lab Sample Type", doc.sample_type)
	doc.stage = st.stage
	doc.crushing_day = crushing_day(doc.sample_time)
	doc.hour = get_datetime(doc.sample_time).strftime("%H:00")
	doc.shift = shift_for(doc.sample_time)
	doc.chemist = doc.chemist or frappe.session.user
	try:
		doc.purity = calc.purity(doc.pol, doc.brix)
	except calc.LabError as e:
		frappe.throw(str(e), title=_("Lab sample"))
	problems = []
	for lim in st.limits:
		v = doc.get(lim.parameter)
		if v in (None, ""):
			continue
		v = flt(v)
		if (lim.min_value and v < flt(lim.min_value)) or (lim.max_value and v > flt(lim.max_value)):
			problems.append(f"{lim.parameter} {v:g} (normal {flt(lim.min_value):g}–{flt(lim.max_value):g})")
	doc.out_of_range = 1 if problems else 0
	doc.problems = "; ".join(problems) or None
	other = frappe.db.get_value("Lab Sample", {"sample_type": doc.sample_type, "crushing_day": doc.crushing_day, "hour": doc.hour,
		"docstatus": 1, "name": ["!=", doc.name or ""]}, "name")
	if other:
		frappe.throw(_("{0} at {1} on {2} is already recorded ({3}); amend that one instead").format(doc.sample_type, doc.hour,
			frappe.utils.formatdate(doc.crushing_day), other), title=_("Duplicate sample"))


def record_samples(rows: list[dict], is_demo=0) -> dict:
	"""The entry grid: several samples at once, each saved and submitted on its own; errors come back per row."""
	if not LAB_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the laboratory records samples"), frappe.PermissionError)
	done, errors = [], []
	for i, r in enumerate(rows or []):
		values = {k: r.get(k) for k in calc.PARAMETERS if k != "purity" and r.get(k) not in (None, "")}
		if not values:
			continue
		try:
			doc = frappe.get_doc({"doctype": "Lab Sample", "sample_type": r["sample_type"], "sample_time": r["sample_time"],
				"remarks": r.get("remarks"), "is_demo": cint(is_demo), **values})
			doc.insert(ignore_permissions=True)
			doc.submit()
			done.append({"row": i, "name": doc.name, "purity": doc.purity, "out_of_range": doc.out_of_range, "problems": doc.problems})
		except frappe.ValidationError as e:
			frappe.clear_last_message()
			errors.append({"row": i, "error": str(e)})
	return {"saved": done, "errors": errors}


# ---------------------------------------------------------------- vehicle samples
def validate_vehicle_sample(doc):
	cpr = frappe.db.get_value("Cane Purchase Receipt", doc.cpr, ["docstatus", "grower", "grower_name", "circle", "village_name", "source",
		"vehicle_no", "payable_maund", "posting_date", "indent", "posted_at"], as_dict=True)
	if not cpr or cpr.docstatus != 1:
		frappe.throw(_("CPR {0} is not submitted").format(doc.cpr))
	doc.update({k: cpr[k] for k in ("grower", "grower_name", "circle", "village_name", "source", "vehicle_no", "payable_maund")})
	doc.sample_time = doc.sample_time or cpr.posted_at or now_datetime()
	doc.crushing_day = cpr.posting_date
	if cpr.indent:
		ind = frappe.db.get_value("Cane Indent", cpr.indent, ["variety", "crop_type"], as_dict=True) or {}
		doc.variety = doc.variety or ind.get("variety")
		doc.crop_type = ind.get("crop_type")
	try:
		doc.purity = calc.purity(doc.pol, doc.brix)
		doc.ccs_pct = calc.ccs(doc.pol, doc.brix, doc.fibre_pct)
	except calc.LabError as e:
		frappe.throw(str(e), title=_("Vehicle sample"))
	doc.est_recovery_pct = round(flt(doc.ccs_pct) * (flt(frappe.db.get_single_value("Sugar Settings", "ccs_recovery_factor")) or 0.95), 2)


# ---------------------------------------------------------------- stoppages
def validate_stoppage(doc):
	doc.crushing_day = crushing_day(doc.start)
	doc.shift = shift_for(doc.start)
	doc.recorded_by = doc.recorded_by or frappe.session.user
	if doc.end:
		if get_datetime(doc.end) <= get_datetime(doc.start):
			frappe.throw(_("The mill must restart after it stopped"))
		doc.minutes = int((get_datetime(doc.end) - get_datetime(doc.start)).total_seconds() // 60)
	else:
		doc.minutes = 0
	end = get_datetime(doc.end) if doc.end else get_datetime("2999-01-01")
	clash = frappe.db.sql("""select name from `tabMill Stoppage` where name != %(n)s and start < %(e)s
		and ifnull(`end`, '2999-01-01') > %(s)s limit 1""", {"n": doc.name or "", "s": get_datetime(doc.start), "e": end})
	if clash:
		frappe.throw(_("This stoppage overlaps {0}").format(clash[0][0]), title=_("Overlapping stoppage"))


def stoppage_minutes(day) -> tuple[int, list]:
	"""Minutes stopped inside the crushing day (a stoppage across 07:00 is split; one still open counts until now)."""
	start, end = day_window(day)
	rows = frappe.db.sql("""select name, start, `end`, category, section, reason from `tabMill Stoppage`
		where start < %(e)s and ifnull(`end`, %(now)s) > %(s)s order by start""", {"s": start, "e": end, "now": now_datetime()}, as_dict=True)
	total = 0
	for r in rows:
		a, b = max(get_datetime(r.start), start), min(get_datetime(r.end) if r.end else now_datetime(), end)
		r.minutes_in_day = max(0, int((b - a).total_seconds() // 60))
		total += r.minutes_in_day
	return min(total, 24 * 60), rows


# ---------------------------------------------------------------- DMR
def cane_received(day) -> dict:
	cfg = settings()
	gate = cint(frappe.db.sql("""select ifnull(sum(payable_kg), 0) from `tabCane Purchase Receipt` where docstatus = 1 and posting_date = %s
		and ifnull(purchase_depot, '') = ''""", getdate(day))[0][0])
	depots = cint(frappe.db.sql("""select ifnull(sum(received_kg), 0) from `tabDepot Dispatch` where docstatus = 1 and status = 'Received'
		and received_day = %s""", getdate(day))[0][0])
	return {"gate": gate, "depots": depots, "total": gate + depots, "maund_kg": cfg.maund_kg}


def analyses(day) -> list[dict]:
	out = []
	for st in frappe.get_all("Lab Sample Type", filters={"is_active": 1}, fields=["name", "stage"], order_by="sequence asc, name asc"):
		rows = frappe.get_all("Lab Sample", filters={"docstatus": 1, "crushing_day": getdate(day), "sample_type": st.name},
			fields=list(calc.PARAMETERS) + ["out_of_range"])
		if rows:
			a = calc.average(rows)
			out.append({"sample_type": st.name, "stage": st.stage, **{k: a.get(k) for k in calc.PARAMETERS}, "samples": a["samples"],
				"out_of_range": sum(cint(r.out_of_range) for r in rows)})
	return out


def pol_pct_cane(day) -> float | None:
	"""Average pol % cane of the day's vehicle samples: juice pol × (1 − (fibre + 5) / 100)."""
	rows = frappe.get_all("Vehicle Recovery Sample", filters={"docstatus": 1, "crushing_day": getdate(day)}, fields=["pol", "fibre_pct"])
	vals = [flt(r.pol) * (1 - (flt(r.fibre_pct) + 5) / 100) for r in rows if r.pol]
	return round(sum(vals) / len(vals), 3) if vals else None


def shift_windows(day) -> list[tuple]:
	"""(shift, start, end) of each active shift inside the crushing day (07:00 → 07:00)."""
	start, _end = day_window(day)
	out = []
	for s in frappe.get_all("Crushing Shift", filters={"is_active": 1}, fields=["name", "start_time", "end_time"], order_by="start_time asc"):
		a = datetime.combine(getdate(day), _t(s.start_time))
		if a < start:
			a += timedelta(days=1)
		b = datetime.combine(a.date(), _t(s.end_time))
		if b <= a:
			b += timedelta(days=1)
		out.append((s.name, a, b))
	return sorted(out, key=lambda x: x[1])


def fill_shifts(doc, day):
	"""Cane received and stoppage minutes per shift (from the CPRs and the stoppages); the lab's entries per shift are kept,
	and when it entered bags or by-products per shift the day's figures are their sums."""
	entered = {r.shift: r for r in doc.get("shifts") or []}
	rows = []
	for name, a, b in shift_windows(day):
		r = entered.get(name) or frappe._dict(shift=name)
		cane = cint(frappe.db.sql("""select ifnull(sum(payable_kg), 0) from `tabCane Purchase Receipt` where docstatus = 1 and posted_at >= %s
			and posted_at < %s and ifnull(purchase_depot, '') = ''""", (a, b))[0][0])
		cane += cint(frappe.db.sql("""select ifnull(sum(received_kg), 0) from `tabDepot Dispatch` where docstatus = 1 and status = 'Received'
			and mill_tare_at >= %s and mill_tare_at < %s""", (a, b))[0][0])
		mins = 0
		for s in frappe.db.sql("""select start, `end` from `tabMill Stoppage` where start < %s and ifnull(`end`, %s) > %s""", (b, now_datetime(), a), as_dict=True):
			x, y = max(get_datetime(s.start), a), min(get_datetime(s.end) if s.end else now_datetime(), b)
			mins += max(0, int((y - x).total_seconds() // 60))
		rows.append({"shift": name, "cane_received_kg": cane, "stoppage_minutes": mins,
			"mill_hours": flt(r.get("mill_hours")) or round(max((b - a).total_seconds() / 60 - mins, 0) / 60, 2),
			**{k: r.get(k) for k in ("sugar_bags", "molasses_kg", "bagasse_kg", "bagasse_burnt_kg", "press_mud_kg", "remarks")}})
	doc.set("shifts", rows)
	for field in ("sugar_bags", "molasses_kg", "bagasse_kg", "bagasse_burnt_kg", "press_mud_kg"):
		total = sum(cint(r.get(field)) for r in rows)
		if total:
			doc.set(field, total)


def fill_grades(doc):
	"""Bags by grade: each row's item from its grade; with rows, the day's bags are their sum."""
	from sugarcane.sugar_production.doctype.sugar_grade.sugar_grade import default_grade

	rows = [g for g in doc.get("grades") or [] if g.grade]
	for g in rows:
		g.item = frappe.db.get_value("Sugar Grade", g.grade, "item")
		if cint(g.bags) < 0:
			frappe.throw(_("Bags can't be negative ({0})").format(g.grade))
	if rows and sum(cint(g.bags) for g in rows):
		doc.sugar_bags = sum(cint(g.bags) for g in rows)
	elif cint(doc.sugar_bags) and not rows:
		d = default_grade()
		if d.name:
			doc.set("grades", [{"grade": d.name, "item": d.item, "bags": cint(doc.sugar_bags)}])


def build_dmr(doc):
	"""Fill every computed field of a DMR from the day's data and the lab's entries (yard closing, bags, by-products)."""
	day = getdate(doc.crushing_day)
	doc.season = season_for(day)
	fill_shifts(doc, day)
	fill_grades(doc)
	if cint(doc.bagasse_burnt_kg) > cint(doc.bagasse_kg):
		frappe.throw(_("More bagasse burnt ({0} kg) than produced ({1} kg)").format(cint(doc.bagasse_burnt_kg), cint(doc.bagasse_kg)))
	doc.bagasse_to_yard_kg = max(cint(doc.bagasse_kg) - cint(doc.bagasse_burnt_kg), 0)
	cane = cane_received(day)
	doc.cane_from_gate_kg, doc.cane_from_depots_kg, doc.cane_received_kg = cane["gate"], cane["depots"], cane["total"]
	prev = frappe.db.get_value("Daily Manufacturing Report", {"crushing_day": ["<", day], "docstatus": ["<", 2], "season": doc.season},
		"yard_closing_kg", order_by="crushing_day desc")
	doc.yard_opening_kg = cint(prev) if prev is not None else cint(doc.yard_opening_kg)
	try:
		doc.cane_crushed_kg = calc.crushed(doc.yard_opening_kg, doc.cane_received_kg, doc.yard_closing_kg)
	except calc.LabError as e:
		frappe.throw(str(e), title=_("Yard balance"))
	doc.cane_crushed_maund = round(doc.cane_crushed_kg / cane["maund_kg"], 3)
	minutes, _rows = stoppage_minutes(day)
	doc.stoppage_minutes = minutes
	doc.running_hours = round((24 * 60 - minutes) / 60, 2)
	doc.crush_rate_tph = calc.crush_rate_tph(doc.cane_crushed_kg, 24 * 60 - minutes)
	tcd = flt(frappe.db.get_single_value("Sugar Settings", "mill_capacity_tcd"))
	doc.capacity_use_pct = round(doc.cane_crushed_kg / 1000 * 100 / tcd, 2) if tcd else 0
	bag_kg = flt(frappe.db.get_value("Crushing Season", doc.season, "bag_weight_kg")) or 50
	doc.sugar_kg = int(cint(doc.sugar_bags) * bag_kg)
	doc.recovery_pct = calc.recovery_pct(doc.sugar_kg, doc.cane_crushed_kg)
	if doc.recovery_pct > 20:
		frappe.throw(_("Recovery {0}% is not possible — check the bags and the cane crushed").format(doc.recovery_pct))
	for f in ("molasses", "bagasse", "press_mud"):
		doc.set(f"{f}_pct_cane", calc.pct_cane(doc.get(f"{f}_kg"), doc.cane_crushed_kg))
	doc.set("analyses", [])
	stage_pol = {}
	for a in analyses(day):
		doc.append("analyses", {k: a.get(k) for k in ("sample_type", "samples", "brix", "pol", "purity", "ph", "moisture_pct", "fibre_pct",
			"colour_icumsa", "out_of_range")})
		stage_pol.setdefault(a["stage"], a.get("pol"))
	if not flt(doc.pol_pct_cane):
		doc.pol_pct_cane = pol_pct_cane(day)
	mj = next((a for a in doc.analyses if a.sample_type == "Mixed Juice"), None)
	doc.mixed_juice_purity = flt(mj.purity) if mj else None
	from sugarcane.calc.costing import mill_extraction

	doc.mill_extraction_pct = mill_extraction(doc.mixed_juice_kg, mj.pol if mj else None, doc.cane_crushed_kg, doc.pol_pct_cane)
	lo = calc.losses(doc.cane_crushed_kg, doc.bagasse_kg, stage_pol.get("Bagasse"), doc.press_mud_kg, stage_pol.get("Press Mud"),
		doc.molasses_kg, stage_pol.get("Molasses"), doc.recovery_pct, doc.pol_pct_cane)
	doc.loss_bagasse, doc.loss_press_mud, doc.loss_molasses, doc.loss_known, doc.loss_undetermined = (lo.bagasse, lo.press_mud, lo.molasses,
		lo.known, lo.undetermined)
	std = frappe.db.sql("""select ifnull(sum(cane_crushed_kg), 0), ifnull(sum(sugar_bags), 0), ifnull(sum(sugar_kg), 0), ifnull(sum(running_hours), 0)
		from `tabDaily Manufacturing Report` where docstatus = 1 and season = %s and crushing_day < %s""", (doc.season, day))[0]
	doc.std_cane_crushed_kg = cint(std[0]) + doc.cane_crushed_kg
	doc.std_sugar_bags = cint(std[1]) + cint(doc.sugar_bags)
	doc.std_recovery_pct = calc.recovery_pct(flt(std[2]) + doc.sugar_kg, doc.std_cane_crushed_kg)
	doc.std_running_hours = round(flt(std[3]) + doc.running_hours, 1)


def prepare_dmr(name: str):
	if not LAB_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the laboratory prepares the DMR"), frappe.PermissionError)
	doc = frappe.get_doc("Daily Manufacturing Report", name)
	if doc.docstatus != 0:
		frappe.throw(_("{0} is already approved").format(name))
	if not cint(doc.sugar_bags):
		frappe.throw(_("Enter the sugar bags made before preparing the report"))
	doc.status = "Prepared"
	doc.prepared_by, doc.prepared_at = frappe.session.user, now_datetime()
	doc.save(ignore_permissions=True)
	return doc
