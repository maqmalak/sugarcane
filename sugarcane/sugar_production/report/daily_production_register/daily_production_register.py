# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dates


def execute(filters=None):
	"""Posted production per crushing day: cane in, sugar and by-products out, and what a bag of sugar cost."""
	f = frappe._dict(filters or {})
	last = frappe.db.sql("select max(crushing_day) from `tabDaily Production Entry` where docstatus = 1")[0][0]
	start, end = dates({**f, "to_date": f.to_date or last}) if last else dates(f)
	data = frappe.get_list("Daily Production Entry", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
		fields=["name", "crushing_day", "cane_crushed_kg", "bags_produced", "recovery_pct", "molasses_kg", "bagasse_kg", "press_mud_kg", "cane_cost",
			"by_product_value", "sugar_value", "cost_per_bag", "work_order", "stock_entry"], order_by="crushing_day asc", limit_page_length=0)
	columns = [col("name", "Production", "Link", "Daily Production Entry", 125), col("crushing_day", "Day", "Date", width=95),
		col("cane_crushed_kg", "Cane kg", "Int", width=100), col("bags_produced", "Bags", "Int", width=75), col("recovery_pct", "Recovery %", "Float", width=90),
		col("molasses_kg", "Molasses kg", "Int", width=95), col("bagasse_kg", "Bagasse kg", "Int", width=95), col("press_mud_kg", "Mud kg", "Int", width=85),
		col("cane_cost", "Cane Cost", "Currency", width=115), col("by_product_value", "By-products (NRV)", "Currency", width=130),
		col("sugar_value", "Sugar Value", "Currency", width=115), col("cost_per_bag", "Cost / Bag", "Currency", width=100),
		col("work_order", "Work Order", "Link", "Work Order", 140), col("stock_entry", "Stock Entry", "Link", "Stock Entry", 150)]
	if data:
		bags = sum(r.bags_produced or 0 for r in data)
		sugar = sum(r.sugar_value or 0 for r in data)
		data.append({"name": "Total", "cane_crushed_kg": sum(r.cane_crushed_kg or 0 for r in data), "bags_produced": bags,
			**{k: sum(r.get(k) or 0 for r in data) for k in ("molasses_kg", "bagasse_kg", "press_mud_kg", "cane_cost", "by_product_value")},
			"sugar_value": sugar, "cost_per_bag": round(sugar / bags, 2) if bags else 0})
	return columns, data
