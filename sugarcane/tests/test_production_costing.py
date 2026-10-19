"""Production & costing: the DMR's shifts, grades, bagasse split and mill extraction; production posted per grade with the
burnt bagasse issued to the boilers and a provisional cost; By-product Rate NRV; the Costing Run (cane + processing by
cost centre with service allocation − by-product credit), its sugar revaluation and its cancel."""

import frappe
from frappe.utils import add_days, flt

from sugarcane.cane_laboratory import lab
from sugarcane.cane_procurement import procurement as p
from sugarcane.stock import stock_qty
from sugarcane.tests.test_lab import _lab_cleanup
from sugarcane.tests.test_procurement import ProcurementBase

TAG = "TEST-COSTING"


def _cost_cleanup(season):
	frappe.set_user("Administrator")
	for name in frappe.get_all("Costing Run", filters={"season": season, "docstatus": 1}, pluck="name"):
		frappe.get_doc("Costing Run", name).cancel()
	frappe.db.delete("Costing Run", {"season": season})
	for name in frappe.get_all("Journal Entry", filters={"user_remark": ["like", f"%{TAG}%"], "docstatus": 1}, pluck="name"):
		frappe.get_doc("Journal Entry", name).cancel()
	frappe.db.delete("By-product Rate", {"season": season, "remarks": TAG})


class TestProductionCosting(ProcurementBase):
	CNIC = "91901"
	LAT_OFFSET = 1.12

	def setUp(self):
		from sugarcane.setup.erp_config import configure
		from sugarcane.setup.lab_setup import ensure
		from sugarcane.tests.test_indenting import _setup_season

		ensure()
		season = _setup_season()
		_cost_cleanup(season)
		_lab_cleanup(season)
		super().setUp()
		configure()
		frappe.db.set_value("Crushing Season", self.season, {"standard_recovery_pct": 10, "bag_weight_kg": 50, "molasses_nrv_per_kg": 30,
			"bagasse_nrv_per_kg": 8, "press_mud_nrv_per_kg": 2, "expected_molasses_pct": 4.5, "expected_bagasse_pct": 30, "expected_mud_pct": 3.5,
			"budget_processing_per_ton": 3000})
		frappe.db.set_single_value("Sugar Settings", "credit_internal_bagasse", 1)
		frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
		self.s = frappe.get_single("Sugar Settings")
		self.abbr = frappe.get_cached_value("Company", self.s.company, "abbr")

	def _day(self):
		day = self.indents[1].valid_from
		cprs = []
		for k, (i, vno) in enumerate(((self.indents[0], self.vno), (self.indents[1], self.vno + "B"))):
			tok = self._token(i, vehicle_no=vno, at=self._at(self.indents[1], 9 + k))
			cprs.append(self._weigh(tok, 15000 + k * 1000, 4000)["cpr"])
		lab.record_samples([{"sample_type": "Mixed Juice", "sample_time": f"{day} 10:00:00", "brix": 15.0, "pol": 12.75},
			{"sample_type": "Bagasse", "sample_time": f"{day} 10:00:00", "pol": 2.0, "moisture_pct": 49}])
		return day, cprs

	def _dmr(self, day):
		d = frappe.get_doc({"doctype": "Daily Manufacturing Report", "crushing_day": day, "yard_closing_kg": 1000})
		d.insert()
		crushed = d.cane_crushed_kg
		bags = int(crushed * 0.1 / 50)
		d.update({"molasses_kg": int(crushed * 0.045), "bagasse_kg": int(crushed * 0.3), "bagasse_burnt_kg": int(crushed * 0.27),
			"press_mud_kg": int(crushed * 0.035), "pol_pct_cane": 12.5, "mixed_juice_kg": int(crushed * 1.03),
			"grades": [{"grade": "A", "bags": bags - 10}, {"grade": "B", "bags": 10}]})
		d.save()
		return d, crushed, bags

	def _produce(self, day, d):
		lab.prepare_dmr(d.name)
		d.reload()
		d.submit()
		p.close_day(day, force=True)
		se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "purpose": "Material Receipt", "company": self.s.company,
			"posting_date": add_days(day, -2), "set_posting_time": 1, "posting_time": "08:00:00", "remarks": "Test packing bags",
			"items": [{"item_code": self.s.packing_item, "qty": 1000, "t_warehouse": self.s.packing_warehouse, "basic_rate": 45, "uom": "Nos",
				"conversion_factor": 1}]})
		se.insert()
		se.submit()
		pe = frappe.get_doc({"doctype": "Daily Production Entry", "crushing_day": day})
		pe.insert()
		pe.submit()
		pe.reload()
		return pe

	def test_dmr_grades_production_and_costing(self):
		day, cprs = self._day()
		received = sum(frappe.db.get_value("Cane Purchase Receipt", c, "payable_kg") for c in cprs)
		# a By-product Rate overrides the season's NRV: molasses 40,000 / t less 5,000 selling cost = 35 / kg
		frappe.get_doc({"doctype": "By-product Rate", "season": self.season, "item": self.s.molasses_item, "valid_from": day, "rate_per_ton": 40000,
			"selling_cost_per_ton": 5000, "is_active": 1, "remarks": TAG}).insert()
		d, crushed, bags = self._dmr(day)
		# DMR: bags = the grades; bagasse to the yard; per-shift cane adds up to the day's; mixed juice purity and extraction
		self.assertEqual(d.sugar_bags, bags)
		self.assertEqual(d.bagasse_to_yard_kg, int(crushed * 0.3) - int(crushed * 0.27))
		self.assertEqual(sum(r.cane_received_kg for r in d.shifts), received)
		self.assertEqual(len(d.shifts), frappe.db.count("Crushing Shift", {"is_active": 1}))
		self.assertEqual(d.mixed_juice_purity, 85.0)
		self.assertAlmostEqual(d.mill_extraction_pct, round(100 * int(crushed * 1.03) * 12.75 / (crushed * 12.5), 2), places=2)
		with self.assertRaises(frappe.ValidationError):  # more burnt than produced
			d.bagasse_burnt_kg = d.bagasse_kg + 1
			d.save()
		d.reload()

		pe = self._produce(day, d)
		self.assertEqual(pe.status, "Posted")
		self.assertEqual([(g.grade, g.bags) for g in pe.grades], [("A", bags - 10), ("B", 10)])
		self.assertEqual(sum(g.cane_kg for g in pe.grades), crushed)
		a, b = (frappe.get_doc("Stock Entry", g.stock_entry) for g in pe.grades)
		by = [i for i in a.items if i.item_code == self.s.molasses_item and i.t_warehouse]
		self.assertEqual(flt(by[0].basic_rate), 35)  # the By-product Rate
		self.assertFalse([i for i in b.items if i.item_code == self.s.molasses_item])  # by-products on the largest grade only
		self.assertTrue([i for i in b.items if i.item_code == frappe.db.get_value("Sugar Grade", "B", "item") and i.t_warehouse])
		issue = frappe.get_doc("Stock Entry", pe.bagasse_issue)
		self.assertEqual((issue.items[0].qty, issue.items[0].expense_account, issue.items[0].cost_center),
			(int(crushed * 0.27), self.s.power_steam_account, self.s.boiler_house_cost_center))
		self.assertGreater(flt(pe.provisional_cost_per_bag), flt(pe.cost_per_bag))  # + the mill's cane costs and budgeted processing
		self.assertAlmostEqual(flt(pe.provisional_processing), crushed / 1000 * 3000, delta=0.01)

		# processing costs: salaries at the Mill House, the workshop's repairs (allocated to production by its rule)
		bank = f"Cane Payments Bank - {self.abbr}"
		for acc, cc, amt in ((f"Salaries and Wages - {self.abbr}", f"Mill House - {self.abbr}", 50000),
				(f"Office Maintenance Expenses - {self.abbr}", f"Workshop - {self.abbr}", 20000)):
			je = frappe.get_doc({"doctype": "Journal Entry", "company": self.s.company, "posting_date": day, "user_remark": TAG,
				"accounts": [{"account": acc, "debit_in_account_currency": amt, "cost_center": cc}, {"account": bank, "credit_in_account_currency": amt, "cost_center": cc}]})
			je.insert()
			je.submit()
		run = frappe.get_doc({"doctype": "Costing Run", "company": self.s.company, "season": self.season, "run_type": "Monthly", "from_date": day,
			"to_date": day, "capitalise": 1})
		run.insert()
		self.assertEqual(run.sugar_bags, bags)
		self.assertAlmostEqual(run.cane_price, flt(pe.cane_cost), delta=0.01)
		els = {}
		for r in run.details:
			els[r.element] = els.get(r.element, 0) + flt(r.amount)
		self.assertAlmostEqual(els.get("Salaries and wages", 0), 50000, delta=0.01)
		self.assertAlmostEqual(els.get("Repair and maintenance", 0), 20000, delta=0.01)
		self.assertFalse([r for r in run.details if r.cost_center == f"Workshop - {self.abbr}"])  # all allocated away
		self.assertTrue([r for r in run.details if r.allocated_from == f"Workshop - {self.abbr}"])
		credit = flt(pe.by_product_value)
		self.assertAlmostEqual(run.by_product_credit, credit, delta=0.05)
		net = run.cane_cost + run.processing_cost + run.packing_cost + run.off_season_spread - run.by_product_credit
		self.assertAlmostEqual(run.net_cost, net, delta=0.05)
		self.assertAlmostEqual(run.cost_per_bag, run.net_cost / (bags * 50) * 50, delta=0.01)
		run.submit()
		run.reload()
		self.assertEqual(run.status, "Posted")
		self.assertTrue(run.stock_reconciliation)
		sr = frappe.get_doc("Stock Reconciliation", run.stock_reconciliation)
		self.assertEqual(sr.expense_account, self.s.cost_absorbed_account)
		self.assertTrue(all(flt(i.valuation_rate) == flt(run.cost_per_bag) for i in sr.items))
		self.assertTrue(all(i.qty == stock_qty(i.item_code, self.s.sugar_warehouse, day) for i in sr.items))
		run.cancel()
		self.assertEqual(frappe.db.get_value("Stock Reconciliation", sr.name, "docstatus"), 2)
