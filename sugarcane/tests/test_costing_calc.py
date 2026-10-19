"""Costing arithmetic (pure): the functional design's worked example, NRV, allocation, off-season spread, element
classification, mill extraction."""

import unittest

from sugarcane.calc import costing as c


def worked_example():
	m = 1_000_000
	return c.Statement(
		cane_price=1000 * m, cane_other=25 * m,
		elements={"Chemicals": 40 * m, "Stores and spares": 60 * m, "Salaries and wages": 120 * m, "Power and fuel": 20 * m,
			"Depreciation": 90 * m, "Factory overheads": 50 * m},
		packing=200_000 * 120,
		by_products=[c.ByProduct("Molasses", 4500, 40_000, 5 * m), c.ByProduct("Bagasse (surplus)", 3000, 8_000),
			c.ByProduct("Press mud", 3500, 500)],
		sugar_kg=10_000_000, cane_tons=100_000)


class TestCosting(unittest.TestCase):
	def test_worked_example(self):
		s = worked_example()
		m = 1_000_000
		self.assertEqual(s.cane_cost, 1025 * m)
		self.assertEqual(s.processing, 404 * m)
		self.assertEqual(s.joint, 1429 * m)
		self.assertEqual([b.credit for b in s.by_products], [175 * m, 24 * m, 1.75 * m])
		self.assertEqual(s.credit, 200.75 * m)
		self.assertEqual(s.net, 1228.25 * m)
		self.assertEqual(round(s.per_kg, 2), 122.83)
		self.assertEqual(round(s.per_bag), 6141)
		self.assertEqual(int(s.per_ton_cane + 0.5), 12283)  # 12,282.5, rounded half up as in the design
		self.assertEqual(round(s.cane_share_pct, 1), 71.7)
		self.assertEqual(s.recovery_pct, 10.0)
		# each extra 0.1 % of recovery: 100 t more sugar, about Rs 1.2 less per kg
		s.sugar_kg += 100_000
		self.assertAlmostEqual(122.83 - s.per_kg, 1.2, delta=0.05)

	def test_nrv(self):
		self.assertEqual(c.nrv_per_kg(40_000, 1_111.11), 38.88889)
		self.assertEqual(c.nrv_per_kg(500), 0.5)
		self.assertEqual(c.nrv_per_kg(100, 300), 0.0)

	def test_allocation(self):
		amounts = {"Workshop": 1000.0, "Admin": 300.0, "Mill House": 500.0, "Boiler House": 200.0}
		rules = [{"service": "Workshop", "basis": "Fixed %", "targets": [{"cost_center": "Mill House", "pct": 60}, {"cost_center": "Boiler House", "pct": 40}]},
			{"service": "Admin", "basis": "Equal", "targets": [{"cost_center": "Mill House"}, {"cost_center": "Boiler House"}, {"cost_center": "Power House"}]}]
		out, moves = c.allocate(amounts, rules)
		self.assertEqual(out, {"Mill House": 1200.0, "Boiler House": 700.0, "Power House": 100.0})
		self.assertEqual(round(sum(out.values()), 2), 2000.0)  # nothing lost or made
		self.assertEqual(len(moves), 5)
		hours, _m = c.allocate({"Stores": 90.0}, [{"service": "Stores", "basis": "Hours", "targets": [{"cost_center": "A", "hours": 2}, {"cost_center": "B", "hours": 1}]}])
		self.assertEqual(hours, {"A": 60.0, "B": 30.0})

	def test_off_season_spread(self):
		self.assertEqual(c.off_season_share(1_000_000, 25_000, 100_000), 250_000)
		self.assertEqual(c.off_season_share(1_000_000, 25_000, 100_000, spread_so_far=900_000), 100_000)  # never more than is left
		self.assertEqual(c.off_season_share(1_000_000, 0, 100_000, spread_so_far=700_000, season_close=True), 300_000)

	def test_classify(self):
		self.assertEqual(c.classify("Salaries and Wages - MSML"), "Salaries and wages")
		self.assertEqual(c.classify("EOBI - Employer - MSML"), "Salaries and wages")
		self.assertEqual(c.classify("Utility Expenses - MSML"), "Power and fuel")
		self.assertEqual(c.classify("Depreciation - MSML", "Depreciation Entry"), "Depreciation")
		self.assertEqual(c.classify("Cost of Goods Sold - MSML", "Stock Entry", "Process Chemicals"), "Chemicals")
		self.assertEqual(c.classify("Cost of Goods Sold - MSML", "Stock Entry", "Fuel and Lubricants"), "Power and fuel")
		self.assertEqual(c.classify("Cost of Goods Sold - MSML", "Stock Entry", "Mechanical"), "Stores and spares")
		self.assertEqual(c.classify("Office Maintenance Expenses - MSML"), "Repair and maintenance")
		self.assertEqual(c.classify("Insurance - MSML"), "Factory overheads")

	def test_mill_extraction(self):
		# 100 t cane at 13 % pol; 105 t mixed juice at 11.5 % pol → 92.88 %
		self.assertEqual(c.mill_extraction(105_000, 11.5, 100_000, 13), 92.88)
		self.assertIsNone(c.mill_extraction(0, 11.5, 100_000, 13))

	def test_structure_and_price(self):
		details = [{"element": "Chemicals", "cost_center": "Process", "amount": 40}, {"element": "Salaries and wages", "cost_center": "Mill", "amount": 100},
			{"element": "Salaries and wages", "cost_center": "Mill", "allocated_from": "Admin", "amount": 20},
			{"element": "Depreciation", "cost_center": "Mill", "amount": 90}, {"element": "Power and fuel", "cost_center": "Power", "amount": 20}]
		s = c.structure(1025, 24, details, off_season=5, production_ccs={"Mill", "Process", "Power"})
		self.assertEqual((s["direct_material"], s["direct_labour"], s["prime_cost"]), (1089, 100, 1189))
		self.assertEqual(s["factory_overhead"], 20 + 90 + 20 + 5)
		self.assertEqual(s["foh_lines"]["Service departments (allocated)"], 20)
		self.assertEqual(s["cost_of_production"], 1189 + 135)
		# the worked example's Rs 6,141.25 bag: 10 % margin → 6,755.38 before GST; GST 18 % → 7,971.35
		pb = c.price_build(6141.25, 10, 18)
		self.assertEqual((pb["profit"], pb["price_before_gst"], pb["gst"], pb["price_after_gst"]), (614.13, 6755.38, 1215.97, 7971.35))
		self.assertEqual(pb["cost_after_gst"], 7246.68)
