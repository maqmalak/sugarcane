"""Phase 6 demo: grower loans before the season (recovered by the season's CPRs), payment scrolls, a road cess deposit.

loans()      runs before the procurement demo: three loan types, ~24 growers with an indent get loans in October (approved by
             the Cane Manager, disbursed by the accountant), October's markup; the procurement demo's CPRs then recover them.
payments()   runs after it: the bank-letter settings (our bank, signatories), then scrolls on 5 Nov (bank transfer for growers with an IBAN, a cheque scroll for the rest) paying
             2–3 Nov, on 6 Nov paying 4 Nov, a draft scroll for 5 Nov; road cess for 1–4 Nov deposited on 6 Nov; a cash
             repayment of one loan.
"""

import random

import frappe
from frappe.utils import add_days, getdate

SEED = 66
TYPES = [  # name, purpose, markup %, recovery % of a CPR, largest loan, largest per surveyed acre
	("Fertilizer", "Fertilizer", 12, 40, 300000, 25000),
	("Seed", "Seed", 10, 30, 150000, 15000),
	("Crop Cash", "Cash", 16, 50, 200000, 0),
]


def _as(prefix):
	frappe.set_user(f"{prefix}@micromaxsugar.example")


def loans():
	from sugarcane.grower_loans.loans import accrue_markup, disburse, surveyed_acres

	if frappe.db.exists("Grower Loan", {"is_demo": 1}):
		return 0
	rnd = random.Random(SEED)
	frappe.set_user("Administrator")
	for name, purpose, mk, rec, mx, per in TYPES:
		if not frappe.db.exists("Grower Loan Type", name):
			frappe.get_doc({"doctype": "Grower Loan Type", "loan_type_name": name, "purpose": purpose, "markup_pct": mk, "recovery_pct": rec,
				"max_amount": mx, "max_per_acre": per, "is_active": 1, "is_demo": 1}).insert(ignore_permissions=True)
	season = frappe.db.get_single_value("Sugar Settings", "active_season")
	growers = frappe.db.sql_list("""select distinct grower from `tabCane Indent` where docstatus = 1 and season = %s
		and indent_date between '2026-11-02' and '2026-11-06' order by grower""", season)
	rnd.shuffle(growers)
	made = 0
	for g in growers[:24]:
		acres = surveyed_acres(g, season)
		t = rnd.choice(TYPES)
		limit = min(t[4], t[5] * acres) if t[5] else t[4]
		amount = round(rnd.uniform(0.3, 0.9) * limit, -3)
		if amount < 10000:
			continue
		day = getdate(f"2026-10-{rnd.randint(1, 14):02d}")
		_as("circle.north")
		frappe.set_user("Administrator")
		doc = frappe.get_doc({"doctype": "Grower Loan", "grower": g, "loan_type": t[0], "amount": amount, "application_date": day, "season": season,
			"is_demo": 1, "remarks": f"{t[1]} for the {season} crop"})
		doc.insert(ignore_permissions=True)
		_as("cane.manager")
		doc.flags.ignore_permissions = True
		doc.submit()
		_as("cane.accountant")
		disburse(doc.name, on=add_days(day, rnd.randint(1, 4)))
		made += 1
	_as("cane.accountant")
	accrue_markup("2026-10")
	frappe.set_user("Administrator")
	frappe.db.commit()
	return made


BANK = {"payer_bank_name": "Habib Bank Limited", "payer_branch": "Corporate Branch, Sargodha Road, Bhalwal",
	"payer_account_title": "MicroMax Sugar Mills Ltd. — Cane Payments", "payer_account_no": "0123-79000456-03", "payer_iban": "PK36HABB0012347900045603",
	"signatory_1": "Kashif Raza, Cane Admin", "signatory_2": "Nadia Rehman, Cane Accountant", "mill_address": "Bhalwal–Sargodha Road, District Sargodha, Punjab",
	"mill_phone": "+92 48 664 0000 · cane@micromaxsugar.example"}


def documents():
	"""The vault: the paid scrolls' schedules and bank letters, one stop-payment letter, the loans' applications, and papers from
	outside (CNIC copies, guarantee deeds, a cess challan, a contractor agreement that is about to expire)."""
	from frappe.utils.file_manager import save_file
	from frappe.utils.pdf import get_pdf

	from sugarcane.cane_accounting import bank_docs
	from sugarcane.grower_loans.documents import loan_application
	from sugarcane.vault import store

	s = frappe.get_single("Sugar Settings")
	for k, v in BANK.items():
		if not s.get(k):
			s.set(k, v)
	s.flags.ignore_permissions = True
	s.save()
	frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
	paid = frappe.get_all("Cane Payment Scroll", filters={"is_demo": 1, "docstatus": 1}, fields=["name", "mode_of_payment"], order_by="name")
	for sc in paid:
		store("Bank Payment Schedule", "Cane Payment Scroll", sc.name, *bank_docs.payment_schedule(sc.name))
		if sc.mode_of_payment != "Cheque":
			store("Bank Instruction Letters", "Cane Payment Scroll", sc.name, *bank_docs.instruction_letters(sc.name))
	first = next((sc.name for sc in paid if sc.mode_of_payment != "Cheque"), None)
	if first:
		g = frappe.db.get_value("Cane Payment Scroll Payment", {"parent": first}, "grower", order_by="idx desc")
		why = "Grower reports the account was closed; to be paid by cheque"
		store("Stop Payment Letter", "Cane Payment Scroll", first, *bank_docs.stop_payment(first, g, why), grower=g, remarks=why)
	store("Unpaid CPR Scroll", None, None, *bank_docs.unpaid_scroll())
	loans = frappe.get_all("Grower Loan", filters={"is_demo": 1}, fields=["name", "grower", "grower_name", "guarantor", "disbursed_on"], order_by="name")
	for ln in loans[:8]:
		store("Loan Application", "Grower Loan", ln.name, *loan_application(ln.name), grower=ln.grower)

	def paper(title, html):
		return get_pdf(f"<div style='font-family:Helvetica;padding:40px'><h2>{title}</h2><p>Scanned copy (demo placeholder).</p>{html}</div>")

	vault = []
	for ln in loans[:10]:
		g = frappe.db.get_value("Grower", ln.grower, ["cnic", "grower_name"], as_dict=True)
		vault.append(("CNIC copy — " + g.grower_name, "Grower CNIC Copy", ln.grower, "NADRA", g.cnic, "2019-05-10", "2029-05-10", None))
		vault.append(("Loan agreement — " + ln.name, "Loan Agreement", ln.grower, "MicroMax Sugar Mills", ln.name, str(ln.disbursed_on), None, ("Grower Loan", ln.name)))
	vault += [("Road cess challan RC-2026-11-001", "Road Cess Challan", None, "District Council Sargodha", "RC-2026-11-001", "2026-11-06", None, None),
		("Cane loading contract — Sial Brothers Loading", "Contractor Agreement", None, "Sial Brothers Loading", "CNT-2026-04", "2026-10-01",
			str(add_days(getdate(), 20)), None),
		("Weighbridge verification certificate WB-1", "Licence / NOC", None, "Weights & Measures Dept, Punjab", "WM-SGD-0912", "2025-10-15",
			str(add_days(getdate(), -5)), None)]
	for title, kind, grower, auth, ref, issued, expiry, link in vault:
		d = frappe.get_doc({"doctype": "Sugar Vault Document", "title": title, "document_type": kind, "grower": grower, "authority": auth,
			"reference_no": ref, "issue_date": issued, "expiry_date": expiry, "renewal_alert_days": 30, "is_demo": 1,
			"reference_doctype": link[0] if link else None, "reference_name": link[1] if link else None,
			"file": "/private/files/placeholder.pdf"})
		d.insert(ignore_permissions=True)
		f = save_file(f"{title}.pdf", paper(title, f"<p>{auth} · {ref}</p>"), "Sugar Vault Document", d.name, is_private=1)
		d.db_set("file", f.file_url)


def contractors():
	"""The yard's unloading contract (Haider Transport) and the 2–5 Nov contractor bills: unloading with idle time, loading per
	loading-point contractor, and the depot freight & commission statements."""
	from sugarcane.cane_accounting.contractor_bills import bill_pdf
	from sugarcane.vault import store

	frappe.db.set_single_value("Sugar Settings", "unloading_contractor", "Haider Transport Company")
	if not frappe.db.exists("Unloading Contract", "UC-2026-01"):
		frappe.get_doc({"doctype": "Unloading Contract", "contract_no": "UC-2026-01", "contractor": "Haider Transport Company", "valid_from": "2026-11-01",
			"valid_to": "2027-03-31", "rate_per_maund": 1.6, "include_depot_trucks": 1, "security_deposit": 250000, "idle_rate_per_hour": 1800,
			"idle_min_minutes": 20, "idle_max_hours_per_day": 4, "idle_categories": "Mechanical\nElectrical\nPower\nProcess\nNo Cane",
			"terms": "Unloading of all cane at the mill yard with own labour; idle time paid when the mill stops.",
			"rates": [{"vehicle_type": "Truck", "rate_per_maund": 1.4, "rate_per_vehicle": 50}, {"vehicle_type": "Bullock Cart", "rate_per_maund": 2.0}],
			"is_demo": 1}).insert(ignore_permissions=True)
	bills = [("Unloading at Mill", None, {})]
	bills += [("Loading at Loading Point", c, {}) for c in sorted(set(frappe.get_all("Loading Point", filters={"contractor": ["is", "set"]}, pluck="contractor")))]
	bills += [("Depot Freight and Commission", c, {}) for c in sorted(set(frappe.get_all("Cane Depot", filters={"contractor": ["is", "set"]}, pluck="contractor")))]
	for bt, contractor, kw in bills:
		b = frappe.get_doc({"doctype": "Contractor Bill", "bill_type": bt, "contractor": contractor, "from_date": "2026-11-02", "to_date": "2026-11-05",
			"bill_date": "2026-11-06", "is_demo": 1, **kw})
		b.flags.ignore_permissions = True
		b.insert()
		if b.line_count:
			b.submit()
			store("Contractor Bill", "Contractor Bill", b.name, *bill_pdf(b.name))
		else:
			frappe.delete_doc("Contractor Bill", b.name, ignore_permissions=True, force=True)


def payments():
	from sugarcane.cane_accounting.accounting import unpaid_cprs
	from sugarcane.grower_loans.loans import repay

	if frappe.db.exists("Cane Payment Scroll", {"is_demo": 1}):
		return 0
	_as("cane.accountant")
	try:
		for pay_day, upto, ref in (("2026-11-05", "2026-11-03", "IBFT-0511"), ("2026-11-06", "2026-11-04", "IBFT-0611")):
			rows = unpaid_cprs(to_date=upto)
			bank = [r.name for r in rows if r.iban]
			cheque = [r.name for r in rows if not r.iban]
			for cprs, mode, r in ((bank, "Bank Transfer", ref), (cheque, "Cheque", f"CHQ-{ref[-4:]}")):
				if not cprs:
					continue
				doc = frappe.get_doc({"doctype": "Cane Payment Scroll", "posting_date": pay_day, "mode_of_payment": mode, "reference_no": r,
					"items": [{"cpr": c} for c in cprs], "is_demo": 1, "remarks": f"Payment for cane up to {upto}"})
				doc.flags.ignore_permissions = True
				doc.insert()
				doc.submit()
		rows = unpaid_cprs(to_date="2026-11-05")
		if rows:
			doc = frappe.get_doc({"doctype": "Cane Payment Scroll", "posting_date": "2026-11-07", "mode_of_payment": "Bank Transfer",
				"items": [{"cpr": r.name} for r in rows if r.iban][:12], "is_demo": 1, "remarks": "Being checked before payment"})
			doc.flags.ignore_permissions = True
			doc.insert()
		dep = frappe.get_doc({"doctype": "Road Cess Deposit", "from_date": "2026-11-01", "to_date": "2026-11-04", "deposit_date": "2026-11-06",
			"challan_no": "RC-2026-11-001", "is_demo": 1})
		dep.flags.ignore_permissions = True
		dep.insert()
		dep.submit()
		documents()
		contractors()
		ln = frappe.get_all("Grower Loan", filters={"is_demo": 1, "status": "Disbursed", "outstanding": [">", 10000]}, pluck="name",
			order_by="outstanding desc", limit=1)
		if ln:
			repay(ln[0], 5000, on="2026-11-03", remarks="Paid at the counter")
	finally:
		frappe.set_user("Administrator")
	frappe.db.commit()
	return 1


def reset_payments():
	frappe.set_user("Administrator")
	for name in frappe.get_all("Contractor Bill", filters={"is_demo": 1, "docstatus": 1}, pluck="name"):
		b = frappe.get_doc("Contractor Bill", name)
		b.flags.ignore_permissions = True
		b.cancel()
	from sugarcane.setup.demo import _purge as purge0

	purge0("Sugar Generated Document", frappe.get_all("Sugar Generated Document", filters={"reference_doctype": "Contractor Bill"}, pluck="name"))
	purge0("Contractor Bill", frappe.get_all("Contractor Bill", filters={"is_demo": 1}, pluck="name"))
	purge0("Unloading Contract", frappe.get_all("Unloading Contract", filters={"is_demo": 1}, pluck="name"))
	from sugarcane.setup.demo import _purge as purge

	purge("Sugar Vault Document", frappe.get_all("Sugar Vault Document", filters={"is_demo": 1}, pluck="name"))
	gen = frappe.get_all("Sugar Generated Document", filters={"reference_doctype": ["in", ["Cane Payment Scroll", "Grower Loan"]],
		"reference_name": ["in", frappe.get_all("Cane Payment Scroll", filters={"is_demo": 1}, pluck="name")
			+ frappe.get_all("Grower Loan", filters={"is_demo": 1}, pluck="name") or [""]]}, pluck="name")
	gen += frappe.get_all("Sugar Generated Document", filters={"document_type": "Unpaid CPR Scroll"}, pluck="name")
	purge("Sugar Generated Document", gen)
	for dt in ("Cane Payment Scroll", "Road Cess Deposit"):
		for name in frappe.get_all(dt, filters={"is_demo": 1, "docstatus": 1}, pluck="name", order_by="creation desc"):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.cancel()
	from sugarcane.setup.demo import _purge

	for dt in ("Cane Payment Scroll", "Road Cess Deposit"):
		_purge(dt, frappe.get_all(dt, filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()


def reset_loans():
	"""After the CPRs are gone (their recoveries with them): cancel markup and repayment journals, then the loans."""
	from sugarcane.setup.demo import _purge

	frappe.set_user("Administrator")
	names = frappe.get_all("Grower Loan", filters={"is_demo": 1}, pluck="name")
	for je in set(frappe.get_all("Grower Loan Entry", filters={"loan": ["in", names or [""]], "journal_entry": ["is", "set"]}, pluck="journal_entry")):
		if frappe.db.get_value("Journal Entry", je, "docstatus") == 1:
			d = frappe.get_doc("Journal Entry", je)
			d.flags.ignore_permissions = True
			d.cancel()
	frappe.db.delete("Grower Loan Entry", {"loan": ["in", names or [""]]})
	for name in frappe.get_all("Grower Loan", filters={"is_demo": 1, "docstatus": 1}, pluck="name"):
		d = frappe.get_doc("Grower Loan", name)
		d.flags.ignore_permissions = True
		d.cancel()
	_purge("Grower Loan", names)
	_purge("Grower Loan Type", frappe.get_all("Grower Loan Type", filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()
