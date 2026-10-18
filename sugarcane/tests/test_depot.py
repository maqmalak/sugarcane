"""Phase 4: buying at a depot (its rates, its weighbridge, its users), dispatch trucks (depot and mill weights, depot balance,
transit shortage against the allowance) and the day close postings (depot → transit → yard, shortage, freight, recovery,
commission), days closing and reopening in order."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, add_to_date, flt, get_datetime

from sugarcane.cane_procurement import procurement as p
from sugarcane.depot_purchase import depot as dp
from sugarcane.tests.test_procurement import TERMINAL, VT, ProcurementBase, _reading

DEPOT, DSRC, DTERM, CONTRACTOR = "Test Depot PT", "Test Depot Source PT", "Test DP PT", "Test Contractor PT"
TRUCK = "Test Truck PT"


def _rd(t, kg, at):
	p._cache_reading(t, {"weight_kg": kg, "stable": 1, "raw": "", "source": "Simulator", "at": str(at)})


def _depot_fixtures():
	if not frappe.db.exists("Supplier", CONTRACTOR):
		frappe.get_doc({"doctype": "Supplier", "supplier_name": CONTRACTOR,
			"supplier_group": frappe.db.get_single_value("Sugar Settings", "contractor_supplier_group")}).insert()
	if not frappe.db.exists("Cane Source", DSRC):
		frappe.get_doc({"doctype": "Cane Source", "source_name": DSRC, "source_type": "Depot", "is_active": 1,
			"tpt_rates": [{"vehicle_type": VT, "tpt_rate": 0}]}).insert()
	if not frappe.db.exists("Cane Depot", DEPOT):
		frappe.get_doc({"doctype": "Cane Depot", "depot_name": DEPOT, "source": DSRC, "is_active": 1, "contractor": CONTRACTOR}).insert()
	frappe.db.set_value("Cane Depot", DEPOT, {"depot_rate": 10, "freight_rate": 20, "allowed_shortage_pct": 1, "journey_to_mill_min": 60,
		"contractor": CONTRACTOR})
	if not frappe.db.exists("Weighbridge Terminal", DTERM):
		frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": DTERM, "weighbridge_no": "D9", "allowed_operations": "All",
			"ip_address": "10.9.9.8", "indicator_protocol": "Simulator", "is_active": 1, "depot": DEPOT}).insert()
	if not frappe.db.exists("Vehicle Type", TRUCK):
		frappe.get_doc({"doctype": "Vehicle Type", "vehicle_type_name": TRUCK, "is_active": 1, "min_gross_kg": 10000, "max_gross_kg": 42000,
			"min_tare_kg": 6000, "max_tare_kg": 13000}).insert()


def _user(email, role, depot=None):
	if not frappe.db.exists("User", email):
		u = frappe.get_doc({"doctype": "User", "email": email, "first_name": email.split("@")[0], "send_welcome_email": 0})
		u.flags.no_welcome_mail = True
		u.insert()
	frappe.get_doc("User", email).add_roles(role)
	if depot:
		d = frappe.get_doc("Cane Depot", depot)
		if not any(r.user == email for r in d.depot_users):
			d.append("depot_users", {"user": email, "depot_role": "Operator"})
			d.save()
	return email


class TestDepot(ProcurementBase):
	CNIC = "91501"
	LAT_OFFSET = 0.72

	def setUp(self):
		super().setUp()
		_depot_fixtures()

	def _buy(self, indent, vno, at, gross=15000, tare=4000):
		tok = p.issue_token(indent=indent.name, vehicle_no=vno, vehicle_type=VT, issued_at=at, purchase_depot=DEPOT)
		_rd(DTERM, gross, at)
		p.capture(tok.name, "Gross", terminal=DTERM, at=add_to_date(at, minutes=5))
		_rd(DTERM, tare, at)
		return tok, p.capture(tok.name, "Tare", terminal=DTERM, at=add_to_date(at, minutes=30))["cpr"]

	def _truck(self, vno, at, tare=9000, load=None, mill=True, received=None):
		d = dp.create_dispatch(DEPOT, vno, TRUCK, "Truck Driver", contractor=CONTRACTOR)
		_rd(DTERM, tare, at)
		dp.capture_dispatch(d.name, terminal=DTERM, at=at)
		_rd(DTERM, tare + load, at)
		dp.capture_dispatch(d.name, terminal=DTERM, at=add_to_date(at, minutes=20))
		if mill:
			arrive = add_to_date(at, minutes=90)
			_rd(TERMINAL, tare + received, arrive)
			dp.capture_dispatch(d.name, terminal=TERMINAL, at=arrive)
			_rd(TERMINAL, tare, arrive)
			dp.capture_dispatch(d.name, terminal=TERMINAL, at=add_to_date(arrive, minutes=40))
		return frappe.get_doc("Depot Dispatch", d.name)

	def test_depot_purchase_rules(self):
		i0, i1 = self.indents[0], self.indents[1]
		at = self._at(i0)
		tok = p.issue_token(indent=i0.name, vehicle_no=self.vno, vehicle_type=VT, issued_at=at, purchase_depot=DEPOT)
		self.assertEqual((tok.entry_type, tok.source, flt(tok.tpt_rate), tok.purchase_depot), ("Depot", DSRC, 0, DEPOT))
		_reading(15000, at)
		with self.assertRaises(frappe.ValidationError):  # a depot token is weighed on the depot's weighbridge
			p.capture(tok.name, "Gross", terminal=TERMINAL, at=at)
		_rd(DTERM, 15000, at)
		p.capture(tok.name, "Gross", terminal=DTERM, at=at)
		_rd(DTERM, 4000, at)
		cpr = p.capture(tok.name, "Tare", terminal=DTERM, at=add_to_date(at, minutes=30))["cpr"]
		self.assertEqual(frappe.db.get_value("Cane Purchase Receipt", cpr, ["warehouse", "purchase_depot"]),
			(frappe.db.get_value("Cane Depot", DEPOT, "warehouse"), DEPOT))
		self.assertTrue(frappe.db.get_value("Cane Depot", DEPOT, "warehouse"))

		other = _user("test.depot.other@micromaxsugar.example", "Depot User")
		mine = _user("test.depot.mine@micromaxsugar.example", "Depot User", DEPOT)
		for user, depot in ((other, DEPOT), (mine, None)):  # not this depot's user · a depot user at the mill gate
			frappe.set_user(user)
			try:
				with self.assertRaises(frappe.PermissionError):
					p.issue_token(indent=i1.name, vehicle_no=self.vno + "X", vehicle_type=VT, issued_at=self._at(i1), purchase_depot=depot)
			finally:
				frappe.set_user("Administrator")
		frappe.set_user(mine)
		try:
			t2 = p.issue_token(indent=i1.name, vehicle_no=self.vno + "X", vehicle_type=VT, issued_at=self._at(i1), purchase_depot=DEPOT)
			self.assertEqual(t2.issued_by, mine)
		finally:
			frappe.set_user("Administrator")

	def test_dispatch_and_day_close(self):
		i0, i1 = self.indents[0], self.indents[1]
		day = i1.valid_from  # both indents valid
		at = self._at(i1, 8)
		self._buy(i0, self.vno, at, 15000, 4000)          # 11,000 net
		self._buy(i1, self.vno + "B", add_to_date(at, hours=1), 16000, 4500)  # 11,500 net
		bal = dp.depot_balance(DEPOT, add_to_date(at, hours=3))
		self.assertEqual(bal["balance_kg"], 22500)
		t = add_to_date(at, hours=4)
		over = dp.create_dispatch(DEPOT, self.vno + "O", TRUCK)
		_rd(DTERM, 9000, t)
		dp.capture_dispatch(over.name, terminal=DTERM, at=t)
		_rd(DTERM, 39000, t)
		with self.assertRaises(frappe.ValidationError):  # the truck can't carry more than the depot holds
			dp.capture_dispatch(over.name, terminal=DTERM, at=t)
		_rd(DTERM, 9000, t)
		with self.assertRaises(frappe.ValidationError):  # nor be weighed on the mill's weighbridge at the depot step
			dp.capture_dispatch(over.name, terminal=TERMINAL, at=t)
		dp.cancel_dispatch(over.name, "test")
		self.assertEqual(frappe.db.get_value("Depot Dispatch", over.name, "status"), "Cancelled")
		# 22,500 kg sent, 22,000 received: 500 kg (2.22 %) short; allowance 1 % = 225 kg → 275 kg recovered
		truck = self._truck(self.vno + "T", t, load=22500, received=22000)
		self.assertEqual((truck.status, truck.dispatched_kg, truck.received_kg, truck.shortage_kg, truck.excess_shortage_kg),
			("Received", 22500, 22000, 500, 275))
		self.assertEqual(flt(truck.freight_amount), flt(22000 / 40 * 20, 2))
		self.assertEqual(str(truck.dispatch_day), str(day))

		dcp = p.close_day(day, force=True)
		kinds = [(r.kind, r.description.split(" ", 1)[1] if r.dispatch else r.description) for r in dcp.postings]
		self.assertEqual([k for k, _d in kinds].count("Stock Entry"), 4)  # gain at the depot (binding), out, in, shortage
		truck.reload()
		self.assertTrue(truck.posted_out and truck.posted_in and truck.in_entry and truck.shortage_entry and truck.freight_journal)
		from erpnext.stock.utils import get_stock_balance

		item = frappe.db.get_single_value("Sugar Settings", "cane_item")
		wh = frappe.db.get_value("Cane Depot", DEPOT, "warehouse")
		transit = frappe.db.get_single_value("Sugar Settings", "transit_warehouse")
		self.assertEqual(flt(get_stock_balance(item, wh, day, "23:59:59")), 0)  # everything bought was sent (binding received at 0)
		self.assertEqual(flt(get_stock_balance(item, transit, day, "23:59:59")), 0)
		self.assertAlmostEqual(flt(truck.recovery_amount), flt(truck.shortage_value * 275 / 500, 2), places=2)
		je = frappe.get_doc("Journal Entry", truck.freight_journal)
		self.assertAlmostEqual(sum(a.debit for a in je.accounts), sum(a.credit for a in je.accounts), places=2)
		party = next(a for a in je.accounts if a.party == CONTRACTOR)
		self.assertAlmostEqual(flt(party.credit), flt(truck.freight_amount) - flt(truck.recovery_amount), places=2)
		commission = next(r for r in dcp.postings if r.description.startswith("Commission"))
		payable_md = sum(flt(frappe.db.get_value("Cane Purchase Receipt", it.cpr, "payable_maund")) for it in dcp.items)
		self.assertAlmostEqual(flt(commission.amount), flt(payable_md * 10, 2), places=1)
		self.assertTrue(dcp.reconciled)

		dcp.reload()
		dcp.cancel()
		truck.reload()
		self.assertEqual((truck.posted_out, truck.posted_in), (0, 0))
		self.assertEqual(frappe.db.get_value("Stock Entry", truck.out_entry or "x", "docstatus"), None)  # link cleared
		self.assertTrue(all(frappe.db.get_value(r.kind, r.voucher, "docstatus") == 2 for r in dcp.postings))

	def test_days_close_in_order(self):
		i0, i1 = self.indents[0], self.indents[1]
		at = get_datetime(f"{i0.valid_from} 10:00:00")
		self._buy(i0, self.vno, at)
		# loaded on day 1 in the evening, weighed in at the mill on day 2
		d = dp.create_dispatch(DEPOT, self.vno + "T", TRUCK)
		ev = get_datetime(f"{i0.valid_from} 20:00:00")
		_rd(DTERM, 9000, ev)
		dp.capture_dispatch(d.name, terminal=DTERM, at=ev)
		_rd(DTERM, 20000, ev)
		dp.capture_dispatch(d.name, terminal=DTERM, at=ev)
		nxt = get_datetime(f"{add_days(i0.valid_from, 1)} 09:00:00")
		_rd(TERMINAL, 19950, nxt)
		dp.capture_dispatch(d.name, terminal=TERMINAL, at=nxt)
		_rd(TERMINAL, 9000, nxt)
		dp.capture_dispatch(d.name, terminal=TERMINAL, at=nxt)
		day2 = add_days(i0.valid_from, 1)
		with self.assertRaises(frappe.ValidationError):  # day 1 first
			p.close_day(day2, force=True)
		d1 = p.close_day(i0.valid_from, force=True)
		self.assertTrue(frappe.db.get_value("Depot Dispatch", d.name, "posted_out"))
		self.assertFalse(frappe.db.get_value("Depot Dispatch", d.name, "posted_in"))
		d2 = p.close_day(day2, force=True)  # only the receipt of the truck that day
		self.assertTrue(frappe.db.get_value("Depot Dispatch", d.name, "posted_in"))
		self.assertFalse(d2.purchase_invoice)
		d1.reload()
		with self.assertRaises(frappe.ValidationError):  # reopen from the latest day
			d1.cancel()
		d2.reload()
		d2.cancel()
		d1.reload()
		d1.cancel()
