# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	"""Per production day: the cane consumed at its stock cost, the packing bags, the cane costs that are expensed (subsidies, the
	mill's cess, depot freight, commission, transit shortage) shared out by the day's cane crushed ÷ cane bought, less the
	by-products at NRV → the full cost of a bag. Overheads (salaries, power, stores) come with the general ledger."""
	from sugarcane.cane_costing.report.cane_cost_per_maund.cane_cost_per_maund import execute as cane_cost

	f = frappe._dict(filters or {})
	start, end = dates(f)
	costs = {str(r["day"]): r for r in cane_cost({"from_date": start, "to_date": end})[1] if r["day"] != "Total"}
	data = []
	for p in frappe.get_list("Daily Production Entry", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]}, fields=["name", "crushing_day",
			"cane_crushed_kg", "bags_produced", "cane_cost", "by_product_value", "sugar_value", "stock_entry"], order_by="crushing_day asc", limit_page_length=0):
		se = frappe.get_doc("Stock Entry", p.stock_entry)
		packing = sum(flt(i.amount) for i in se.items if i.s_warehouse and i.item_code == frappe.db.get_single_value("Sugar Settings", "packing_item"))
		c = costs.get(str(p.crushing_day), {})
		bought_kg = flt(c.get("maund")) * 40
		share = min(flt(p.cane_crushed_kg) / bought_kg, 1.5) if bought_kg else 1
		expensed = round((flt(c.get("subsidy")) + flt(c.get("additional")) + flt(c.get("cess")) + flt(c.get("freight")) + flt(c.get("commission"))
			+ flt(c.get("shortage"))) * share, 2)
		total = round(flt(p.cane_cost) + packing + expensed - flt(p.by_product_value), 2)
		data.append({"name": p.name, "day": p.crushing_day, "bags": p.bags_produced, "cane_cost": p.cane_cost, "packing": round(packing, 2),
			"expensed": expensed, "by_products": p.by_product_value, "stock_cost": p.sugar_value, "full_cost": total,
			"stock_per_bag": round(flt(p.sugar_value) / p.bags_produced, 2) if p.bags_produced else 0,
			"full_per_bag": round(total / p.bags_produced, 2) if p.bags_produced else 0})
	columns = [col("name", "Production", "Link", "Daily Production Entry", 125), col("day", "Day", "Date", width=95), col("bags", "Bags", "Int", width=70),
		col("cane_cost", "Cane (stock)", "Currency", width=115), col("packing", "Packing", "Currency", width=95),
		col("expensed", "Cane Costs Expensed", "Currency", width=135), col("by_products", "By-products (NRV)", "Currency", width=125),
		col("stock_cost", "Sugar at Stock Cost", "Currency", width=135), col("stock_per_bag", "Stock Cost / Bag", "Currency", width=115),
		col("full_cost", "Full Cane Cost", "Currency", width=120), col("full_per_bag", "Full Cost / Bag", "Currency", width=110)]
	if data:
		tot = {k: round(sum(r.get(k) or 0 for r in data), 2) for k in ("bags", "cane_cost", "packing", "expensed", "by_products", "stock_cost", "full_cost")}
		tot["stock_per_bag"] = round(tot["stock_cost"] / tot["bags"], 2) if tot["bags"] else 0
		tot["full_per_bag"] = round(tot["full_cost"] / tot["bags"], 2) if tot["bags"] else 0
		data.append({"name": "Total", **tot})
	return columns, data
