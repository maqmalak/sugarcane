# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from sugarcane.cane_procurement.report_utils import col, cprs

FIELDS = ["name", "posting_date", "posted_at", "token", "grower", "grower_name", "circle", "village_name", "source", "point_name", "entry_type",
	"vehicle_no", "vehicle_type", "gross_kg", "tare_kg", "net_kg", "binding_kg", "payable_kg", "payable_maund", "govt_value", "road_cess_grower",
	"subsidy", "additional_subsidy", "tpt_amount", "payable_cpr", "bilty", "journal_entry", "payment_status"]


def execute(filters=None):
	data = cprs(filters, FIELDS)
	columns = [col("name", "CPR", "Link", "Cane Purchase Receipt", 120), col("posting_date", "Day", "Date", width=95),
		col("grower", "Grower ID", "Link", "Grower", 105), col("grower_name", "Grower", width=150), col("circle", "Circle", "Link", "Cane Circle", 105),
		col("village_name", "Village", width=110), col("point_name", "Point", width=120), col("source", "Rates of", "Link", "Cane Source", 120),
		col("entry_type", "Entry", width=95), col("vehicle_no", "Vehicle", width=95), col("gross_kg", "Gross kg", "Int", width=85),
		col("tare_kg", "Tare kg", "Int", width=80), col("net_kg", "Net kg", "Int", width=80), col("binding_kg", "Binding kg", "Int", width=80),
		col("payable_kg", "Payable kg", "Int", width=90), col("payable_maund", "Maund", "Float", width=85), col("govt_value", "Govt Value", "Currency", width=110),
		col("road_cess_grower", "Cess (grower)", "Currency", width=100), col("subsidy", "Subsidy", "Currency", width=95),
		col("additional_subsidy", "Add. Subsidy", "Currency", width=95), col("tpt_amount", "TPT", "Currency", width=95),
		col("payable_cpr", "Payable", "Currency", width=115), col("bilty", "Bilty", "Link", "TPT Bilty", 115),
		col("journal_entry", "Journal", "Link", "Journal Entry", 130), col("payment_status", "Payment", width=80)]
	if data:
		total = {"name": "Total", "payable_maund": round(sum(r.payable_maund for r in data), 3)}
		for k in ("gross_kg", "tare_kg", "net_kg", "binding_kg", "payable_kg", "govt_value", "road_cess_grower", "subsidy", "additional_subsidy",
				"tpt_amount", "payable_cpr"):
			total[k] = sum(r.get(k) or 0 for r in data)
		data = data + [total]
	return columns, data
