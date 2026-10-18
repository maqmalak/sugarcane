# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe.utils import add_days, flt, getdate, nowdate

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Per grower, for the period: opening, CPRs credited, payments, loan movements, closing — payable and loan ledgers."""
	f = frappe._dict(filters or {})
	s = frappe.get_cached_doc("Sugar Settings")
	start = getdate(f.from_date or "2000-01-01")
	end = getdate(f.to_date or add_days(nowdate(), 3650))
	cond = "and g.circle = %(circle)s" if f.circle else ""
	rows = frappe.db.sql(f"""select e.party grower, g.grower_name, g.circle, e.account, e.posting_date, e.debit, e.credit, e.voucher_type
		from `tabGL Entry` e join tabGrower g on g.name = e.party where e.party_type = 'Grower' and e.is_cancelled = 0 and e.posting_date <= %(end)s
		{cond}""", {"end": end, "circle": f.circle}, as_dict=True)
	by = defaultdict(lambda: defaultdict(float))
	names = {}
	for r in rows:
		b = by[r.grower]
		names[r.grower] = (r.grower_name, r.circle)
		amt = flt(r.credit) - flt(r.debit)
		if r.account == s.grower_loan_account:
			b["loan_closing"] += -amt
			continue
		if getdate(r.posting_date) < start:
			b["opening"] += amt
		elif r.credit:
			b["credited"] += flt(r.credit)
		else:
			b["paid"] += flt(r.debit)
		b["closing"] += amt
	data = [{"grower": g, "grower_name": names[g][0], "circle": names[g][1], **{k: round(v, 2) for k, v in b.items()}} for g, b in sorted(by.items())]
	columns = [col("grower", "Grower ID", "Link", "Grower", 110), col("grower_name", "Grower", width=170), col("circle", "Circle", "Link", "Cane Circle", 110),
		col("opening", "Opening Payable", "Currency", width=125), col("credited", "CPRs Credited", "Currency", width=125),
		col("paid", "Paid", "Currency", width=115), col("closing", "Closing Payable", "Currency", width=125),
		col("loan_closing", "Loan Outstanding", "Currency", width=125)]
	if data:
		data.append({"grower": "Total", **{k: round(sum(flt(r.get(k)) for r in data), 2) for k in ("opening", "credited", "paid", "closing", "loan_closing")}})
	return columns, data
