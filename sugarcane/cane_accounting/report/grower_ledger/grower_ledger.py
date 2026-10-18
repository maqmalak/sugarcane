# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""A grower's cane and loan ledgers, date-wise, with a running balance (positive = owed to the grower)."""
	from sugarcane.api.v1.accounts import statement

	f = frappe._dict(filters or {})
	if not f.grower:
		return [col("note", "Choose a grower", width=300)], [], _("Choose a grower to see the ledger")
	st = statement(f.grower, f.from_date, f.to_date)
	columns = [col("posting_date", "Date", "Date", width=95), col("kind", "Ledger", width=70), col("voucher_type", "Voucher Type", width=120),
		col("voucher_no", "Voucher", "Dynamic Link", "voucher_type", 150), col("debit", "Debit", "Currency", width=110),
		col("credit", "Credit", "Currency", width=110), col("balance", "Balance", "Currency", width=120), col("remarks", "Remarks", width=320)]
	data = [{"posting_date": None, "kind": "", "voucher_type": "", "voucher_no": "", "debit": 0, "credit": 0, "balance": st["opening"],
		"remarks": _("Opening")}] + st["rows"]
	g = st["grower"]
	msg = _("{0} ({1}) · payable {2} · loan outstanding {3}").format(g.grower_name, g.name, frappe.format_value(st["payable"], "Currency"),
		frappe.format_value(st["loan_outstanding"], "Currency"))
	return columns, data, msg
