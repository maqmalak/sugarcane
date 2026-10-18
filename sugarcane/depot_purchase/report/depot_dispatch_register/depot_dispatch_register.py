# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe

from sugarcane.cane_procurement.report_utils import col
from sugarcane.depot_purchase.report_utils import dispatches


def execute(filters=None):
	data = dispatches(filters, ["name", "depot", "status", "dispatch_day", "received_day", "vehicle_no", "contractor", "driver_name", "depot_gross_at",
		"mill_gross_at", "journey_minutes", "depot_tare_kg", "depot_gross_kg", "dispatched_kg", "mill_gross_kg", "mill_tare_kg", "received_kg",
		"shortage_kg", "shortage_pct", "allowed_shortage_pct", "excess_shortage_kg", "freight_amount", "shortage_value", "recovery_amount",
		"posted_out", "posted_in", "weight_notes"])
	columns = [col("name", "Dispatch", "Link", "Depot Dispatch", 115), col("depot", "Depot", "Link", "Cane Depot", 140), col("status", "Status", width=85),
		col("dispatch_day", "Sent", "Date", width=90), col("received_day", "Received", "Date", width=90), col("vehicle_no", "Truck", width=95),
		col("contractor", "Contractor", "Link", "Supplier", 150), col("journey_minutes", "Journey min", "Int", width=90),
		col("dispatched_kg", "Sent kg", "Int", width=90), col("received_kg", "Received kg", "Int", width=95), col("shortage_kg", "Shortage kg", "Int", width=90),
		col("shortage_pct", "Shortage %", "Percent", width=85), col("allowed_shortage_pct", "Allowed %", "Percent", width=80),
		col("excess_shortage_kg", "Above Allowance kg", "Int", width=125), col("freight_amount", "Freight", "Currency", width=100),
		col("shortage_value", "Shortage Value", "Currency", width=110), col("recovery_amount", "Recovered", "Currency", width=100),
		col("posted_in", "Posted", "Check", width=65), col("weight_notes", "Weight Notes", width=220)]
	if data:
		tot = {"name": "Total", **{k: sum(r.get(k) or 0 for r in data) for k in ("dispatched_kg", "received_kg", "shortage_kg", "excess_shortage_kg",
			"freight_amount", "shortage_value", "recovery_amount")}}
		got = sum(r.dispatched_kg or 0 for r in data if r.status == "Received")
		tot["shortage_pct"] = round(tot["shortage_kg"] * 100 / got, 3) if got else 0
		data.append(tot)
	return columns, data
