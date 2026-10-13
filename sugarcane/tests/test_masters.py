"""Masters against the database: grower IDs, CNIC rules, Grower as an ERPNext party, circle scoping."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, nowdate

from sugarcane.calc.identity import make_iban
from sugarcane.setup.company import ensure_company

TEST_CIRCLES = (("Test Circle North", "901"), ("Test Circle South", "902"))


def _make_hierarchy():
	if not frappe.db.exists("Sugar Division", "Test Division"):
		frappe.get_doc({"doctype": "Sugar Division", "division_name": "Test Division"}).insert()
	if not frappe.db.exists("Sugar District", "Test District"):
		frappe.get_doc({"doctype": "Sugar District", "district_name": "Test District", "division": "Test Division"}).insert()
	if not frappe.db.exists("Sugar Zone", "Test Zone"):
		frappe.get_doc({"doctype": "Sugar Zone", "zone_name": "Test Zone", "district": "Test District"}).insert()
	for name, code in TEST_CIRCLES:
		if not frappe.db.exists("Cane Circle", name):
			frappe.get_doc({"doctype": "Cane Circle", "circle_name": name, "circle_code": code, "zone": "Test Zone"}).insert()
		for vcode in ("1", "2"):
			if not frappe.db.exists("Cane Village", f"{code}-00{vcode}"):
				frappe.get_doc({"doctype": "Cane Village", "village_name": f"Test Village {code}/{vcode}", "village_code": vcode,
					"circle": name}).insert()


def _grower(cnic, circle="Test Circle North", village="901-001", **kw):
	return frappe.get_doc({"doctype": "Grower", "grower_name": kw.pop("grower_name", "Test Grower"), "cnic": cnic,
		"circle": circle, "village": village, **kw}).insert()


class TestMasters(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		ensure_company()
		_make_hierarchy()

	def test_village_name_and_code(self):
		v = frappe.get_doc("Cane Village", "901-001")
		self.assertEqual(v.village_code, "001")
		self.assertEqual(v.circle_code, "901")
		with self.assertRaises(frappe.ValidationError):
			v.village_code = "005"
			v.save()

	def test_grower_id_serial_per_village(self):
		a = _grower("90101-0000001-1")
		b = _grower("90101-0000002-1")
		c = _grower("90101-0000003-1", village="901-002")
		prefix_a, serial_a = a.name.rsplit("-", 1)
		self.assertEqual(prefix_a, "901-001")
		self.assertEqual(int(b.name.rsplit("-", 1)[1]), int(serial_a) + 1)
		self.assertTrue(c.name.startswith("901-002-"))
		self.assertEqual(len(c.name), len("001-001-0001"))
		self.assertEqual(a.grower_serial, int(serial_a))

	def test_cnic_normalised_and_unique(self):
		g = _grower("9010100000041")
		self.assertEqual(g.cnic, "90101-0000004-1")
		with self.assertRaises(frappe.UniqueValidationError):
			_grower("90101-0000004-1")
		with self.assertRaises(frappe.ValidationError):
			_grower("12345")

	def test_village_must_be_in_circle(self):
		with self.assertRaises(frappe.ValidationError):
			_grower("90101-0000005-1", circle="Test Circle North", village="902-001")

	def test_payable_account_row(self):
		g = _grower("90101-0000006-1")
		settings = frappe.get_single("Sugar Settings")
		self.assertEqual([(r.company, r.account) for r in g.accounts], [(settings.company, settings.grower_payable_account)])
		from erpnext.accounts.party import get_party_account

		self.assertEqual(get_party_account("Grower", g.name, settings.company), settings.grower_payable_account)

	def test_bank_account_created(self):
		iban = make_iban("PK", "TEST0000001123456702")
		spaced = " ".join(iban[i:i + 4] for i in range(0, 24, 4)).lower()
		g = _grower("90101-0000007-1", bank_name="Test Bank PK", account_no="0012345678", iban=spaced)
		g.reload()
		self.assertEqual(g.iban, iban)
		self.assertTrue(g.bank_account)
		ba = frappe.get_doc("Bank Account", g.bank_account)
		self.assertEqual((ba.party_type, ba.party, ba.iban), ("Grower", g.name, iban))
		with self.assertRaises(frappe.ValidationError):
			_grower("90101-0000012-1", iban=iban[:-1] + ("1" if iban[-1] != "1" else "2"))

	def test_grower_journal_and_payment_entry(self):
		"""A grower works as an ERPNext party: JE credit (like a CPR) then a Payment Entry against it."""
		settings = frappe.get_single("Sugar Settings")
		company = settings.company
		g = _grower("90101-0000008-1")
		je = frappe.get_doc({
			"doctype": "Journal Entry", "company": company, "posting_date": nowdate(), "voucher_type": "Journal Entry",
			"accounts": [
				{"account": settings.cane_purchase_clearing_account, "party_type": "Supplier",
					"party": settings.daily_purchase_supplier, "debit_in_account_currency": 1000, "cost_center": settings.cost_center},
				{"account": settings.grower_payable_account, "party_type": "Grower", "party": g.name,
					"credit_in_account_currency": 1000, "cost_center": settings.cost_center},
			],
		}).insert()
		je.submit()
		from erpnext.accounts.utils import get_balance_on

		self.assertEqual(flt(get_balance_on(party_type="Grower", party=g.name, company=company)), -1000)

		bank = frappe.db.get_value("Account", {"company": company, "account_type": "Cash", "is_group": 0}, "name")
		pe = frappe.get_doc({
			"doctype": "Payment Entry", "payment_type": "Pay", "company": company, "posting_date": nowdate(),
			"party_type": "Grower", "party": g.name, "paid_from": bank, "paid_to": settings.grower_payable_account,
			"paid_amount": 1000, "received_amount": 1000, "mode_of_payment": "Cash",
			"references": [{"reference_doctype": "Journal Entry", "reference_name": je.name, "allocated_amount": 1000}],
		})
		pe.setup_party_account_field()
		pe.set_missing_values()
		pe.insert()
		pe.submit()
		self.assertEqual(flt(get_balance_on(party_type="Grower", party=g.name, company=company)), 0)

	def test_circle_officer_sees_only_own_circle(self):
		north = _grower("90101-0000009-1", grower_name="North Grower")
		south = _grower("90201-0000009-1", circle="Test Circle South", village="902-001", grower_name="South Grower")
		email = "test.circle.officer@micromaxsugar.example"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": "Test Officer", "send_welcome_email": 0})
			user.flags.no_welcome_mail = True
			user.insert()
		frappe.get_doc("User", email).add_roles("Circle Officer")
		if not frappe.db.exists("User Permission", {"user": email, "allow": "Cane Circle", "for_value": "Test Circle North"}):
			frappe.get_doc({"doctype": "User Permission", "user": email, "allow": "Cane Circle",
				"for_value": "Test Circle North"}).insert()
		frappe.set_user(email)
		try:
			visible = set(frappe.get_list("Grower", pluck="name", limit=0))
			self.assertIn(north.name, visible)
			self.assertNotIn(south.name, visible)
			self.assertFalse(frappe.has_permission("Grower", doc=south.name))
		finally:
			frappe.set_user("Administrator")

	def test_vehicle_registration_normalised(self):
		if not frappe.db.exists("Vehicle Type", "Test Trolley"):
			frappe.get_doc({"doctype": "Vehicle Type", "vehicle_type_name": "Test Trolley", "min_gross_kg": 3000,
				"max_gross_kg": 22000, "min_tare_kg": 2000, "max_tare_kg": 5000}).insert()
		v = frappe.get_doc({"doctype": "Sugar Vehicle", "registration_no": " tst  9911 ", "vehicle_type": "Test Trolley",
			"driver_cnic": "9010100000101"}).insert()
		self.assertEqual(v.name, "TST-9911")
		self.assertEqual(v.driver_cnic, "90101-0000010-1")

	def test_vehicle_type_limits(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "Vehicle Type", "vehicle_type_name": "Test Bad", "min_gross_kg": 9000,
				"max_gross_kg": 5000}).insert()

	def test_terminal_ip(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": "Test WB Bad", "ip_address": "300.1.1.1"}).insert()

	def test_passbook_sets_grower(self):
		g = _grower("90101-0000011-1")
		pb = frappe.get_doc({"doctype": "Grower Passbook", "passbook_no": "test-pb-0001", "grower": g.name,
			"land_holdings": [{"murabba_no": "12", "killa_no": "5", "acres": 2.5}, {"acres": 1.25}]}).insert()
		self.assertEqual(pb.name, "TEST-PB-0001")
		self.assertEqual(pb.total_acres, 3.75)
		self.assertEqual(pb.total_kanal, 30)
		self.assertEqual(frappe.db.get_value("Grower", g.name, "passbook_no"), "TEST-PB-0001")
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "Grower Passbook", "passbook_no": "TEST-PB-0002", "grower": g.name}).insert()

	def test_one_open_season(self):
		company = frappe.db.get_single_value("Sugar Settings", "company")
		for name in ("Test Season A", "Test Season B"):
			if frappe.db.exists("Crushing Season", name):
				frappe.delete_doc("Crushing Season", name, force=1)
		frappe.get_doc({"doctype": "Crushing Season", "season_name": "Test Season A", "company": company,
			"start_date": "2030-11-01", "end_date": "2031-03-31", "status": "Planned"}).insert()
		open_now = frappe.db.get_value("Crushing Season", {"company": company, "status": "Open"}, "name")
		if open_now:
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc({"doctype": "Crushing Season", "season_name": "Test Season B", "company": company,
					"start_date": "2031-11-01", "end_date": "2032-03-31", "status": "Open"}).insert()
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "Crushing Season", "season_name": "Test Season B", "company": company,
				"start_date": "2031-11-01", "end_date": "2031-10-01"}).insert()

	def test_grower_import(self):
		rows = [
			"grower_name,father_name,cnic,circle_code,village_code,passbook_no,acres,bank_name,account_no,filer_status",
			"Import One,Father One,9020100000201,902,1,TEST-IMP-1,3.5,Test Import Bank,111,",
			"Import Two,Father Two,90201-0000020-2,902,2,TEST-IMP-2,,,,Filer",
			"Import Dup,Father,90201-0000020-2,902,1,,,,,",  # CNIC repeated in the file
			"Import Bad Circle,Father,90201-0000020-3,999,1,,,,,",  # no such circle
			"Import Bad CNIC,Father,12345,902,1,,,,,",
			",Father,90201-0000020-4,902,1,,,,,",  # name missing
		]
		file = frappe.get_doc({"doctype": "File", "file_name": "test_growers.csv", "content": "\n".join(rows).encode(),
			"is_private": 1}).insert()
		imp = frappe.get_doc({"doctype": "Grower Import", "import_file": file.file_url}).insert()
		imp.start_import()
		imp.reload()
		self.assertEqual((imp.status, imp.total_rows, imp.imported_rows, imp.failed_rows),
			("Completed with Errors", 6, 2, 4))
		self.assertTrue(imp.error_file)
		one = frappe.get_doc("Grower", {"cnic": "90201-0000020-1"})
		self.assertTrue(one.name.startswith("902-001-"))
		self.assertEqual(one.passbook_no, "TEST-IMP-1")
		self.assertEqual(frappe.db.get_value("Grower Passbook", "TEST-IMP-1", "total_acres"), 3.5)
		self.assertTrue(one.bank_account)
		two = frappe.get_doc("Grower", {"cnic": "90201-0000020-2"})
		self.assertEqual(two.filer_status, "Filer")
