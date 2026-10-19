# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, cint, flt, getdate

from sugarcane.cane_procurement.report_utils import col


def period(f):
	"""The filters' dates, else the season's (the latest season with production when none is given)."""
	season = f.get("season") or frappe.db.get_value("Daily Production Entry", {"docstatus": 1}, "season", order_by="crushing_day desc") or \
		frappe.db.get_single_value("Sugar Settings", "active_season")
	s = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"], as_dict=True) or frappe._dict()
	return season, getdate(f.get("from_date") or s.start_date), getdate(f.get("to_date") or s.end_date)


def _statement(season, start, end):
	from sugarcane.cane_costing.costing import compute

	company = frappe.db.get_single_value("Sugar Settings", "company")
	s_end = frappe.db.get_value("Crushing Season", season, "end_date") if season else None
	return compute(company, start, end, season, season_close=bool(s_end) and getdate(end) >= getdate(s_end), standalone=True)


def execute(filters=None):
	"""Cane cost + processing cost − by-product credit = net cost of sugar, per kg / bag / ton of cane — for the period, with
	the previous season beside it (process costing with by-product credit, from the books)."""
	f = frappe._dict(filters or {})
	season, start, end = period(f)
	cur = _statement(season, start, end)
	prev_name = frappe.db.get_value("Crushing Season", {"end_date": ["<", start]}, "name", order_by="end_date desc")
	prev = None
	if prev_name:
		p = frappe.db.get_value("Crushing Season", prev_name, ["start_date", "end_date"], as_dict=True)
		prev = _statement(prev_name, p.start_date, p.end_date)
	s = frappe.get_cached_doc("Sugar Settings")
	names = {s.molasses_item: "molasses", s.bagasse_item: "bagasse", s.press_mud_item: "press mud"}

	def line(label, key=None, fn=None, bold=0, basis=""):
		c = fn(cur) if fn else cur.get(key)
		p_ = (fn(prev) if fn else prev.get(key)) if prev else None
		return {"line": label, "basis": basis, "current": c, "previous": p_, "bold": bold}

	def head(label):
		return {"line": label, "basis": "", "current": None, "previous": None, "bold": 1}

	foh = sorted(set(cur["structure"]["foh_lines"]) | set(prev["structure"]["foh_lines"] if prev else []))
	procs = [x["process_name"] for x in cur["processes"]]
	rows = [head("Direct materials"),
		line("  Cane price (govt rate value)", "cane_price", basis=f"{cur['cane_tons']:,.0f} t of cane"),
		line("  Cane costs paid by the mill", "cane_other", basis="subsidies, mill's cess share, freight, labour"),
		line("  Chemicals", fn=lambda x: x["elements"].get("Chemicals", 0)),
		line("  Packing", "packing", basis=f"{cur['bags']:,.0f} bags"),
		line("Total direct materials", fn=lambda x: x["structure"]["direct_material"], bold=1),
		line("Direct labour (production departments)", fn=lambda x: x["structure"]["direct_labour"]),
		line("Prime cost", fn=lambda x: x["structure"]["prime_cost"], bold=1),
		head("Factory overhead (FOH)")]
	rows += [line(f"  {e}", fn=lambda x, e=e: x["structure"]["foh_lines"].get(e, 0)) for e in foh]
	rows += [line("Total factory overhead", fn=lambda x: x["structure"]["factory_overhead"], bold=1),
		line("Cost of production (prime cost + FOH)", fn=lambda x: x["structure"]["cost_of_production"], bold=1)]
	for b in cur["by_products"]:
		rows.append(line(f"  Less: {names.get(b['name'], b['name'])}", fn=lambda x, n=b["name"]: -next((y["credit"] for y in x["by_products"] if y["name"] == n), 0),
			basis=f"{b['tons']:,.0f} t × {b['rate_per_ton']:,.0f} − {b['selling_cost']:,.0f}"))
	rows += [line("By-product credit", fn=lambda x: -x["credit"], bold=1), line("Net cost of sugar produced", "net", bold=1),
		head("Process cost (processing, after service departments)")]
	rows += [line(f"  {pname}", fn=lambda x, pn=pname: next((y["amount"] for y in x["processes"] if y["process_name"] == pn), 0),
		basis=f"Rs {next(y['per_ton_cane'] for y in cur['processes'] if y['process_name'] == pname):,.0f} / t cane") for pname in procs]
	rows += [head("Per 50 kg bag"), line("Sugar produced (kg)", "sugar_kg"), line("Cost per kg of sugar", "per_kg", bold=1),
		line("Cost per 50 kg bag (before tax)", fn=lambda x: x["price"]["cost_before_tax"], bold=1),
		line("  FOH per bag", fn=lambda x: round(x["structure"]["factory_overhead"] / x["bags"], 2) if x["bags"] else 0),
		line(f"Profit margin {cur['price']['margin_pct']:g}%", fn=lambda x: x["price"]["profit"]),
		line("Ex-mill price before GST", fn=lambda x: x["price"]["price_before_gst"], bold=1),
		line(f"GST {cur['price']['gst_pct']:g}%", fn=lambda x: x["price"]["gst"]),
		line("Price per 50 kg bag after GST", fn=lambda x: x["price"]["price_after_gst"], bold=1),
		line("Cost per bag with GST (break-even)", fn=lambda x: x["price"]["cost_after_gst"]),
		line("Cost per ton of cane crushed", "per_ton_cane"), line("Cane share of joint cost %", "cane_share_pct"), line("Recovery %", "recovery_pct")]
	for r in rows:
		for k in ("current", "previous"):
			if isinstance(r[k], float):
				r[k] = round(r[k], 2)
	cols = [col("line", "", width=270), col("basis", "Basis", width=170), col("current", f"{season} (Rs)", "Float", width=150),
		col("previous", f"{prev_name or 'Previous season'} (Rs)", "Float", width=150)]
	summary = [{"label": "Cost per 50 kg bag (before tax)", "value": cur["per_bag"], "datatype": "Currency", "indicator": "blue"},
		{"label": "FOH", "value": cur["structure"]["factory_overhead"], "datatype": "Currency"},
		{"label": "Price after GST", "value": cur["price"]["price_after_gst"], "datatype": "Currency", "indicator": "orange"},
		{"label": "By-product credit", "value": cur["credit"], "datatype": "Currency", "indicator": "green"},
		{"label": "Outside production (not costed)", "value": cur["outside_production"], "datatype": "Currency"}]
	return cols, rows, None, None, summary
