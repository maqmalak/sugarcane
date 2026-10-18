"""Phase 5 demo: a laboratory and a plant floor for 2–6 Nov, on top of the procurement demo.

- hourly / two-hourly samples of every sample type around its target (a few outside the limits)
- vehicle (core) samples of about a third of the CPRs; varieties differ in recovery
- one to three stoppages a day; plant readings every two hours
- DMRs: 2–5 Nov approved and their production posted (Work Order + Manufacture); 6 Nov prepared, waiting for approval
- packing bags bought before the season
The demo buys only a sample of a real mill's cane, so Sugar Settings → mill capacity is set to 350 t/day here and the
"Cane Crush Rate" plant point to 8–16 t/h.
"""

import random
from datetime import datetime, timedelta

import frappe
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate

from sugarcane.calc import lab as calc

SEED = 55
DAYS = [getdate(f"2026-11-0{d}") for d in (2, 3, 4, 5, 6)]
APPROVED = DAYS[:4]
PACKING_REMARK = "Demo: packing bags for the season"
VARIETY_BIAS = {}  # variety → recovery offset (some varieties are richer)


def _as(prefix):
	frappe.set_user(f"{prefix}@micromaxsugar.example")


def _val(rnd, lo, hi, target, wide=False):
	spread = (hi - lo) / (2.2 if wide else 9)
	return round(rnd.gauss(target, spread), 3)


def samples(rnd):
	from sugarcane.cane_laboratory.lab import record_samples

	types = frappe.get_all("Lab Sample Type", filters={"is_active": 1}, fields=["name", "every_hours"])
	limits = {t.name: {l.parameter: l for l in frappe.get_doc("Lab Sample Type", t.name).limits} for t in types}
	rows = []
	for day in DAYS:
		start = datetime.combine(day, datetime.min.time()) + timedelta(hours=7)
		drift = rnd.uniform(-0.25, 0.25)  # a day's cane is a little richer or poorer
		for t in types:
			every = max(cint(t.every_hours), 1)
			for h in range(0, 24, every):
				r = {"sample_type": t.name, "sample_time": str(start + timedelta(hours=h, minutes=rnd.randint(0, 20)))}
				lim = limits[t.name]
				wide = rnd.random() < 0.04
				for p, l in lim.items():
					if p == "purity":
						continue
					v = _val(rnd, flt(l.min_value), flt(l.max_value), flt(l.target), wide)
					if p in ("brix", "pol"):
						v += drift * (0.3 if t.name in ("Sugar",) else 1)
					r[p] = round(max(v, 0), 3)
				if "purity" in lim and "brix" in lim:  # pol from brix × a purity drawn around its target (independent draws spread too wide)
					r["pol"] = round(r["brix"] * _val(rnd, flt(lim["purity"].min_value), flt(lim["purity"].max_value), flt(lim["purity"].target)) / 100, 3)
				if r.get("pol") and r.get("brix") and r["pol"] > r["brix"]:
					r["pol"] = round(r["brix"] * 0.86, 3)
				if t.name == "Sugar":
					r.pop("brix", None)
				rows.append(r)
	out = record_samples(rows, is_demo=1)
	return len(out["saved"])


def vehicle_samples(rnd):
	varieties = frappe.get_all("Cane Variety", pluck="name")
	for v in varieties:
		VARIETY_BIAS.setdefault(v, rnd.uniform(-0.9, 0.9))
	n = 0
	for c in frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": ["in", DAYS], "is_demo": 1},
			fields=["name", "indent", "posted_at"]):
		if rnd.random() > 0.35:
			continue
		variety = frappe.db.get_value("Cane Indent", c.indent, "variety") if c.indent else None
		bias = VARIETY_BIAS.get(variety, 0)
		brix = round(rnd.gauss(20.2 + bias * 0.6, 0.8), 2)
		pol = round(min(brix * rnd.uniform(0.84, 0.9) + bias * 0.4, brix - 0.5), 2)
		fibre = round(rnd.gauss(14.0, 0.7), 2)
		doc = frappe.get_doc({"doctype": "Vehicle Recovery Sample", "cpr": c.name, "brix": brix, "pol": pol, "fibre_pct": fibre,
			"sample_time": add_to_date(c.posted_at, minutes=-rnd.randint(20, 90)), "is_demo": 1})
		doc.insert(ignore_permissions=True)
		doc.submit()
		n += 1
	return n


def stoppages(rnd):
	cats = [("Mechanical", "Mill Tandem", "Carrier chain link broke"), ("Electrical", "Power House", "Feeder breaker tripped"),
		("No Cane", "Yard", "Yard empty — waiting for trucks"), ("Process", "Boiling House", "Juice heater cleaning"),
		("Mechanical", "Boiler", "Bagasse elevator jam"), ("Power", "Power House", "Grid supply lost")]
	n = 0
	for day in DAYS:
		start = datetime.combine(day, datetime.min.time()) + timedelta(hours=7)
		for k in range(rnd.randint(1, 3)):
			cat, sec, why = rnd.choice(cats)
			s = start + timedelta(hours=rnd.randint(1 + k * 7, 6 + k * 7), minutes=rnd.randint(0, 50))
			frappe.get_doc({"doctype": "Mill Stoppage", "start": s, "end": s + timedelta(minutes=rnd.randint(12, 95)), "category": cat,
				"section": sec, "reason": why, "is_demo": 1}).insert(ignore_permissions=True)
			n += 1
	return n


def plant(rnd):
	points = frappe.get_all("Plant Point", filters={"is_active": 1}, fields=["name", "min_value", "max_value"])
	n = 0
	for day in DAYS:
		start = datetime.combine(day, datetime.min.time()) + timedelta(hours=7)
		for h in range(0, 24, 2):
			vals = []
			for pt in points:
				lo, hi = flt(pt.min_value), flt(pt.max_value)
				v = rnd.uniform(lo, hi) if rnd.random() > 0.05 else hi * rnd.uniform(1.02, 1.1)
				vals.append({"point": pt.name, "value": round(v, 2)})
			frappe.get_doc({"doctype": "Plant Level Reading", "reading_time": start + timedelta(hours=h, minutes=5), "readings": vals,
				"is_demo": 1}).insert(ignore_permissions=True)
			n += 1
	return n


def packing_bags():
	s = frappe.get_cached_doc("Sugar Settings")
	if frappe.db.exists("Stock Entry", {"remarks": PACKING_REMARK, "docstatus": 1}):
		return
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "purpose": "Material Receipt", "company": s.company,
		"posting_date": "2026-11-01", "set_posting_time": 1, "posting_time": "08:00:00", "remarks": PACKING_REMARK,
		"items": [{"item_code": s.packing_item, "qty": 20000, "t_warehouse": s.packing_warehouse, "basic_rate": 45, "uom": "Nos",
			"conversion_factor": 1}]})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()


def dmrs(rnd):
	from sugarcane.cane_laboratory.lab import prepare_dmr
	from sugarcane.sugar_production.production import fill  # noqa: F401  (import check)

	made = 0
	for day in DAYS:
		_as("lab.chemist")
		d = frappe.get_doc({"doctype": "Daily Manufacturing Report", "crushing_day": day, "is_demo": 1})
		d.insert(ignore_permissions=True)
		available = cint(d.yard_opening_kg) + cint(d.cane_received_kg)
		d.yard_closing_kg = int(available * rnd.uniform(0.03, 0.08))
		d.save(ignore_permissions=True)
		rec = rnd.uniform(9.6, 10.8)
		crushed = cint(d.cane_crushed_kg)
		d.update({"sugar_bags": int(crushed * rec / 100 / 50), "molasses_kg": int(crushed * rnd.uniform(0.042, 0.047)),
			"bagasse_kg": int(crushed * rnd.uniform(0.29, 0.32)), "press_mud_kg": int(crushed * rnd.uniform(0.032, 0.038)),
			"remarks": "Steady crushing." if rec > 10 else "Recovery a little low: high bagasse pol, check the mill setting."})
		d.save(ignore_permissions=True)
		prepare_dmr(d.name)
		if day in APPROVED:
			_as("production")
			d.reload()
			d.flags.ignore_permissions = True
			d.submit()
			pe = frappe.get_doc({"doctype": "Daily Production Entry", "crushing_day": day, "is_demo": 1})
			pe.flags.ignore_permissions = True
			pe.insert()
			pe.submit()
		made += 1
	return made


def run():
	if frappe.db.exists("Lab Sample", {"is_demo": 1}):
		return 0
	from sugarcane.setup.lab_setup import ensure

	ensure()
	frappe.db.set_single_value("Sugar Settings", "mill_capacity_tcd", 350)
	# the demo mill crushes ~350 t a day, so its crush-rate point reads ~10–16 t/h (a real mill's range is set by the mill)
	if frappe.db.exists("Plant Point", "Cane Crush Rate"):
		frappe.db.set_value("Plant Point", "Cane Crush Rate", {"min_value": 8, "max_value": 16, "capacity": 20})
	frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
	rnd = random.Random(SEED)
	try:
		packing_bags()
		_as("lab.chemist")
		n = samples(rnd)
		vehicle_samples(rnd)
		stoppages(rnd)
		plant(rnd)
		dmrs(rnd)
	finally:
		frappe.set_user("Administrator")
	frappe.db.commit()
	return n


def reset():
	from sugarcane.setup.demo import _purge

	frappe.set_user("Administrator")
	for dt in ("Daily Production Entry", "Daily Manufacturing Report"):
		for name in frappe.get_all(dt, filters={"is_demo": 1, "docstatus": 1}, pluck="name", order_by="crushing_day desc"):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.cancel()
	for name in frappe.get_all("Stock Entry", filters={"remarks": PACKING_REMARK, "docstatus": 1}, pluck="name"):
		se = frappe.get_doc("Stock Entry", name)
		se.flags.ignore_permissions = True
		se.cancel()
	for dt in ("Daily Production Entry", "Daily Manufacturing Report", "Lab Sample", "Vehicle Recovery Sample", "Mill Stoppage", "Plant Level Reading"):
		_purge(dt, frappe.get_all(dt, filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()
