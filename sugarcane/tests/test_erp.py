"""Phase 7: the standard modules configured for the mill — configuration (idempotent, 5-level chart, tax slab), voucher
series / batch posting / printing, gate passes, sugar dispatch weighment (tolerance, DN posted, gate pass), the
biometric punch endpoint and late penalties, the comparative statement."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, flt, now_datetime, nowdate

from sugarcane.setup import erp_config

TERM = "Test WB P7"
ITEM = "TEST-P7-SUGAR"
CUST = "Test P7 Sugar Buyer"


class TestErp(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		cls.company = ensure_company()
		erp_config.configure(cls.company)
		cls.abbr = frappe.get_cached_value("Company", cls.company, "abbr")

	def _acc(self, name):
		return f"{name} - {self.abbr}"

	# ------------------------------------------------------------ configuration
	def test_configuration(self):
		before = {dt: frappe.db.count(dt) for dt in ("Account", "Item Group", "Warehouse", "Salary Component", "Territory")}
		erp_config.configure(self.company)  # a second run changes nothing
		self.assertEqual(before, {dt: frappe.db.count(dt) for dt in before})
		self.assertEqual(erp_config._depth(self.company), 5)
		self.assertEqual(frappe.db.get_value("Account", self._acc("Grower Payable"), "parent_account"), self._acc("Cane Growers"))
		self.assertEqual(frappe.db.get_value("Account", self._acc("Output Sales Tax (GST)"), "parent_account"), self._acc("Sales Tax"))
		# item groups are 4 deep: All Item Groups > Stores and Spares > Mechanical > Bearings
		self.assertEqual(frappe.db.get_value("Item Group", "Bearings", "parent_item_group"), "Mechanical")
		self.assertEqual(frappe.db.get_value("Item Group", "Mechanical", "parent_item_group"), "Stores and Spares")
		# Finance Act 2025 salaried slabs: Rs 4,286,400 a year → 616,000 + 35 % of the excess over 4.1 M
		from hrms.payroll.doctype.income_tax_slab.income_tax_slab import calculate_tax_by_tax_slab

		slab = frappe.get_doc("Income Tax Slab", "Pakistan Salaried TY2026")
		self.assertAlmostEqual(calculate_tax_by_tax_slab(4286400, slab)[0], 616000 + 0.35 * 186400, delta=5)  # ERPNext counts slab bounds inclusively (± Rs 1)
		self.assertAlmostEqual(calculate_tax_by_tax_slab(1000000, slab)[0], 4000, delta=5)
		self.assertEqual(frappe.db.get_value("Stock Entry Type", "Store Issue", "purpose"), "Material Issue")
		self.assertTrue(frappe.db.exists("Cheque Print Template", "HBL"))

	# ------------------------------------------------------------ vouchers
	def _je(self, debit, credit, amount=1000, remark="test P7"):
		cc = frappe.db.get_value("Company", self.company, "cost_center")
		return frappe.get_doc({"doctype": "Journal Entry", "company": self.company, "posting_date": nowdate(), "user_remark": remark,
			"accounts": [{"account": debit, "debit_in_account_currency": amount, "cost_center": cc},
				{"account": credit, "credit_in_account_currency": amount, "cost_center": cc}]}).insert()

	def test_voucher_series_post_and_print(self):
		from sugarcane.mill_finance import vouchers

		exp = frappe.db.get_value("Company", self.company, "default_expense_account")
		bank = self._acc("Cane Payments Bank")
		cash = frappe.db.get_value("Account", {"company": self.company, "account_type": "Cash", "is_group": 0}, "name")
		bpv = self._je(exp, bank)
		crv = self._je(cash, frappe.db.get_value("Account", {"company": self.company, "account_name": "Miscellaneous Expenses"}, "name") or exp)
		jv = self._je(exp, frappe.db.get_value("Company", self.company, "round_off_account"))
		self.assertEqual((bpv.voucher_code, crv.voucher_code, jv.voucher_code), ("BPV", "CRV", "JV"))
		self.assertTrue(bpv.name.startswith("BPV-") and crv.name.startswith("CRV-") and jv.name.startswith("JV-"))
		out = vouchers.post([bpv.name, f"Journal Entry::{crv.name}"])
		self.assertEqual(sorted(out["posted"]), sorted([bpv.name, crv.name]))
		self.assertEqual(frappe.db.get_value("Journal Entry", bpv.name, "docstatus"), 1)
		again = vouchers.post([bpv.name])  # already posted
		self.assertEqual((again["posted"], len(again["failed"])), ([], 1))
		name, pdf = vouchers.voucher_pdf([bpv.name, jv.name])
		self.assertTrue(pdf.startswith(b"%PDF"))

	# ------------------------------------------------------------ gate pass
	def test_returnable_gate_pass(self):
		from sugarcane.mill_stores.gate_pass import record_return

		doc = {"doctype": "Gate Pass", "pass_type": "Outward - Returnable", "posting_date": nowdate(), "party_type": "Other",
			"party_name": "Test workshop", "items": [{"description": "Pump impeller", "qty": 2}, {"description": "Shaft", "qty": 1}]}
		with self.assertRaises(frappe.ValidationError):  # returnable needs the date it comes back
			frappe.get_doc(doc).insert()
		gp = frappe.get_doc({**doc, "expected_return_date": add_days(nowdate(), 7)}).insert()
		gp.submit()
		gp.reload()
		self.assertEqual(gp.status, "Out")
		self.assertTrue(gp.out_at)
		record_return(gp.name, {gp.items[0].name: 1})
		self.assertEqual(frappe.db.get_value("Gate Pass", gp.name, "status"), "Partly Returned")
		with self.assertRaises(frappe.ValidationError):
			record_return(gp.name, {gp.items[1].name: 2})
		record_return(gp.name)
		self.assertEqual(frappe.db.get_value("Gate Pass", gp.name, "status"), "Returned")

	# ------------------------------------------------------------ sugar dispatch
	def _sugar_dn(self, bags=100):
		wh = self._acc("Finished Goods")
		if not frappe.db.exists("Item", ITEM):
			frappe.get_doc({"doctype": "Item", "item_code": ITEM, "item_name": "Test sugar bag", "item_group": "Refined Sugar", "stock_uom": "Bag",
				"is_stock_item": 1, "valuation_rate": 6000}).insert()
		if not frappe.db.exists("Customer", CUST):
			frappe.get_doc({"doctype": "Customer", "customer_name": CUST, "customer_group": "Sugar Dealer", "territory": "Lahore Region"}).insert()
		if not frappe.db.exists("Weighbridge Terminal", TERM):
			frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": TERM, "weighbridge_no": "7", "allowed_operations": "All",
				"ip_address": "10.9.9.7", "indicator_protocol": "Simulator", "is_active": 1}).insert()
		se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": self.company,
			"items": [{"item_code": ITEM, "qty": bags, "t_warehouse": wh, "basic_rate": 6000,
				"cost_center": frappe.db.get_value("Company", self.company, "cost_center")}]}).insert()
		se.submit()
		return frappe.get_doc({"doctype": "Delivery Note", "customer": CUST, "company": self.company, "posting_date": nowdate(),
			"items": [{"item_code": ITEM, "qty": bags, "rate": 7250, "uom": "Bag", "warehouse": wh}]}).insert()

	def test_sales_weighment(self):
		from sugarcane.cane_procurement import procurement as p
		from sugarcane.sugar_sales import dispatch

		dn = self._sugar_dn(100)
		at = now_datetime()
		p._cache_reading(TERM, {"weight_kg": 10000, "stable": 1, "raw": "", "source": "Simulator", "at": str(at)})
		sw = dispatch.weigh_empty(dn.name, "lhr-7001", TERM, at=at)
		self.assertEqual((sw["tare_kg"], sw["bags"], sw["vehicle_no"]), (10000, 100, "LHR-7001"))
		self.assertAlmostEqual(sw["expected_kg"], 100 * (50 + 0.1), places=2)
		with self.assertRaises(frappe.ValidationError):  # a second weighment for the same DO
			dispatch.weigh_empty(dn.name, "LHR-7001", TERM, at=at)
		p._cache_reading(TERM, {"weight_kg": 10000 + 4800, "stable": 1, "raw": "", "source": "Simulator", "at": str(at)})
		frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):  # 4 % short: refused (an override needs accept=1)
			dispatch.weigh_loaded(sw["name"], at=at)
		p._cache_reading(TERM, {"weight_kg": 10000 + 5015, "stable": 1, "raw": "", "source": "Simulator", "at": str(at)})
		done = dispatch.weigh_loaded(sw["name"], at=at)
		self.assertEqual((done["status"], done["net_kg"], done["within_limit"]), ("Completed", 5015, 1))
		dn.reload()
		self.assertEqual((dn.docstatus, dn.sales_weighment), (1, sw["name"]))
		gp = frappe.get_doc("Gate Pass", dn.gate_pass)
		self.assertEqual((gp.pass_type, gp.status, gp.reference_name, gp.items[0].qty), ("Sales Dispatch", "Closed", dn.name, 100))

	# ------------------------------------------------------------ HR
	def _employee(self, device_id):
		e = frappe.get_doc({"doctype": "Employee", "first_name": "Test", "last_name": f"P7 {device_id}", "gender": "Male", "date_of_birth": "1990-01-01",
			"date_of_joining": "2026-07-01", "company": self.company, "attendance_device_id": device_id, "status": "Active"}).insert()
		return e

	def test_biometric_punch_and_late_penalty(self):
		from sugarcane.mill_hr import hr

		e = self._employee("P7-9001")
		s = frappe.get_doc("Sugar Settings")
		s.biometric_token = "p7-token"
		s.save()
		with self.assertRaises(frappe.PermissionError):
			hr.punch("wrong", "ZK-1", "P7-9001", "2026-10-05 07:58:00")
		one = hr.punch("p7-token", "ZK-1", "P7-9001", "2026-10-05 07:58:00", "IN")
		self.assertEqual(one["employee"], e.name)
		self.assertEqual(hr.punch("p7-token", "ZK-1", "P7-9001", "2026-10-05 07:58:00")["duplicate"], 1)
		frappe.set_user("Administrator")
		from frappe.utils.password import remove_encrypted_password

		remove_encrypted_password("Sugar Settings", "Sugar Settings", "biometric_token")
		# 7 late marks in a month, 3 per day → 2 days × base / 30
		frappe.get_doc({"doctype": "Salary Structure Assignment", "employee": e.name, "salary_structure": "Mill Staff - Monthly",
			"company": self.company, "from_date": "2026-07-01", "base": 60000, "currency": "PKR", "income_tax_slab": "Pakistan Salaried TY2026",
			"payroll_payable_account": self._acc("Payroll Payable")}).insert().submit()
		for day in range(1, 8):
			frappe.get_doc({"doctype": "Attendance", "employee": e.name, "attendance_date": f"2026-09-{day:02d}", "status": "Present",
				"company": self.company, "late_entry": 1}).insert().submit()
		out = hr.late_penalties("2026-09")
		mine = next(m for m in out["made"] if m["employee"] == e.name)
		self.assertEqual((mine["late"], mine["days"], flt(mine["amount"])), (7, 2, 4000))
		self.assertNotIn(e.name, [m["employee"] for m in hr.late_penalties("2026-09")["made"]])  # once a month

	# ------------------------------------------------------------ comparative statement
	def test_comparative_statement(self):
		from sugarcane.mill_stores.report.comparative_statement import comparative_statement as cs

		item = "TEST-P7-LIME"
		if not frappe.db.exists("Item", item):
			frappe.get_doc({"doctype": "Item", "item_code": item, "item_name": "Test lime", "item_group": "Lime", "stock_uom": "Kg", "is_stock_item": 1}).insert()
		for name in ("Test P7 Vendor A", "Test P7 Vendor B"):
			if not frappe.db.exists("Supplier", name):
				frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": "Chemical Supplier"}).insert()
		cc = frappe.db.get_value("Company", self.company, "cost_center")
		for name, rate in (("Test P7 Vendor A", 45), ("Test P7 Vendor B", 40)):
			frappe.get_doc({"doctype": "Supplier Quotation", "supplier": name, "company": self.company, "transaction_date": nowdate(),
				"items": [{"item_code": item, "qty": 1000, "rate": rate, "warehouse": self._acc("Stores"), "cost_center": cc}]}).insert()
		cols, rows, _m, _c, summary = cs.execute({"item_code": item})
		r = rows[0]
		self.assertEqual((r["quotes"], r["lowest_supplier"], r["lowest_rate"], r["lowest_amount"]), (2, "Test P7 Vendor B", 40, 40000))
		self.assertEqual(r["spread_pct"], 12.5)
