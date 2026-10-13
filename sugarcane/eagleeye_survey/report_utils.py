"""Shared code for the EagleEye survey reports: filters, row fetch (permission-aware) and group-by summaries."""

from collections import OrderedDict

import frappe
from frappe import _
from frappe.utils import flt

ROW_FIELDS = ["name", "survey_date", "survey_for", "competitor_mill", "grower", "grower_name", "cnic", "passbook_no",
	"zone", "circle", "sector", "village", "village_name", "murabba_no", "killa_no", "variety", "crop_type", "ratoon_no",
	"crop_condition", "disease", "disease_pct", "total_acres", "empty_land_acres", "crop_land_acres", "calc_area_acres",
	"area_variance_pct", "expected_yield", "expected_production_maund", "surveyor", "overlap_status", "inside_village"]


def survey_filters(filters) -> dict:
	filters = frappe._dict(filters or {})
	season = filters.season or frappe.db.get_single_value("Sugar Settings", "active_season")
	f = {"docstatus": 1, "season": season}
	for key in ("zone", "circle", "sector", "village", "variety", "crop_type", "surveyor", "grower", "disease"):
		if filters.get(key):
			f[key] = filters[key]
	f["survey_for"] = filters.survey_for or "Company"
	if f["survey_for"] == "All":
		f.pop("survey_for")
	if filters.from_date and filters.to_date:
		f["survey_date"] = ["between", [filters.from_date, filters.to_date]]
	return f


def survey_rows(filters, fields=ROW_FIELDS):
	return frappe.get_list("Cane Survey", filters=survey_filters(filters), fields=fields, order_by="survey_date asc, name asc",
		limit_page_length=0)


METRICS = [
	{"fieldname": "surveys", "label": _("Fields"), "fieldtype": "Int", "width": 80},
	{"fieldname": "growers", "label": _("Growers"), "fieldtype": "Int", "width": 85},
	{"fieldname": "declared_acres", "label": _("Declared (acres)"), "fieldtype": "Float", "precision": 2, "width": 120},
	{"fieldname": "acres", "label": _("Measured (acres)"), "fieldtype": "Float", "precision": 2, "width": 125},
	{"fieldname": "plant_acres", "label": _("Plant (acres)"), "fieldtype": "Float", "precision": 2, "width": 110},
	{"fieldname": "ratoon_acres", "label": _("Ratoon (acres)"), "fieldtype": "Float", "precision": 2, "width": 115},
	{"fieldname": "diseased_acres", "label": _("Diseased (acres)"), "fieldtype": "Float", "precision": 2, "width": 120},
	{"fieldname": "expected_maund", "label": _("Expected (maund)"), "fieldtype": "Float", "precision": 0, "width": 130},
	{"fieldname": "avg_yield", "label": _("Avg Yield (md/acre)"), "fieldtype": "Float", "precision": 0, "width": 130},
	{"fieldname": "share_pct", "label": _("Share of Area (%)"), "fieldtype": "Percent", "width": 120},
]


def grouped(filters, keys: list[dict], extra=None, chart_label=None):
	"""columns + rows summarised by `keys` ([{fieldname, label, fieldtype, options, width}] taken from survey rows)."""
	rows = survey_rows(filters)
	groups = OrderedDict()
	for r in sorted(rows, key=lambda r: tuple(str(r.get(k["fieldname"]) or "") for k in keys)):
		key = tuple(r.get(k["fieldname"]) for k in keys)
		g = groups.setdefault(key, {"surveys": 0, "growers": set(), "declared_acres": 0.0, "acres": 0.0, "plant_acres": 0.0,
			"ratoon_acres": 0.0, "diseased_acres": 0.0, "expected_maund": 0.0, "_rows": []})
		area = flt(r.calc_area_acres)
		g["surveys"] += 1
		if r.grower:
			g["growers"].add(r.grower)
		g["declared_acres"] += flt(r.crop_land_acres)
		g["acres"] += area
		g["plant_acres" if r.crop_type != "Ratoon" else "ratoon_acres"] += area
		if r.disease:
			g["diseased_acres"] += area
		g["expected_maund"] += flt(r.expected_production_maund)
		g["_rows"].append(r)
	total_area = sum(g["acres"] for g in groups.values()) or 1
	data = []
	for key, g in groups.items():
		row = {k["fieldname"]: v for k, v in zip(keys, key, strict=False)}
		row.update({m: g[m] for m in ("surveys", "declared_acres", "acres", "plant_acres", "ratoon_acres", "diseased_acres",
			"expected_maund")})
		row["growers"] = len(g["growers"])
		row["avg_yield"] = g["expected_maund"] / g["acres"] if g["acres"] else 0
		row["share_pct"] = 100 * g["acres"] / total_area
		if extra:
			row.update(extra(key, g["_rows"]) or {})
		data.append(row)
	if data:
		total = {keys[0]["fieldname"]: _("Total"), "bold": 1, "share_pct": 100,
			"growers": len({g for grp in groups.values() for g in grp["growers"]})}
		for m in ("surveys", "declared_acres", "acres", "plant_acres", "ratoon_acres", "diseased_acres", "expected_maund"):
			total[m] = sum(d[m] for d in data)
		total["avg_yield"] = total["expected_maund"] / total["acres"] if total["acres"] else 0
		if extra:
			total.update({k: sum(flt(d.get(k)) for d in data) for k in data[0] if k not in total and k not in
				{c["fieldname"] for c in keys} and isinstance(data[0].get(k), (int, float))})
	columns = [*keys, *METRICS]
	chart = None
	if data and len(keys) == 1:
		chart = {"data": {"labels": [str(d[keys[0]["fieldname"]] or "—") for d in data],
			"datasets": [{"name": chart_label or _("Measured acres"), "values": [round(d["acres"], 1) for d in data]}]},
			"type": "bar", "colors": ["#2f9e44"]}
	if data:
		data.append(total)
	return columns, data, None, chart


def col(fieldname, label, fieldtype="Data", options=None, width=140):
	c = {"fieldname": fieldname, "label": _(label), "fieldtype": fieldtype, "width": width}
	if options:
		c["options"] = options
	return c
