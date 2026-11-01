"""TPT cash counters: session, strong room in / out, basket payment (cash within the till, JazzCash with one TID), counted close
with short / excess, next opening = last count; and the weighbridge platform position sensors."""

import frappe
from frappe.utils import flt, get_datetime, now_datetime

from sugarcane.cane_procurement import counter as c
from sugarcane.cane_procurement import procurement as p
from sugarcane.tests.test_procurement import TERMINAL, ProcurementBase, _reading

COUNTER = "Test Counter PT"


def _counter():
	if not frappe.db.exists("Cash Counter", COUNTER):
		frappe.get_doc({"doctype": "Cash Counter", "counter_name": COUNTER, "is_active": 1,
			"cash_account": frappe.db.get_single_value("Sugar Settings", "cash_counter_account")}).insert()
	for s in frappe.get_all("Cash Counter Session", filters={"status": "Open", "cashier": frappe.session.user}, pluck="name"):
		frappe.db.set_value("Cash Counter Session", s, "status", "Closed")


class TestCounter(ProcurementBase):
	CNIC = "91411"
	LAT_OFFSET = 1.05

	def _bilties(self):
		out = []
		for ind in self.indents[:2]:
			tok = self._token(ind, vehicle_no=f"{self.vno}{len(out)}")
			out.append(frappe.db.get_value("Cane Purchase Receipt", self._weigh(tok, 16000, 4000)["cpr"], "bilty"))
		return out

	def test_session_basket_and_close(self):
		_counter()
		b1, b2 = self._bilties()
		amt = {b: flt(frappe.db.get_value("TPT Bilty", b, "amount")) for b in (b1, b2)}
		with self.assertRaises(frappe.ValidationError):  # live cash payment needs an open counter
			p.pay_bilty(b1)

		s = c.open_session(COUNTER)
		opening = flt(frappe.db.get_value("Cash Counter Session", s, "opening_balance"))
		if opening < sum(amt.values()):
			with self.assertRaises(frappe.ValidationError):  # more than the till holds
				c.pay_many(s, [b1, b2], "Driver", "91411-1111111-1")
		got = c.move(s, "Received from Strong Room", 50000, "SR-1")
		self.assertEqual(flt(got.expected_balance), opening + 50000)
		je = frappe.get_doc("Journal Entry", got.movements[-1].journal_entry)
		room = frappe.db.get_single_value("Sugar Settings", "strong_room_account")
		self.assertEqual({a.account: (flt(a.debit), flt(a.credit)) for a in je.accounts}[room], (0, 50000))

		out = c.pay_many(s, [b1, b2], "Driver", "91411-1111111-1")
		rows = frappe.get_all("TPT Bilty", filters={"name": ["in", [b1, b2]]}, fields=["status", "payment_batch", "counter_session", "cash_counter"])
		self.assertTrue(all(r.status == "Paid" and r.payment_batch == out["batch"] and r.counter_session == s and r.cash_counter == COUNTER
			for r in rows))
		now = c.refresh(s)
		self.assertEqual((now.cash_paid_count, flt(now.cash_paid_total)), (2, sum(amt.values())))
		self.assertAlmostEqual(flt(now.expected_balance), opening + 50000 - sum(amt.values()), places=2)

		# reverse one, pay it again by JazzCash (one TID for the basket)
		frappe.set_user("Administrator")
		p.reverse_bilty_payment(b2, "test")
		c.pay_many(s, [b2], "Driver", None, "JazzCash", "03007212058", "TID778899001")
		now = c.refresh(s)
		self.assertEqual((now.cash_paid_count, now.jazzcash_count), (1, 1))
		self.assertAlmostEqual(flt(now.expected_balance), opening + 50000 - amt[b1], places=2)

		c.move(s, "Returned to Strong Room", 10000, "SR-2")
		expected = flt(c.refresh(s).expected_balance)
		with self.assertRaises(frappe.ValidationError):  # can't return more than the till holds
			c.move(s, "Returned to Strong Room", expected + 1)
		short = expected - 100
		count = [{"denomination": 1000, "count": int(short // 1000)}, {"denomination": 0, "amount": round(short % 1000, 2)}]
		with self.assertRaises(frappe.ValidationError):  # 100 short: a reason is needed
			c.close(s, count)
		closed = c.close(s, count, "counted twice")
		self.assertAlmostEqual(flt(closed.difference), -100, places=2)
		self.assertTrue(closed.difference_journal_entry)
		s2 = c.open_session(COUNTER)
		self.assertAlmostEqual(flt(frappe.db.get_value("Cash Counter Session", s2, "opening_balance")), flt(closed.counted_balance), places=2)

	def test_platform_sensors(self):
		frappe.db.set_value("Weighbridge Terminal", TERMINAL, "position_sensors", 1)
		tok = self._token(self.indents[0])
		at = get_datetime(tok.issued_at)
		_reading(15000, at)
		p.capture(tok.name, "Gross", terminal=TERMINAL, at=at)  # back-dated: sensors not checked
		p._cache_reading(TERMINAL, {"weight_kg": 4000, "stable": 1, "raw": "", "source": "Simulator", "at": str(now_datetime()),
			"platform_ok": 0})
		with self.assertRaises(frappe.ValidationError):  # vehicle not fully on the deck
			p.capture(tok.name, "Tare", terminal=TERMINAL)
		p._cache_reading(TERMINAL, {"weight_kg": 4000, "stable": 1, "raw": "", "source": "Simulator", "at": str(now_datetime()),
			"platform_ok": 1})
		self.assertTrue(p.capture(tok.name, "Tare", terminal=TERMINAL)["cpr"])
		frappe.db.set_value("Weighbridge Terminal", TERMINAL, "position_sensors", 0)
