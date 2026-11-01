"""Demo only: the demo paid growers for months from an unfunded bank, so its balance is far below zero. fund() brings the cane
bank to a working balance from a running-finance facility and adds a second bank, so 'bank balance available' means something.
Run once: bench --site <site> execute sugarcane.setup.demo_banks.fund"""

import frappe
from frappe.utils import flt, nowdate

from sugarcane.setup.accounts import _account, _group


def fund(cane_bank_target=4_500_000, second_bank=2_500_000):
	frappe.set_user("Administrator")
	s = frappe.get_single("Sugar Settings")
	company, abbr = s.company, frappe.get_cached_value("Company", s.company, "abbr")
	from sugarcane.cane_accounting.accounting import bank_balance

	finance = _account(company, abbr, "Running Finance - Cane Payments", _group(company, "Loans (Liabilities)", "Current Liabilities",
		root_type="Liability"))
	meezan = _account(company, abbr, "Meezan Bank - Cane Payments", frappe.db.get_value("Account", s.cane_bank_account, "parent_account"), "Bank")
	rows = []
	need = flt(cane_bank_target - bank_balance(s.cane_bank_account), 2)
	if need > 0:
		rows.append({"account": s.cane_bank_account, "debit_in_account_currency": need})
	if bank_balance(meezan) < 1:
		rows.append({"account": meezan, "debit_in_account_currency": second_bank})
	if not rows:
		return "already funded"
	total = sum(r["debit_in_account_currency"] for r in rows)
	rows.append({"account": finance, "credit_in_account_currency": total})
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Bank Entry", "company": company, "posting_date": nowdate(),
		"cheque_no": "RF-DEMO", "cheque_date": nowdate(), "user_remark": "Demo: running finance drawn for cane payments",
		"accounts": [{**r, "cost_center": s.cost_center} for r in rows]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	frappe.db.commit()
	return {"journal_entry": je.name, "cane_bank": bank_balance(s.cane_bank_account), "meezan": bank_balance(meezan)}
