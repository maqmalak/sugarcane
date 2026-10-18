"""Phase 3: gate token (rates, ELP rule, duplicates), weighbridge (readings, limits, typed-in weights), CPR (formula, balanced
Journal Entry), TPT bilty (pay / reverse), day close (Purchase Invoice + reconciliation → clearing back to 0), cancellations."""

import json

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, flt, get_datetime

from sugarcane.cane_procurement import procurement as p
from sugarcane.tests.test_elp import LP, MILL, VIEWS, _lp, jpeg
from sugarcane.tests.test_indenting import END, NORTH, START, _range, _rule, _setup_season
from sugarcane.tests.test_masters import _make_hierarchy
from sugarcane.tests.test_survey import LAT, LNG, _survey, square

VT = "Test Trolley PT"
TERMINAL = "Test WB PT"
GATE = "Test Mill Gate PT"


def _fixtures(season):
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if not frappe.db.exists("Fiscal Year", "2040-2041"):
		frappe.get_doc({"doctype": "Fiscal Year", "year": "2040-2041", "year_start_date": "2040-07-01", "year_end_date": "2041-06-30",
			"companies": [{"company": company}]}).insert()
	frappe.db.set_value("Crushing Season", season, {"govt_rate": 425, "road_cess_pct": 1, "grower_cess_share_pct": 50, "tpt_rate": 30,
		"subsidy_rate": 10, "additional_subsidy_rate": 5, "binding_kg_per_quintal": 0.265, "garbage_pct": 0})
	if not frappe.db.exists("Vehicle Type", VT):
		frappe.get_doc({"doctype": "Vehicle Type", "vehicle_type_name": VT, "is_active": 1, "min_gross_kg": 4000, "max_gross_kg": 22000,
			"min_tare_kg": 2200, "max_tare_kg": 5500}).insert()
	_lp()
	src = frappe.get_doc("Cane Source", "Test Check Post North")
	if not any(r.vehicle_type == VT for r in src.tpt_rates):
		src.append("tpt_rates", {"vehicle_type": VT, "tpt_rate": 40})
		src.save()
	if not frappe.db.exists("Cane Source", {"source_type": "Factory Gate", "is_active": 1}):
		frappe.get_doc({"doctype": "Cane Source", "source_name": GATE, "source_type": "Factory Gate", "is_active": 1}).insert()
	if not frappe.db.exists("Weighbridge Terminal", TERMINAL):
		frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": TERMINAL, "weighbridge_no": "9", "allowed_operations": "All",
			"ip_address": "10.9.9.9", "indicator_protocol": "Simulator", "is_active": 1}).insert()


def _cleanup(season):
	"""Cancel (so every ledger is reversed) and remove the test season's procurement records left by earlier tests."""
	frappe.set_user("Administrator")
	for b in frappe.get_all("TPT Bilty", filters={"season": season, "status": "Paid"}, pluck="name"):
		p.reverse_bilty_payment(b, "test cleanup")
	for dt, f in (("Daily Cane Purchase", {"season": season}), ("Cane Purchase Receipt", {"season": season}), ("Cane Token", {"season": season})):
		for name in frappe.get_all(dt, filters={**f, "docstatus": 1}, pluck="name"):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.cancel()
	for dt in ("Daily Cane Purchase", "TPT Bilty", "Cane Purchase Receipt", "Cane Weighment", "Cane Token"):
		for name in frappe.get_all(dt, filters={"season": season}, pluck="name"):
			frappe.db.delete(dt, {"name": name})
			if dt == "Daily Cane Purchase":
				frappe.db.delete("Daily Cane Purchase Item", {"parent": name})


def _reading(kg, at=None, stable=1):
	p._cache_reading(TERMINAL, {"weight_kg": kg, "stable": stable, "raw": "", "source": "Simulator", "at": str(at or frappe.utils.now_datetime())})


class TestProcurement(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()

	def setUp(self):
		from sugarcane.cane_indenting import api, generator
		from sugarcane.setup.install import ensure_elp_defaults

		ensure_elp_defaults()
		frappe.db.set_single_value("Sugar Settings", {"mill_latitude": MILL[0], "mill_longitude": MILL[1], "tpt_requires_elp": 1})
		frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
		self.season = _setup_season()
		_fixtures(self.season)
		_cleanup(self.season)
		for dt in ("LP Vehicle Registration", "Cane Indent", "Indent Batch", "Indent Quota Rule", "Indent Range"):
			for name in frappe.get_all(dt, filters={"season": self.season}, pluck="name"):
				frappe.db.delete(dt, {"name": name})
		_range(self.season)
		_rule(self.season)
		n = sorted(m for m in dir(self) if m.startswith("test_")).index(self._testMethodName)
		s = _survey(f"91401-00000{n:02d}-1", square(LAT + 0.62 + n * 0.01, LNG, 100))
		out = generator.generate(self.season, START, END, NORTH, today=START)
		api.authorize_batch(next(b["name"] for b in out["batches"] if b["circle"] == NORTH))
		self.indents = frappe.get_all("Cane Indent", filters={"season": self.season, "grower": s.grower, "docstatus": 1},
			fields=["name", "indent_date", "valid_from", "source"], order_by="indent_date asc")
		self.assertGreaterEqual(len(self.indents), 2)
		self.vno = f"PT-{n:02d}{frappe.generate_hash(length=3).upper()}"

	def _at(self, indent, hour=9, minutes=0):
		return add_to_date(get_datetime(f"{indent.valid_from} {hour:02d}:00:00"), minutes=minutes)

	def _token(self, indent, **kw):
		return p.issue_token(indent=indent.name, vehicle_no=kw.pop("vehicle_no", self.vno), vehicle_type=VT, driver_name="Test Driver",
			driver_cnic="91401-1111111-1", issued_at=kw.pop("at", self._at(indent)), **kw)

	def _weigh(self, tok, gross=15000, tare=4000, at=None):
		at = get_datetime(at or tok.issued_at)
		_reading(gross, at)
		p.capture(tok.name, "Gross", terminal=TERMINAL, at=add_to_date(at, minutes=10))
		_reading(tare, at)
		return p.capture(tok.name, "Tare", terminal=TERMINAL, at=add_to_date(at, minutes=90))

	def _elp_accepted(self, indent):
		from sugarcane.vehicle_tracking import elp

		lp = frappe.get_doc("Loading Point", LP)
		name, _s = elp.register({"uuid": frappe.generate_hash(length=16), "point_type": "Loading Point", "loading_point": LP,
			"indent": indent.name, "vehicle_no": self.vno, "vehicle_type": VT, "latitude": lp.latitude + 0.0002, "longitude": lp.longitude,
			"registered_at": f"{indent.indent_date} 07:30:00", "serial_no": "S1",
			"photos": [{"view": v, "data": jpeg(), "latitude": lp.latitude, "longitude": lp.longitude} for v in VIEWS]})
		elp.arrive(name, [{"view": v, "data": jpeg()} for v in VIEWS[:3]], MILL[0] + 0.0005, MILL[1], arrived_at=f"{indent.indent_date} 09:00:00")
		return name

	# ------------------------------------------------------------ rates and the ELP rule
	def test_rates_and_elp_rule(self):
		from sugarcane.vehicle_tracking import elp

		i0, i1 = self.indents[0], self.indents[1]
		# not verified by ELP → mill-gate rates: the gate source has no row for this type, so the season TPT (30) applies
		gate = self._token(i0)
		self.assertEqual(gate.entry_type, "Gate")
		self.assertEqual(gate.source, p.gate_source())
		self.assertEqual((flt(gate.govt_rate), flt(gate.tpt_rate), flt(gate.binding_kg_per_quintal)), (425, 30, 0.265))
		self.assertEqual(json.loads(gate.rate_levels)["tpt_rate"], "season")
		self.assertEqual(frappe.db.get_value("Cane Indent", i0.name, ["status", "token"]), ("Used", gate.name))
		self._weigh(gate)

		# registered at the LP and arrived, but the audit team has not decided → refused, unless taken at gate rates with a reason
		reg = self._elp_accepted(i1)
		with self.assertRaises(frappe.ValidationError):
			p.issue_token(elp_registration=reg, issued_at=f"{i1.indent_date} 09:20:00")
		elp.decide(reg, True)
		tok = p.issue_token(elp_registration=reg, issued_at=f"{i1.indent_date} 09:20:00")
		self.assertEqual((tok.entry_type, tok.source, flt(tok.tpt_rate)), ("ELP Verified", "Test Check Post North", 40))
		self.assertEqual(frappe.db.get_value("LP Vehicle Registration", reg, "token"), tok.name)
		with self.assertRaises(frappe.ValidationError):  # the same load twice
			p.issue_token(elp_registration=reg, issued_at=f"{i1.indent_date} 09:25:00")

	def test_gate_checks(self):
		i0, i1 = self.indents[0], self.indents[1]
		with self.assertRaises(frappe.ValidationError):  # outside the indent's validity
			self._token(i0, at="2040-12-25 09:00:00")
		tok = self._token(i0)
		with self.assertRaises(frappe.ValidationError):  # the indent again
			self._token(i0, vehicle_no="PT-OTHER")
		with self.assertRaises(frappe.ValidationError):  # the vehicle is still inside (spaces / case don't matter)
			self._token(i1, vehicle_no=self.vno.lower().replace("-", " "))
		p.cancel_token(tok.name, "Wrong vehicle")
		self.assertEqual(frappe.db.get_value("Cane Indent", i0.name, "status"), "Printed")
		self.assertIsNone(frappe.db.get_value("Cane Indent", i0.name, "token"))
		self._token(i0)  # the indent can be used again

	# ------------------------------------------------------------ weighbridge
	def test_weighbridge_rules(self):
		tok = self._token(self.indents[0])
		at = add_to_date(tok.issued_at, minutes=10)
		_reading(15000, stable=0)
		with self.assertRaises(frappe.ValidationError):  # moving
			p.capture(tok.name, "Gross", terminal=TERMINAL)
		_reading(15000, at=add_to_date(frappe.utils.now_datetime(), minutes=-5))
		with self.assertRaises(frappe.ValidationError):  # stale reading
			p.capture(tok.name, "Gross", terminal=TERMINAL)
		_reading(30000)
		with self.assertRaises(frappe.ValidationError):  # over the vehicle type's limit
			p.capture(tok.name, "Gross", terminal=TERMINAL, at=at)
		with self.assertRaises(frappe.ValidationError):  # tare before gross
			p.capture(tok.name, "Tare", terminal=TERMINAL, at=at)
		_reading(15000)
		out = p.capture(tok.name, "Gross", terminal=TERMINAL, at=at)
		self.assertEqual(frappe.db.get_value("Cane Token", tok.name, "status"), "Gross")
		log = frappe.get_doc("Weighment Reading Log", frappe.db.get_value("Cane Weighment", out["weighment"], "gross_reading"))
		self.assertEqual((log.weight_kg, log.used_for, log.weighment), (15000, "Gross", out["weighment"]))
		with self.assertRaises(frappe.ValidationError):  # the reading log is insert-only
			log.remarks = "changed"
			log.save()
		_reading(16000)
		with self.assertRaises(frappe.ValidationError):  # tare not less than gross
			p.capture(tok.name, "Tare", terminal=TERMINAL, at=add_to_date(at, minutes=60))

		clerk = "test.weigh@micromaxsugar.example"
		if not frappe.db.exists("User", clerk):
			u = frappe.get_doc({"doctype": "User", "email": clerk, "first_name": "Test Weigh", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		frappe.get_doc("User", clerk).add_roles("Tare Weighman")
		frappe.set_user(clerk)
		try:
			with self.assertRaises(frappe.PermissionError):  # only a Cane Admin types a weight
				p.capture(tok.name, "Tare", manual_kg=4000, note="indicator offline", terminal=TERMINAL, at=add_to_date(at, minutes=60))
		finally:
			frappe.set_user("Administrator")
		with self.assertRaises(frappe.ValidationError):  # typed in without a reason
			p.capture(tok.name, "Tare", manual_kg=4000, terminal=TERMINAL, at=add_to_date(at, minutes=60))
		out = p.capture(tok.name, "Tare", manual_kg=4000, note="indicator offline", terminal=TERMINAL, at=add_to_date(at, minutes=60))
		w = frappe.get_doc("Cane Weighment", out["weighment"])
		self.assertEqual((w.net_kg, w.manual_entry, w.yard_minutes, w.status), (11000, 1, 60, "Completed"))
		self.assertTrue(out["cpr"])

	# ------------------------------------------------------------ CPR, journal, bilty
	def test_cpr_journal_and_bilty(self):
		from sugarcane.calc.cpr import CPRInput, compute

		tok = self._token(self.indents[0])
		out = self._weigh(tok, 18450, 4250)
		cpr = frappe.get_doc("Cane Purchase Receipt", out["cpr"])
		# the worked example in ARCHITECTURE.md §4.1 (TPT 30 here)
		r = compute(CPRInput(gross_kg=18450, tare_kg=4250, govt_rate=425, road_cess_pct=1, subsidy_rate=10, additional_subsidy_rate=5,
			tpt_rate=30, binding_kg_per_quintal=0.265))
		self.assertEqual((cpr.net_kg, cpr.binding_kg, cpr.payable_kg), (14200, 38, 14162))
		self.assertEqual(flt(cpr.govt_value), 150471.25)
		self.assertEqual(flt(cpr.payable_cpr), flt(r.payable_cpr))
		self.assertEqual(str(cpr.posting_date), self.indents[0].valid_from.isoformat())
		je = frappe.get_doc("Journal Entry", cpr.journal_entry)
		self.assertEqual(je.docstatus, 1)
		self.assertAlmostEqual(sum(a.debit for a in je.accounts), sum(a.credit for a in je.accounts), places=2)
		s = frappe.get_single("Sugar Settings")
		rows = {a.account: a for a in je.accounts}
		self.assertEqual((rows[s.grower_payable_account].party_type, rows[s.grower_payable_account].party), ("Grower", cpr.grower))
		self.assertEqual(flt(rows[s.grower_payable_account].credit), flt(cpr.payable_cpr))
		self.assertEqual(rows[s.cane_purchase_clearing_account].party, s.daily_purchase_supplier)
		self.assertEqual(flt(rows[s.tpt_payable_account].credit), flt(cpr.tpt_amount))
		self.assertEqual(frappe.db.get_value("Cane Token", tok.name, ["status", "cpr"]), ("Completed", cpr.name))

		b = frappe.get_doc("TPT Bilty", cpr.bilty)
		self.assertEqual((b.status, flt(b.amount), b.vehicle_no), ("Unpaid", flt(cpr.tpt_amount), self.vno))
		p.pay_bilty(b.name, "Test Driver", "91401-1111111-1", paid_at=add_to_date(cpr.posted_at, hours=1))
		b.reload()
		pay = frappe.get_doc("Journal Entry", b.payment_journal_entry)
		self.assertEqual({a.account: (flt(a.debit), flt(a.credit)) for a in pay.accounts},
			{s.tpt_payable_account: (flt(b.amount), 0), s.cash_counter_account: (0, flt(b.amount))})
		with self.assertRaises(frappe.ValidationError):  # paid twice
			p.pay_bilty(b.name)
		cpr.reload()
		with self.assertRaises(frappe.ValidationError):  # bilty paid → CPR can't be cancelled
			cpr.cancel()
		p.reverse_bilty_payment(b.name, "test")
		self.assertEqual(frappe.db.get_value("Journal Entry", pay.name, "docstatus"), 2)
		cpr.reload()
		cpr.cancel()
		self.assertEqual(frappe.db.get_value("Journal Entry", cpr.journal_entry, "docstatus"), 2)
		self.assertEqual(frappe.db.get_value("TPT Bilty", b.name, "status"), "Cancelled")

	# ------------------------------------------------------------ day close
	def test_day_close_reconciles(self):
		day = self.indents[1].valid_from  # both indents are valid that day (3-day validity)
		before = p.clearing_balance(on=day)
		cprs = []
		for k, (i, vno) in enumerate(((self.indents[0], self.vno), (self.indents[1], self.vno + "B"))):
			tok = self._token(i, vehicle_no=vno, at=self._at(self.indents[1], 10 + k))
			cprs.append(self._weigh(tok, 15000 + k * 777, 4000 + k * 13)["cpr"])
		self.assertNotAlmostEqual(p.clearing_balance(on=day), before, places=2)
		dcp = p.close_day(day, force=True)
		self.assertEqual(dcp.cpr_count, len(frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": day})))
		total = sum(flt(frappe.db.get_value("Cane Purchase Receipt", c, "govt_value")) for c in cprs)
		self.assertGreaterEqual(flt(dcp.total_govt_value), total - 0.001)
		pi = frappe.get_doc("Purchase Invoice", dcp.purchase_invoice)
		self.assertEqual((pi.docstatus, pi.update_stock, flt(pi.grand_total)), (1, 1, flt(dcp.total_govt_value)))
		self.assertEqual(flt(pi.outstanding_amount), 0)
		self.assertTrue(dcp.reconciled)
		self.assertAlmostEqual(p.clearing_balance(on=day), before, places=2)  # the day adds nothing left open
		for c in cprs:
			self.assertEqual(frappe.db.get_value("Cane Purchase Receipt", c, "daily_purchase"), dcp.name)
		with self.assertRaises(frappe.ValidationError):  # the day is closed
			frappe.get_doc("Cane Purchase Receipt", cprs[0]).cancel()
		with self.assertRaises(frappe.ValidationError):
			p.close_day(day, force=True)
		checks = {c["key"]: c for c in __import__("sugarcane.api.v1.procurement", fromlist=["x"]).day_checks(str(day))["checks"]}
		self.assertTrue(all(c["ok"] for c in checks.values()), checks)

		dcp.reload()
		dcp.cancel()
		self.assertEqual(frappe.db.get_value("Purchase Invoice", pi.name, "docstatus"), 2)
		self.assertIsNone(frappe.db.get_value("Cane Purchase Receipt", cprs[0], "daily_purchase"))

	def test_slips_and_api(self):
		from sugarcane.api.v1 import procurement as api
		from sugarcane.cane_procurement.printing import render

		tok = self._token(self.indents[0])
		self.assertTrue(render("token", [tok.name]).startswith(b"%PDF"))
		out = self._weigh(tok)
		cpr = frappe.get_doc("Cane Purchase Receipt", out["cpr"])
		self.assertTrue(render("cpr", [cpr.name]).startswith(b"%PDF"))
		self.assertTrue(render("bilty", [cpr.bilty]).startswith(b"%PDF"))
		self.assertEqual(frappe.db.get_value("Cane Token", tok.name, "print_count"), 1)
		found = api.find(self.indents[1].name)
		self.assertEqual(found[0]["indent"], self.indents[1].name)
		self.assertTrue(any("is valid" in b for b in found[0]["blocks"]))  # looked up today, outside the indent's days
		self.assertTrue(any(r.name == cpr.bilty for r in api.bilties(q=self.vno, status="Unpaid")["rows"]))
		ins = api.insights(day=str(cpr.posting_date))
		self.assertGreaterEqual(ins["kpi"]["cprs"], 1)
