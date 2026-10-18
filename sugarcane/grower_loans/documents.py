"""Printed loan application (real-estate document style): applicant, guarantor and their position, eligibility with its checks,
requested / eligible / approved, previous loans, cane supplied, and the loan's own ledger with a running balance."""

import frappe
from frappe import _
from frappe.utils import flt

from sugarcane.cane_accounting.bank_docs import _ctx, _pdf, app_url, qr
from sugarcane.grower_loans.loans import eligibility

GROWER = ["name", "grower_name", "father_name", "cnic", "mobile", "village_name", "circle", "passbook_no", "iban", "bank_name"]
ENTRY = {"Recovery": "Recovered from CPR", "Cash Repayment": "Repaid", "Markup": "Markup", "Write-off": "Written off"}


def ledger(loan) -> list[dict]:
	rows, bal = [], 0.0
	if loan.disbursed_on:
		bal = flt(loan.amount)
		rows.append({"posting_date": loan.disbursed_on, "entry": _("Disbursed"), "ref": loan.disbursement_journal or "", "debit": bal, "credit": 0, "balance": bal})
	for e in frappe.get_all("Grower Loan Entry", filters={"loan": loan.name}, fields=["entry_type", "posting_date", "amount", "cpr", "period",
			"journal_entry"], order_by="posting_date asc, creation asc"):
		dr = flt(e.amount) if e.entry_type == "Markup" else 0
		cr = 0 if e.entry_type == "Markup" else flt(e.amount)
		bal = flt(bal + dr - cr, 2)
		rows.append({"posting_date": e.posting_date, "entry": ENTRY.get(e.entry_type, e.entry_type), "ref": e.cpr or e.period or e.journal_entry or "",
			"debit": dr, "credit": cr, "balance": bal})
	return rows


def loan_application(name: str) -> tuple[str, bytes]:
	loan = frappe.get_doc("Grower Loan", name)
	loan.check_permission("read")
	g = frappe.db.get_value("Grower", loan.grower, GROWER, as_dict=True)
	gu = frappe.db.get_value("Grower", loan.guarantor, GROWER, as_dict=True) if loan.guarantor else None
	el = eligibility(loan.grower, loan.loan_type, loan.season, loan.name, loan.guarantor)
	history = frappe.get_all("Grower Loan", filters={"grower": loan.grower, "docstatus": 1, "name": ["!=", loan.name]}, fields=["name", "season",
		"loan_type", "disbursed_on", "amount", "markup_accrued", "recovered", "outstanding", "status"], order_by="application_date asc")
	supply = frappe.db.sql("""select season, count(*) cprs, sum(payable_maund) maund, sum(net_amount) net, sum(loan_deduction) loans
		from `tabCane Purchase Receipt` where docstatus = 1 and grower = %s group by season order by season""", loan.grower, as_dict=True)
	pdf = _pdf("loan_application", _ctx(loan=loan, ltype=frappe.get_cached_doc("Grower Loan Type", loan.loan_type), g=g, gu=gu, el=el,
		history=history, supply=supply, entries=ledger(loan), approver=frappe.utils.get_fullname(loan.approved_by) if loan.approved_by else "",
		qr=qr(app_url(f"/accounts/loans?loan={loan.name}"))))
	return f"Loan application {loan.name}.pdf", pdf
