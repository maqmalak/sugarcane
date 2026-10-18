# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import flt

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Per month of CPRs: cess deducted from growers and borne by the mill, deposited and still to deposit (= Road Cess Payable)."""
	data = frappe.db.sql("""select date_format(posting_date, '%%Y-%%m') month, count(*) cprs, sum(road_cess_grower) grower, sum(road_cess_mill) mill,
		sum(road_cess_total) total, sum(case when cess_deposited = 1 then road_cess_total else 0 end) deposited,
		group_concat(distinct road_cess_deposit) deposits from `tabCane Purchase Receipt` where docstatus = 1 group by month order by month""", as_dict=True)
	for r in data:
		r.pending = round(flt(r.total) - flt(r.deposited), 2)
	columns = [col("month", "Month", width=90), col("cprs", "CPRs", "Int", width=70), col("grower", "Grower Share", "Currency", width=120),
		col("mill", "Mill Share", "Currency", width=120), col("total", "Total Cess", "Currency", width=120), col("deposited", "Deposited", "Currency", width=120),
		col("pending", "To Deposit", "Currency", width=120), col("deposits", "Deposits", width=220)]
	if data:
		data.append({"month": "Total", **{k: round(sum(flt(r.get(k)) for r in data), 2) for k in ("cprs", "grower", "mill", "total", "deposited", "pending")}})
	return columns, data
