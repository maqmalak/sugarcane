"""Plant levels (Phase 5): tank levels, pressures, temperatures and rates read every hour; a value outside the point's normal
range is flagged."""

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime

from sugarcane.cane_procurement.procurement import crushing_day


def validate_reading(doc):
	from sugarcane.cane_laboratory.lab import shift_for

	doc.crushing_day = crushing_day(doc.reading_time)
	doc.shift = shift_for(doc.reading_time)
	doc.recorded_by = doc.recorded_by or frappe.session.user
	seen, bad = set(), 0
	for r in doc.readings:
		if r.point in seen:
			frappe.throw(_("{0} is read twice").format(r.point))
		seen.add(r.point)
		pt = frappe.get_cached_value("Plant Point", r.point, ["unit", "min_value", "max_value"], as_dict=True)
		r.unit = pt.unit
		v = flt(r.value)
		r.out_of_range = 1 if (pt.min_value and v < flt(pt.min_value)) or (pt.max_value and v > flt(pt.max_value)) else 0
		bad += r.out_of_range
	doc.out_of_range = bad


def latest() -> dict:
	"""The last reading of every point, with its normal range — for the plant board."""
	points = frappe.get_all("Plant Point", filters={"is_active": 1}, fields=["name", "section", "unit", "min_value", "max_value", "capacity",
		"sequence"], order_by="sequence asc, name asc")
	last = {}
	for r in frappe.db.sql("""select v.point, v.value, v.out_of_range, p.reading_time from `tabPlant Level Value` v
		join `tabPlant Level Reading` p on p.name = v.parent order by p.reading_time desc limit 2000""", as_dict=True):
		last.setdefault(r.point, r)
	return {"points": [{**pt, **({"value": last[pt.name].value, "at": str(last[pt.name].reading_time), "out_of_range": cint(last[pt.name].out_of_range)}
		if pt.name in last else {})} for pt in points]}
