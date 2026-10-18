# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""One row per crushing day from the DMRs: cane, time, production, recovery, by-products and pol losses; a season row at the end."""
	from sugarcane.depot_purchase.report_utils import dates

	f = frappe._dict(filters or {})
	last = frappe.db.sql("select max(crushing_day) from `tabDaily Manufacturing Report` where docstatus < 2")[0][0]
	start, end = dates({**f, "to_date": f.to_date or last}) if last else dates(f)
	data = frappe.get_list("Daily Manufacturing Report", filters={"docstatus": ["<", 2], "crushing_day": ["between", [start, end]]},
		fields=["name", "crushing_day", "status", "cane_received_kg", "cane_crushed_kg", "running_hours", "stoppage_minutes", "crush_rate_tph",
			"capacity_use_pct", "sugar_bags", "recovery_pct", "molasses_pct_cane", "bagasse_pct_cane", "press_mud_pct_cane", "pol_pct_cane",
			"loss_bagasse", "loss_press_mud", "loss_molasses", "loss_undetermined", "std_recovery_pct"], order_by="crushing_day asc", limit_page_length=0)
	columns = [col("name", "DMR", "Link", "Daily Manufacturing Report", 115), col("crushing_day", "Day", "Date", width=95), col("status", "Status", width=85),
		col("cane_received_kg", "Received kg", "Int", width=105), col("cane_crushed_kg", "Crushed kg", "Int", width=105),
		col("running_hours", "Running h", "Float", width=85), col("stoppage_minutes", "Stopped min", "Int", width=90),
		col("crush_rate_tph", "t/h", "Float", width=70), col("capacity_use_pct", "Capacity %", "Percent", width=90),
		col("sugar_bags", "Bags", "Int", width=75), col("recovery_pct", "Recovery %", "Float", width=95),
		col("molasses_pct_cane", "Molasses % Cane", "Float", width=115), col("bagasse_pct_cane", "Bagasse % Cane", "Float", width=110),
		col("press_mud_pct_cane", "Mud % Cane", "Float", width=95), col("pol_pct_cane", "Pol % Cane", "Float", width=90),
		col("loss_bagasse", "Loss Bagasse", "Float", width=95), col("loss_press_mud", "Loss Mud", "Float", width=85),
		col("loss_molasses", "Loss Molasses", "Float", width=100), col("loss_undetermined", "Undetermined", "Float", width=100),
		col("std_recovery_pct", "Season Recovery %", "Float", width=125)]
	chart = {"data": {"labels": [str(r.crushing_day) for r in data], "datasets": [{"name": "Recovery %", "values": [r.recovery_pct for r in data]}]},
		"type": "line"}
	if data:
		crushed = sum(r.cane_crushed_kg or 0 for r in data)
		bags = sum(r.sugar_bags or 0 for r in data)
		data.append({"name": "Total", "cane_received_kg": sum(r.cane_received_kg or 0 for r in data), "cane_crushed_kg": crushed,
			"running_hours": sum(r.running_hours or 0 for r in data), "stoppage_minutes": sum(r.stoppage_minutes or 0 for r in data),
			"sugar_bags": bags, "recovery_pct": round(bags * 50 * 100 / crushed, 3) if crushed else 0})
	return columns, data, None, chart
