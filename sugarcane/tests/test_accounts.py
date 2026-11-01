"""Phase 6: payment scroll (IBAN rule, one Payment Entry per grower allocated to the CPR journals, CPR paid, cancel), bank
documents and the vault, road cess deposit, grower loans (limits, approval, disbursement, recovery at the CPR, markup,
repayment, eligibility), contractor bills (unloading with idle payment, once per CPR)."""

import frappe
from frappe.utils import add_days, flt, get_datetime

from sugarcane.cane_accounting import accounting as acc
from sugarcane.cane_accounting import bank_docs
from sugarcane.grower_loans import loans as ln
from sugarcane.tests.test_procurement import ProcurementBase

TAG = "TEST-PH6"
LTYPE = "Test Loan PH6"


def _acc_cleanup():
	frappe.set_user("Administrator")
	for dt in ("Cane Payment Scroll", "Road Cess Deposit", "Contractor Bill"):
		for name in frappe.get_all(dt, filters={"remarks": TAG, "docstatus": 1}, pluck="name"):
			d = frappe.get_doc(dt, name)
			d.cancel()
		for name in frappe.get_all(dt, filters={"remarks": TAG}, pluck="name"):
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True)
	names = frappe.get_all("Grower Loan", filters={"remarks": TAG}, pluck="name")
	for je in set(frappe.get_all("Grower Loan Entry", filters={"loan": ["in", names or [""]], "journal_entry": ["is", "set"], "entry_type": ["!=", "Recovery"]},
			pluck="journal_entry")):
		if frappe.db.get_value("Journal Entry", je, "docstatus") == 1:
			frappe.get_doc("Journal Entry", je).cancel()
	frappe.db.delete("Grower Loan Entry", {"loan": ["in", names or [""]], "entry_type": ["!=", "Recovery"]})
	frappe.db.delete("Mill Stoppage", {"reason": TAG})
	frappe.db.delete("Unloading Contract", {"contract_no": "UC-TEST-PH6"})


class TestAccounts(ProcurementBase):
	CNIC = "91701"
	LAT_OFFSET = 0.92

	def setUp(self):
		_acc_cleanup()
		super().setUp()  # cancels the season's CPRs (and their loan recoveries)
		for name in frappe.get_all("Grower Loan", filters={"remarks": TAG}, pluck="name"):
			frappe.db.delete("Grower Loan Entry", {"loan": name})
			if frappe.db.get_value("Grower Loan", name, "docstatus") == 1:
				d = frappe.get_doc("Grower Loan", name)
				d.cancel()
			frappe.delete_doc("Grower Loan", name, force=True, ignore_permissions=True)
		if not frappe.db.exists("Grower Loan Type", LTYPE):
			frappe.get_doc({"doctype": "Grower Loan Type", "loan_type_name": LTYPE, "purpose": "Fertilizer", "markup_pct": 12, "recovery_pct": 50,
				"max_amount": 500000, "max_per_acre": 20000}).insert()
		frappe.db.set_value("Grower Loan Type", LTYPE, {"requires_field_verification": 0, "min_surveyed_acres": 0})
		self.grower = frappe.db.get_value("Cane Indent", self.indents[0].name, "grower")

	def _two_cprs(self):
		day = self.indents[1].valid_from
		cprs = []
		for k, (i, vno) in enumerate(((self.indents[0], self.vno), (self.indents[1], self.vno + "B"))):
			tok = self._token(i, vehicle_no=vno, at=self._at(self.indents[1], 9 + k))
			cprs.append(self._weigh(tok, 15000 + k * 500, 4000)["cpr"])
		return day, cprs

	# ------------------------------------------------------------ payment scroll
	def test_scroll_pays_growers(self):
		from erpnext.accounts.utils import get_balance_on

		day, cprs = self._two_cprs()
		company = frappe.db.get_single_value("Sugar Settings", "company")
		frappe.db.set_value("Grower", self.grower, {"iban": None, "bank_name": None})
		sc = frappe.get_doc({"doctype": "Cane Payment Scroll", "posting_date": add_days(day, 3), "mode_of_payment": "Bank Transfer", "reference_no": "IBFT-T",
			"remarks": TAG, "items": [{"cpr": c} for c in cprs] + [{"cpr": cprs[0]}]}).insert()
		self.assertEqual((sc.cpr_count, sc.grower_count, sc.without_iban), (2, 1, 1))  # duplicate scan dropped, one grower
		with self.assertRaises(frappe.ValidationError):  # no IBAN, bank transfer
			sc.submit()
		frappe.db.set_value("Grower", self.grower, {"iban": "PK36SCBL0000001123456702", "bank_name": "Test Bank"})
		sc = frappe.get_doc("Cane Payment Scroll", sc.name)
		sc.save()
		with self.assertRaises(frappe.ValidationError):  # the same CPR can't sit on a second scroll
			frappe.get_doc({"doctype": "Cane Payment Scroll", "posting_date": add_days(day, 3), "remarks": TAG, "items": [{"cpr": cprs[0]}]}).insert()
		self.assertLess(flt(get_balance_on(party_type="Grower", party=self.grower, company=company)), 0)
		from unittest.mock import patch

		with patch.object(acc, "bank_balance", return_value=1.0), self.assertRaises(frappe.ValidationError):  # not enough in the bank
			frappe.get_doc("Cane Payment Scroll", sc.name).submit()
		sc = frappe.get_doc("Cane Payment Scroll", sc.name)
		with patch.object(acc, "bank_balance", return_value=10**9):  # enough whatever other draft scrolls hold
			sc.submit()
		sc.reload()
		self.assertEqual(sc.status, "Paid")
		pe = frappe.get_doc("Payment Entry", sc.payments[0].payment_entry)
		self.assertEqual({r.reference_name for r in pe.references}, {frappe.db.get_value("Cane Purchase Receipt", c, "journal_entry") for c in cprs})
		self.assertAlmostEqual(flt(get_balance_on(party_type="Grower", party=self.grower, company=company)), 0, places=2)
		self.assertEqual(frappe.db.get_value("Cane Purchase Receipt", cprs[0], ["payment_status", "payment_scroll"]), ("Paid", sc.name))
		with self.assertRaises(frappe.ValidationError):  # a paid CPR can't be cancelled
			frappe.get_doc("Cane Purchase Receipt", cprs[0]).cancel()
		fname, csv = acc.bank_file(sc.name)
		self.assertIn("PK36SCBL0000001123456702", csv)
		for make in (lambda: bank_docs.payment_schedule(sc.name), lambda: bank_docs.instruction_letters(sc.name)):
			self.assertTrue(make()[1].startswith(b"%PDF"))
		name, pdf = bank_docs.stop_payment(sc.name, self.grower, "account closed")
		self.assertTrue(pdf.startswith(b"%PDF"))
		self.assertTrue(frappe.db.get_value("Cane Payment Scroll Payment", {"parent": sc.name, "grower": self.grower}, "stop_requested"))
		from sugarcane.vault import store

		v1 = store("Bank Payment Schedule", "Cane Payment Scroll", sc.name, *bank_docs.payment_schedule(sc.name))
		v2 = store("Bank Payment Schedule", "Cane Payment Scroll", sc.name, *bank_docs.payment_schedule(sc.name))
		self.assertEqual(v2["version"], v1["version"] + 1)
		self.assertTrue(frappe.db.exists("File", {"file_url": v2["file_url"], "attached_to_name": sc.name}))
		sc.cancel()
		self.assertEqual(frappe.db.get_value("Cane Purchase Receipt", cprs[0], "payment_status"), "Unpaid")
		self.assertEqual(frappe.db.get_value("Payment Entry", pe.name, "docstatus"), 2)

	def test_road_cess_deposit(self):
		day, cprs = self._two_cprs()
		cess = sum(flt(frappe.db.get_value("Cane Purchase Receipt", c, "road_cess_total")) for c in cprs)
		d = frappe.get_doc({"doctype": "Road Cess Deposit", "from_date": day, "to_date": day, "deposit_date": add_days(day, 20), "challan_no": "CH-T",
			"remarks": TAG}).insert()
		self.assertEqual(d.cpr_count, len(frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": day, "cess_deposited": 0,
			"road_cess_total": [">", 0]})))
		self.assertGreaterEqual(flt(d.total_amount), cess - 0.01)
		d.submit()
		je = frappe.get_doc("Journal Entry", d.journal_entry)
		self.assertAlmostEqual(sum(a.debit for a in je.accounts), flt(d.total_amount), places=2)
		self.assertTrue(frappe.db.get_value("Cane Purchase Receipt", cprs[0], "cess_deposited"))
		with self.assertRaises(frappe.ValidationError):  # nothing left for that day
			frappe.get_doc({"doctype": "Road Cess Deposit", "from_date": day, "to_date": day, "deposit_date": day, "challan_no": "CH-T2",
				"remarks": TAG}).insert().submit()
		with self.assertRaises(frappe.ValidationError):  # deposited cess: the CPR can't be cancelled
			frappe.get_doc("Cane Purchase Receipt", cprs[0]).cancel()
		d.cancel()
		self.assertFalse(frappe.db.get_value("Cane Purchase Receipt", cprs[0], "cess_deposited"))

	# ------------------------------------------------------------ loans
	def test_loan_field_verification(self):
		season = self.season
		frappe.db.set_value("Grower Loan Type", LTYPE, {"requires_field_verification": 1, "min_surveyed_acres": 0})
		frappe.clear_document_cache("Grower Loan Type", LTYPE)
		loan = frappe.get_doc({"doctype": "Grower Loan", "grower": self.grower, "loan_type": LTYPE, "season": season, "amount": 20000,
			"remarks": TAG}).insert()
		self.assertEqual(loan.verification_status, "Pending")
		with self.assertRaises(frappe.ValidationError):  # no field survey yet
			loan.submit()
		ln.request_verification(loan.name, "Administrator")
		with self.assertRaises(frappe.ValidationError):  # a photo is required
			ln.verify(loan.name, 3, "Good", "Grand growth", 750, "Recommend")
		ln.verify(loan.name, 3, "Good", "Grand growth", 750, "Recommend a lower amount", 15000, "patchy at the canal end",
			31.9, 72.6, "/files/field.jpg")
		loan.reload()
		self.assertEqual((loan.verification_status, flt(loan.recommended_amount)), ("Verified", 15000))
		with self.assertRaises(frappe.ValidationError):  # above the recommendation
			loan.submit()
		loan.reload()
		loan.amount = 15000
		loan.save()
		loan.submit()
		self.assertEqual(loan.status, "Approved")
		# a second request is rejected and can't be approved
		other = frappe.get_doc({"doctype": "Grower Loan", "grower": self.grower, "loan_type": LTYPE, "season": season, "amount": 5000,
			"remarks": TAG}).insert()
		ln.reject(other.name, "already has a fertilizer loan this season")
		other = frappe.get_doc("Grower Loan", other.name)
		self.assertEqual(other.status, "Rejected")
		with self.assertRaises(frappe.ValidationError):
			other.submit()
		h = ln.grower_history(self.grower)
		self.assertIn(loan.name, [l.name for l in h["loans"]])
		self.assertEqual(h["rejected"], 1)
		frappe.db.set_value("Grower Loan Type", LTYPE, "requires_field_verification", 0)
		frappe.clear_document_cache("Grower Loan Type", LTYPE)

	def test_loan_lifecycle_and_recovery(self):
		season = self.season
		acres = ln.surveyed_acres(self.grower, season)
		self.assertGreater(acres, 0)
		with self.assertRaises(frappe.ValidationError):  # above the per-acre limit
			frappe.get_doc({"doctype": "Grower Loan", "grower": self.grower, "loan_type": LTYPE, "season": season, "amount": 20000 * acres + 5000,
				"remarks": TAG}).insert()
		loan = frappe.get_doc({"doctype": "Grower Loan", "grower": self.grower, "loan_type": LTYPE, "season": season, "amount": 20000,
			"application_date": add_days(self.indents[0].valid_from, -30), "remarks": TAG}).insert()
		self.assertEqual((flt(loan.requested_amount), loan.status), (20000, "Draft"))
		el = ln.eligibility(self.grower, LTYPE, season, loan.name)
		self.assertGreaterEqual(el["eligible"], 20000)
		loan.submit()
		self.assertEqual(loan.status, "Approved")
		loan = ln.disburse(loan.name, on=add_days(self.indents[0].valid_from, -25))
		self.assertEqual((loan.status, flt(loan.outstanding)), ("Disbursed", 20000))
		je = frappe.get_doc("Journal Entry", loan.disbursement_journal)
		self.assertEqual([(a.party, flt(a.debit)) for a in je.accounts if a.party], [(self.grower, 20000)])
		month = str(add_days(self.indents[0].valid_from, -25))[:7]
		out = ln.accrue_markup(month)
		self.assertGreater(out["amount"], 0)
		self.assertEqual(ln.accrue_markup(month)["loans"] if frappe.db.exists("Grower Loan Entry", {"loan": loan.name, "period": month}) else 0, 0)
		loan.reload()
		owed = flt(loan.outstanding)
		self.assertGreater(owed, 20000)

		tok = self._token(self.indents[0])  # the next CPR recovers half its net (after TPT) up to what is owed
		cpr = frappe.get_doc("Cane Purchase Receipt", self._weigh(tok, 15000, 4000)["cpr"])
		room = flt(cpr.net_amount) - flt(cpr.tpt_amount)
		self.assertAlmostEqual(flt(cpr.loan_deduction), min(owed, round(room * 0.5, 2)), places=1)
		rows = {a.account: a for a in frappe.get_doc("Journal Entry", cpr.journal_entry).accounts}
		self.assertAlmostEqual(flt(rows[frappe.db.get_single_value("Sugar Settings", "grower_loan_account")].credit), flt(cpr.loan_deduction), places=2)
		loan.reload()
		self.assertAlmostEqual(flt(loan.outstanding), owed - flt(cpr.loan_deduction), places=2)
		left = flt(loan.outstanding)
		if left > 0:
			ln.repay(loan.name, min(left, 1000), on=cpr.posting_date)
			loan.reload()
			self.assertAlmostEqual(flt(loan.outstanding), left - min(left, 1000), places=2)
		self.assertTrue(frappe.get_doc("Grower Loan", loan.name).name)
		from sugarcane.grower_loans.documents import loan_application

		self.assertTrue(loan_application(loan.name)[1].startswith(b"%PDF"))
		cpr.cancel()  # its recovery goes back on the loan
		loan.reload()
		self.assertFalse(frappe.db.exists("Grower Loan Entry", {"cpr": cpr.name}))
		self.assertGreater(flt(loan.outstanding), left - 1000)

	# ------------------------------------------------------------ contractor bill
	def test_unloading_bill_with_idle(self):
		day, cprs = self._two_cprs()
		frappe.db.set_single_value("Sugar Settings", "unloading_contractor", "Haider Transport Company")
		frappe.get_doc({"doctype": "Unloading Contract", "contract_no": "UC-TEST-PH6", "contractor": "Haider Transport Company", "valid_from": day,
			"valid_to": add_days(day, 30), "rate_per_maund": 2, "idle_rate_per_hour": 1000, "idle_min_minutes": 30,
			"idle_categories": "Mechanical\nPower"}).insert()
		start = get_datetime(f"{day} 12:00:00")
		frappe.get_doc({"doctype": "Mill Stoppage", "start": start, "end": start.replace(hour=13, minute=30), "category": "Mechanical", "reason": TAG}).insert()
		frappe.get_doc({"doctype": "Mill Stoppage", "start": start.replace(hour=15), "end": start.replace(hour=15, minute=20), "category": "Mechanical",
			"reason": TAG}).insert()  # too short
		frappe.get_doc({"doctype": "Mill Stoppage", "start": start.replace(hour=17), "end": start.replace(hour=18), "category": "Planned Cleaning",
			"reason": TAG}).insert()  # not a paid category
		b = frappe.get_doc({"doctype": "Contractor Bill", "bill_type": "Unloading at Mill", "from_date": day, "to_date": day, "remarks": TAG}).insert()
		ours = [i for i in b.items if i.reference_name in cprs]
		self.assertEqual(len(ours), 2)
		self.assertAlmostEqual(flt(ours[0].rate), 2)
		idle = [i for i in b.items if i.reference_doctype == "Mill Stoppage"]
		self.assertEqual([flt(i.hours) for i in idle], [1.5])
		self.assertAlmostEqual(flt(b.idle_amount), 1500, places=2)
		self.assertEqual(b.unloading_contract, "UC-TEST-PH6")
		b.submit()
		b.reload()
		self.assertEqual(b.status, "Posted")
		je = frappe.get_doc("Journal Entry", b.journal_entry)
		self.assertEqual([a.party for a in je.accounts if a.party], ["Haider Transport Company"])
		again = frappe.get_doc({"doctype": "Contractor Bill", "bill_type": "Unloading at Mill", "from_date": day, "to_date": day, "remarks": TAG}).insert()
		self.assertFalse([i for i in again.items if i.reference_name in cprs or i.reference_doctype == "Mill Stoppage"])  # billed once
