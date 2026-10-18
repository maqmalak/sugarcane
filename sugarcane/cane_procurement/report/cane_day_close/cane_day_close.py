# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _

from sugarcane.cane_procurement.report_utils import col


def execute(filters=None):
	"""Each cane control account against its sub-ledger (also checked by the tests)."""
	from sugarcane.api.v1.procurement import day_checks

	f = frappe._dict(filters or {})
	res = day_checks(f.to_date)
	columns = [col("label", "Account", width=220), col("ledger", "Ledger Balance", "Currency", width=140), col("expected", "Sub-ledger", "Currency", width=140),
		col("difference", "Difference", "Currency", width=120), col("result", "Result", width=90), col("hint", "Rule", width=360)]
	data = [{**c, "result": _("OK") if c["ok"] else _("CHECK")} for c in res["checks"]]
	days = frappe.db.sql("""select posting_date day, count(*) n, sum(govt_value) v from `tabCane Purchase Receipt` where docstatus = 1
		and ifnull(daily_purchase, '') = '' group by posting_date order by posting_date""", as_dict=True)
	msg = _("Crushing days not closed yet: {0}").format(", ".join(f"{d.day} ({d.n} CPRs)" for d in days)) if days else _("Every crushing day is closed.")
	return columns, data, msg
