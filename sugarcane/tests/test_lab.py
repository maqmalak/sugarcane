"""Phase 5: lab samples (purity, limits, one per hour), vehicle samples (CCS, recovery, variety from the indent), stoppages
(no overlap, split at 07:00), the DMR (cane received / crushed, recovery, losses, prepare → approve) and the production entry
(only after the cane day is closed; Work Order + Manufacture with the actual cane, sugar and by-products at NRV)."""

import frappe
from frappe.utils import add_days, add_to_date, flt, get_datetime

from sugarcane.cane_laboratory import lab
from sugarcane.cane_procurement import procurement as p
from sugarcane.tests.test_procurement import ProcurementBase
from sugarcane.stock import stock_qty


def _lab_cleanup(season):
	frappe.set_user("Administrator")
	for dt in ("Daily Production Entry", "Daily Manufacturing Report"):
		for name in frappe.get_all(dt, filters={"season": season, "docstatus": 1}, pluck="name", order_by="crushing_day desc"):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.cancel()
		for name in frappe.get_all(dt, filters={"season": season}, pluck="name"):
			frappe.db.delete(dt, {"name": name})
	start, end = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date"])
	for dt in ("Lab Sample", "Vehicle Recovery Sample", "Mill Stoppage"):
		frappe.db.delete(dt, {"crushing_day": ["between", [start, end]]})
	for name in frappe.get_all("Stock Entry", filters={"remarks": "Test packing bags", "docstatus": 1}, pluck="name"):
		se = frappe.get_doc("Stock Entry", name)
		se.cancel()


class TestLab(ProcurementBase):
	CNIC = "91601"
	LAT_OFFSET = 0.82

	def setUp(self):
		from sugarcane.setup.lab_setup import ensure
		from sugarcane.tests.test_indenting import _setup_season

		ensure()
		season = _setup_season()
		_lab_cleanup(season)
		super().setUp()
		frappe.db.set_value("Crushing Season", self.season, {"standard_recovery_pct": 10, "bag_weight_kg": 50, "molasses_nrv_per_kg": 30,
			"bagasse_nrv_per_kg": 8, "press_mud_nrv_per_kg": 2, "expected_molasses_pct": 4.5, "expected_bagasse_pct": 30, "expected_mud_pct": 3.5})

	def _cprs(self):
		"""Two loads on one day (both indents valid), weighed and posted; returns (day, [cpr names])."""
		day = self.indents[1].valid_from
		out = []
		for k, (i, vno) in enumerate(((self.indents[0], self.vno), (self.indents[1], self.vno + "B"))):
			tok = self._token(i, vehicle_no=vno, at=self._at(self.indents[1], 9 + k))
			out.append(self._weigh(tok, 15000 + k * 1000, 4000)["cpr"])
		return day, out

	def test_samples(self):
		day = self.indents[0].valid_from
		at = f"{day} 10:15:00"
		r = lab.record_samples([{"sample_type": "Mixed Juice", "sample_time": at, "brix": 15.0, "pol": 12.75, "ph": 5.4},
			{"sample_type": "Mixed Juice", "sample_time": f"{day} 10:40:00", "brix": 15.1, "pol": 12.8},  # same hour
			{"sample_type": "Bagasse", "sample_time": at, "pol": 3.4, "moisture_pct": 49},  # pol above 2.6
			{"sample_type": "Primary Juice", "sample_time": at, "brix": 18, "pol": 19}])  # pol > brix
		self.assertEqual(len(r["saved"]), 2)
		self.assertEqual({e["row"] for e in r["errors"]}, {1, 3})
		mj = frappe.get_doc("Lab Sample", r["saved"][0]["name"])
		self.assertEqual((mj.purity, mj.hour, mj.out_of_range, str(mj.crushing_day)), (85.0, "10:00", 0, str(day)))
		self.assertEqual(mj.shift, lab.shift_for(at))
		bg = frappe.get_doc("Lab Sample", r["saved"][1]["name"])
		self.assertTrue(bg.out_of_range)
		self.assertIn("pol", bg.problems)
		self.assertEqual(lab.analyses(day)[0]["sample_type"] in ("Mixed Juice", "Bagasse"), True)

	def test_vehicle_sample_and_stoppages(self):
		day, cprs = self._cprs()
		v = frappe.get_doc({"doctype": "Vehicle Recovery Sample", "cpr": cprs[0], "brix": 20.0, "pol": 17.5, "fibre_pct": 14})
		v.insert()
		v.submit()
		self.assertEqual((v.ccs_pct, v.est_recovery_pct, str(v.crushing_day)), (12.96, round(12.96 * 0.95, 2), str(day)))
		self.assertEqual(v.variety, frappe.db.get_value("Cane Indent", frappe.db.get_value("Cane Purchase Receipt", cprs[0], "indent"), "variety"))

		s1 = frappe.get_doc({"doctype": "Mill Stoppage", "start": f"{day} 12:00:00", "end": f"{day} 12:40:00", "category": "Mechanical",
			"reason": "test"}).insert()
		self.assertEqual(s1.minutes, 40)
		with self.assertRaises(frappe.ValidationError):  # overlaps
			frappe.get_doc({"doctype": "Mill Stoppage", "start": f"{day} 12:30:00", "end": f"{day} 13:00:00", "category": "Power", "reason": "x"}).insert()
		# across 07:00: 06:30 → 07:30 the next morning gives 30 min to each crushing day
		nxt = add_days(day, 1)
		frappe.get_doc({"doctype": "Mill Stoppage", "start": f"{nxt} 06:30:00", "end": f"{nxt} 07:30:00", "category": "Power", "reason": "grid"}).insert()
		self.assertEqual(lab.stoppage_minutes(day)[0], 70)
		self.assertEqual(lab.stoppage_minutes(nxt)[0], 30)

	def test_dmr_and_production(self):
		from sugarcane.sugar_production.production import post  # noqa: F401

		day, cprs = self._cprs()
		received = sum(frappe.db.get_value("Cane Purchase Receipt", c, "payable_kg") for c in cprs)
		lab.record_samples([{"sample_type": "Bagasse", "sample_time": f"{day} 10:00:00", "pol": 2.0, "moisture_pct": 49},
			{"sample_type": "Final Molasses", "sample_time": f"{day} 11:00:00", "brix": 88, "pol": 32}])
		d = frappe.get_doc({"doctype": "Daily Manufacturing Report", "crushing_day": day, "yard_closing_kg": 1000})
		d.insert()
		self.assertEqual((d.cane_received_kg, d.cane_crushed_kg), (received, received - 1000))
		with self.assertRaises(frappe.ValidationError):  # bags first
			lab.prepare_dmr(d.name)
		crushed = d.cane_crushed_kg
		d.update({"sugar_bags": int(crushed * 0.1 / 50), "molasses_kg": int(crushed * 0.045), "bagasse_kg": int(crushed * 0.3),
			"press_mud_kg": int(crushed * 0.035), "pol_pct_cane": 12.5})
		d.save()
		self.assertAlmostEqual(d.recovery_pct, d.sugar_bags * 50 * 100 / crushed, places=2)
		self.assertAlmostEqual(d.loss_bagasse, round(d.bagasse_pct_cane * 2.0 / 100, 3), places=3)
		self.assertIsNotNone(d.loss_undetermined)
		with self.assertRaises(frappe.ValidationError):  # approve needs a prepared report
			d.submit()
		lab.prepare_dmr(d.name)
		d.reload()
		d.submit()
		self.assertEqual(d.status, "Approved")

		pe = frappe.get_doc({"doctype": "Daily Production Entry", "crushing_day": day})
		pe.insert()
		with self.assertRaises(frappe.ValidationError):  # the cane day isn't closed: no cane in stock yet
			pe.submit()
		p.close_day(day, force=True)
		s = frappe.get_single("Sugar Settings")
		se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "purpose": "Material Receipt", "company": s.company,
			"posting_date": add_days(day, -2), "set_posting_time": 1, "posting_time": "08:00:00", "remarks": "Test packing bags",
			"items": [{"item_code": s.packing_item, "qty": 1000, "t_warehouse": s.packing_warehouse, "basic_rate": 45, "uom": "Nos", "conversion_factor": 1}]})
		se.insert()
		se.submit()
		yard_before = stock_qty(s.cane_item, s.cane_yard_warehouse, day)
		pe = frappe.get_doc("Daily Production Entry", pe.name)
		pe.save()
		pe.submit()
		pe.reload()
		self.assertEqual(pe.status, "Posted")
		entry = frappe.get_doc("Stock Entry", pe.stock_entry)
		rows = {(i.item_code, bool(i.s_warehouse)): i for i in entry.items}
		self.assertEqual(rows[(s.cane_item, True)].qty, crushed)  # actual cane, not the BOM standard
		self.assertEqual(rows[(s.sugar_item, False)].qty, d.sugar_bags)
		self.assertEqual(flt(rows[(s.molasses_item, False)].basic_rate), 30)
		self.assertAlmostEqual(stock_qty(s.cane_item, s.cane_yard_warehouse, day), yard_before - crushed, places=3)
		cost = flt(rows[(s.cane_item, True)].amount) + flt(rows[(s.packing_item, True)].amount) - flt(pe.by_product_value)
		self.assertAlmostEqual(flt(pe.sugar_value), cost, delta=1)
		self.assertAlmostEqual(flt(pe.cost_per_bag), cost / d.sugar_bags, delta=0.05)
		d.reload()
		with self.assertRaises(frappe.ValidationError):  # production posted from it
			d.cancel()
		pe.reload()
		pe.cancel()
		self.assertEqual(frappe.db.get_value("Stock Entry", pe.stock_entry, "docstatus"), 2)
		self.assertAlmostEqual(stock_qty(s.cane_item, s.cane_yard_warehouse, day), yard_before, places=3)
