"""Pure calculation tests (no database): CPR formula, units, CNIC / grower ID, rate resolution."""

from decimal import Decimal as Dec

from frappe.tests import UnitTestCase

from sugarcane.calc import cpr, identity, rates, units
from sugarcane.calc.cpr import CPRError, CPRInput

# 2026-27 demo season: govt 425 / 40 kg, road cess 1% (grower 50%), subsidy 10, additional subsidy 5, TPT 30 per maund,
# binding 0.265 kg per quintal, no garbage
SEASON = dict(govt_rate=425, road_cess_pct=1, grower_cess_share_pct=50, subsidy_rate=10, additional_subsidy_rate=5,
	tpt_rate=30, binding_kg_per_quintal=0.265)


class TestCPRFormula(UnitTestCase):
	def test_worked_example(self):
		"""Hand-worked slip: gross 18,450 kg, tare 4,250 kg."""
		r = cpr.compute(CPRInput(gross_kg=18450, tare_kg=4250, **SEASON))
		self.assertEqual(r.net_kg, 14200)
		self.assertEqual(r.binding_kg, 38)  # 14,200 / 100 × 0.265 = 37.63 → 38
		self.assertEqual(r.garbage_kg, 0)
		self.assertEqual(r.payable_kg, 14162)
		self.assertEqual(r.payable_maund, Dec("354.050"))
		self.assertEqual(r.govt_value, Dec("150471.25"))  # 14,162 × 425 / 40
		self.assertEqual(r.road_cess_total, Dec("1504.71"))  # 1% of govt value
		self.assertEqual(r.road_cess_grower, Dec("752.36"))  # 50%, rounded half up
		self.assertEqual(r.road_cess_mill, Dec("752.35"))  # the rest, so the two always add up to the total
		self.assertEqual(r.subsidy, Dec("3540.50"))
		self.assertEqual(r.additional_subsidy, Dec("1770.25"))
		self.assertEqual(r.net_amount, Dec("155029.64"))  # 150,471.25 − 752.36 + 3,540.50 + 1,770.25
		self.assertEqual(r.tpt_amount, Dec("10621.50"))
		self.assertEqual(r.payable_cpr, Dec("144408.14"))

	def test_journal_balances(self):
		for gross, tare in ((18450, 4250), (7311, 2987), (40000, 11873), (1203, 401)):
			r = cpr.compute(CPRInput(gross_kg=gross, tare_kg=tare, loan_deduction=1234.56, **SEASON))
			lines = cpr.journal_lines(r)
			self.assertEqual(sum(x["debit"] for x in lines), sum(x["credit"] for x in lines), (gross, tare))
			self.assertEqual(r.road_cess_grower + r.road_cess_mill, r.road_cess_total)

	def test_journal_lines_example(self):
		r = cpr.compute(CPRInput(gross_kg=18450, tare_kg=4250, **SEASON))
		by_key = {x["account_key"]: x for x in cpr.journal_lines(r)}
		self.assertEqual(by_key["cane_purchase_clearing_account"]["debit"], Dec("150471.25"))
		self.assertEqual(by_key["subsidy_purchase_account"]["debit"], Dec("3540.50"))
		self.assertEqual(by_key["additional_subsidy_account"]["debit"], Dec("1770.25"))
		self.assertEqual(by_key["road_cess_expense_account"]["debit"], Dec("752.35"))
		self.assertEqual(by_key["road_cess_payable_account"]["credit"], Dec("1504.71"))
		self.assertEqual(by_key["tpt_payable_account"]["credit"], Dec("10621.50"))
		self.assertEqual(by_key["grower_payable_account"]["credit"], Dec("144408.14"))
		self.assertNotIn("grower_loan_account", by_key)  # zero lines are dropped

	def test_garbage_percent_and_fixed(self):
		r = cpr.compute(CPRInput(gross_kg=10000, tare_kg=2000, govt_rate=425, garbage_pct=2, garbage_fixed_kg=10))
		self.assertEqual(r.garbage_kg, 170)  # 8,000 × 2% + 10
		self.assertEqual(r.payable_kg, 7830)

	def test_loan_deduction_is_capped(self):
		r = cpr.compute(CPRInput(gross_kg=1000, tare_kg=600, govt_rate=425, tpt_rate=30, loan_deduction=999999))
		self.assertTrue(r.loan_capped)
		self.assertEqual(r.payable_cpr, 0)
		self.assertEqual(r.loan_deduction, r.net_amount - r.tpt_amount)

	def test_no_cess_when_zero(self):
		r = cpr.compute(CPRInput(gross_kg=5000, tare_kg=1000, govt_rate=400))
		self.assertEqual(r.road_cess_total, 0)
		self.assertEqual(r.net_amount, r.govt_value)
		self.assertEqual(r.payable_cpr, Dec("40000.00"))  # 4,000 kg = 100 maund × 400

	def test_bad_weights(self):
		with self.assertRaises(CPRError):
			cpr.compute(CPRInput(gross_kg=4000, tare_kg=4000, govt_rate=425))
		with self.assertRaises(CPRError):
			cpr.compute(CPRInput(gross_kg=0, tare_kg=0, govt_rate=425))
		with self.assertRaises(CPRError):
			cpr.compute(CPRInput(gross_kg=5000, tare_kg=1000, govt_rate=-1))
		with self.assertRaises(CPRError):
			cpr.compute(CPRInput(gross_kg=5000, tare_kg=1000, govt_rate=425, grower_cess_share_pct=120))

	def test_tpt_more_than_amount(self):
		with self.assertRaises(CPRError):
			cpr.compute(CPRInput(gross_kg=5000, tare_kg=1000, govt_rate=10, tpt_rate=30))

	def test_float_inputs_do_not_drift(self):
		"""Values from the database arrive as floats; 0.265 must stay 0.265."""
		r = cpr.compute(CPRInput(gross_kg=18450.0, tare_kg=4250.0, **{**SEASON, "binding_kg_per_quintal": 0.265}))
		self.assertEqual(r.payable_cpr, Dec("144408.14"))


class TestUnits(UnitTestCase):
	def test_weight(self):
		self.assertEqual(units.kg_to_maund(14162), Dec("354.050"))
		self.assertEqual(units.kg_to_maund(1), Dec("0.025"))
		self.assertEqual(units.maund_to_kg(2.5), 100)
		self.assertEqual(units.kg_to_quintal(250), Dec("2.5"))

	def test_area(self):
		self.assertEqual(units.acres_to_kanal(2.5), 20)
		self.assertEqual(units.kanal_to_acres(4), Dec("0.5"))
		self.assertEqual(units.acres_to_murabba(50), 2)
		self.assertAlmostEqual(float(units.sq_m_to_acres(4046.8564224)), 1.0, places=9)


class TestIdentity(UnitTestCase):
	def test_cnic(self):
		self.assertEqual(identity.normalize_cnic("3840312345671"), "38403-1234567-1")
		self.assertEqual(identity.normalize_cnic("38403 1234567 1"), "38403-1234567-1")
		self.assertEqual(identity.normalize_cnic("38403-1234567-1"), "38403-1234567-1")
		self.assertIsNone(identity.normalize_cnic(""))
		for bad in ("38403-123456-1", "3840312345671x", "384031234567", "ABCDE-1234567-1"):
			with self.assertRaises(identity.FormatError):
				identity.normalize_cnic(bad)

	def test_iban(self):
		iban = identity.make_iban("PK", "SCBL0000001123456702")
		self.assertEqual(iban, "PK36SCBL0000001123456702")  # the published example Pakistani IBAN
		self.assertEqual(identity.normalize_iban("pk36 scbl 0000 0011 2345 6702"), iban)
		for bad in ("PK37SCBL0000001123456702", "PK36SCBL000000112345670", "1234"):
			with self.assertRaises(identity.FormatError):
				identity.normalize_iban(bad)

	def test_grower_id(self):
		self.assertEqual(identity.grower_id("1", "1", 1), "001-001-0001")
		self.assertEqual(identity.grower_id("012", "105", 9999), "012-105-9999")
		with self.assertRaises(identity.FormatError):
			identity.grower_id("1", "1", 10000)
		with self.assertRaises(identity.FormatError):
			identity.grower_id("1234", "1", 1)
		with self.assertRaises(identity.FormatError):
			identity.grower_id("0", "1", 1)
		with self.assertRaises(identity.FormatError):
			identity.grower_id("A1", "1", 1)


class TestRates(UnitTestCase):
	def test_most_specific_wins(self):
		season = {"govt_rate": 425, "subsidy_rate": 10, "tpt_rate": 30, "road_cess_pct": 1}
		circle = {"subsidy_rate": 12, "tpt_rate": None}
		source = {"tpt_rate": 35, "road_cess_pct": ""}
		lp = {"tpt_rate": 40}
		r = rates.resolve(season, circle=circle, source=source, loading_point=lp)
		self.assertEqual((r["govt_rate"], r["govt_rate_level"]), (425, "season"))
		self.assertEqual((r["subsidy_rate"], r["subsidy_rate_level"]), (12, "circle"))
		self.assertEqual((r["tpt_rate"], r["tpt_rate_level"]), (40, "loading_point"))
		self.assertEqual((r["road_cess_pct"], r["road_cess_pct_level"]), (1, "season"))

	def test_zero_is_a_value(self):
		r = rates.resolve({"subsidy_rate": 10}, circle={"subsidy_rate": 0})
		self.assertEqual((r["subsidy_rate"], r["subsidy_rate_level"]), (0, "circle"))

	def test_missing_everywhere(self):
		r = rates.resolve({})
		self.assertIsNone(r["govt_rate"])
		self.assertIsNone(r["govt_rate_level"])
