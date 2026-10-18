# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe.utils import add_days, add_months, cint, date_diff, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def _range(f, back=90):
	end = getdate(f.to_date or nowdate())
	return getdate(f.from_date or add_days(end, -back)), end


def execute(filters=None):
	"""Every journal by voucher type (JV / BPV / BRV / CPV / CRV): date, narration, amount, posted or draft."""
	f = frappe._dict(filters or {})
	start, end = _range(f, 31)
	rows = frappe.db.sql("""select name, voucher_code, posting_date, voucher_type, cheque_no, total_debit, user_remark, docstatus, owner
		from `tabJournal Entry` where docstatus < 2 and posting_date between %(s)s and %(e)s and (%(v)s = '' or voucher_code = %(v)s)
		order by posting_date, name""", {"s": start, "e": end, "v": f.voucher_code or ""}, as_dict=True)
	for r in rows:
		r.state = "Posted" if r.docstatus == 1 else "Draft"
	cols = [col("name", "Voucher", "Link", "Journal Entry", 140), col("voucher_code", "Type", width=60), col("posting_date", "Date", "Date", width=95),
		col("cheque_no", "Cheque", width=95), col("total_debit", "Amount", "Currency", width=130), col("user_remark", "Narration", width=320),
		col("state", "State", width=80), col("owner", "Prepared By", width=170)]
	from collections import Counter
	n = Counter(r.voucher_code or "JV" for r in rows)
	summary = [{"label": k, "value": v, "datatype": "Int"} for k, v in sorted(n.items())]
	return cols, rows, None, None, summary
