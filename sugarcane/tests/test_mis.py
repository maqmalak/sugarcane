"""Phase 8: grower messages (numbers, parts, quiet hours, daily cap, test mode, mock / queued gateways, event messages on
indents / tokens / CPRs, keyword replies, the inbound endpoint) and the MIS snapshot and reports."""

import frappe
from frappe.utils import flt

from sugarcane import sms
from sugarcane.tests.test_procurement import ProcurementBase

MOBILE = "0300-9180101"
SMS_KEYS = ("sms_enabled", "sms_gateway", "sms_test_number", "sms_quiet_from", "sms_quiet_to", "sms_daily_cap")


def _set(**values):
	frappe.db.set_single_value("Sugar Settings", values)
	frappe.clear_document_cache("Sugar Settings", "Sugar Settings")


class TestMis(ProcurementBase):
	CNIC = "91801"
	LAT_OFFSET = 1.02

	def setUp(self):
		self._saved = {k: frappe.db.get_single_value("Sugar Settings", k) for k in SMS_KEYS}
		_set(sms_enabled=1, sms_gateway="Mock", sms_test_number=None, sms_quiet_from=0, sms_quiet_to=0, sms_daily_cap=0)
		from sugarcane.setup.install import ensure_sms_keywords

		ensure_sms_keywords()
		frappe.db.delete("Sugar SMS Log", {"mobile": ["in", [sms.normalise(MOBILE), "923459180199"]]})
		super().setUp()
		self.grower = frappe.db.get_value("Cane Indent", self.indents[0].name, "grower")
		frappe.db.sql("update `tabGrower` set mobile = null where mobile = %s", MOBILE)  # one grower per number
		frappe.db.set_value("Grower", self.grower, "mobile", MOBILE)

	def tearDown(self):
		from frappe.utils.password import remove_encrypted_password

		if self._testMethodName == "test_event_messages_and_keywords":
			remove_encrypted_password("Sugar Settings", "Sugar Settings", "sms_inbound_token")
		_set(**self._saved)
		frappe.db.delete("Sugar SMS Log", {"mobile": ["in", [sms.normalise(MOBILE), "923459180199"]]})

	def _log(self, name):
		return frappe.get_doc("Sugar SMS Log", name)

	def test_message_rules(self):
		self.assertEqual([sms.normalise(x) for x in ("0300-1234567", "+92 300 1234567", "00923001234567", "3001234567", "042-1234567", "")],
			["923001234567"] * 4 + [None, None])
		self.assertEqual((sms.segments("a" * 160), sms.segments("a" * 161), sms.segments("ب" * 70), sms.segments("ب" * 71)), (1, 2, 1, 2))
		c = frappe._dict(quiet_from=22, quiet_to=7)
		self.assertEqual([sms.quiet(c, f"2026-11-02 {h:02d}:30:00") for h in (21, 22, 3, 7)], [False, True, True, False])
		# mock: logged as Mocked at once; a bad number is Skipped; the daily cap skips the rest (keyword replies excepted)
		self.assertEqual(self._log(sms.send("Custom", MOBILE, text="hello")).status, "Mocked")
		self.assertEqual(self._log(sms.send("Custom", "12345", text="hello")).status, "Skipped")
		_set(sms_daily_cap=2)
		sms.send("Custom", MOBILE, text="two")
		self.assertEqual(self._log(sms.send("Custom", MOBILE, text="three")).status, "Skipped")
		self.assertEqual(self._log(sms.send("Keyword Reply", MOBILE, text="reply")).status, "Mocked")
		_set(sms_daily_cap=0, sms_test_number="0345-9180199")
		self.assertIn("923459180199", self._log(sms.send("Custom", MOBILE, text="test mode")).response)
		_set(sms_test_number=None, sms_enabled=0)
		self.assertIsNone(sms.send("Custom", MOBILE, text="off"))
		# a real gateway: queued, then the scheduler hands it over (no SMS Settings gateway here: Failed, tried again later)
		_set(sms_enabled=1, sms_gateway="Frappe SMS Settings")
		name = sms.send("Custom", MOBILE, text="queued")
		self.assertEqual(self._log(name).status, "Queued")
		_set(sms_quiet_from=0, sms_quiet_to=23)  # quiet nearly all day
		if sms.quiet():
			self.assertEqual(sms.flush_queue(), 0)
		_set(sms_quiet_from=0, sms_quiet_to=0)
		sms.flush_queue()
		log = self._log(name)
		self.assertIn(log.status, ("Sent", "Failed"))
		self.assertEqual(log.attempts, 1)

	def test_event_messages_and_keywords(self):
		ind = frappe.get_all("Sugar SMS Log", filters={"reference_doctype": "Cane Indent", "reference_name": self.indents[0].name}, pluck="name")
		# the indent was authorised before the mobile was set in setUp: put the number on and replay its event
		if not ind:
			sms.indent_submitted(frappe.get_doc("Cane Indent", self.indents[0].name))
		self.assertTrue(frappe.db.exists("Sugar SMS Log", {"reference_name": self.indents[0].name, "event": "Indent Issued"}))
		tok = self._token(self.indents[0])
		cpr = self._weigh(tok)["cpr"]
		self.assertEqual(frappe.db.get_value("Sugar SMS Log", {"reference_name": tok.name}, ["event", "mobile"]), ("Token Issued", sms.normalise(MOBILE)))
		msg = frappe.db.get_value("Sugar SMS Log", {"reference_doctype": "Cane Purchase Receipt", "reference_name": cpr}, "message")
		self.assertIn(cpr, msg)
		payable = flt(frappe.db.get_value("Cane Purchase Receipt", cpr, "payable_cpr"))
		self.assertIn(sms.money(payable), msg)
		# keywords: the grower's own number, any case, the first word
		out = sms.receive(MOBILE, "bal please")
		self.assertEqual(out["grower"], self.grower)
		self.assertIn(sms.money(payable), out["reply"])
		self.assertIn(cpr, sms.receive(MOBILE, "CPR")["reply"])
		self.assertIn("BAL", sms.receive(MOBILE, "WHAT")["reply"])
		self.assertIn("not registered", sms.receive("0345-9180199", "BAL")["reply"])
		reply = frappe.get_doc("Sugar SMS Log", out["out"])
		self.assertEqual((reply.in_reply_to, reply.event, reply.status), (out["in"], "Keyword Reply", "Mocked"))
		# the gateway's callback needs the shared token
		from sugarcane.api.v1 import sms as inbound

		s = frappe.get_doc("Sugar Settings")
		s.sms_inbound_token = "t0ken-ph8"
		s.save()
		with self.assertRaises(frappe.PermissionError):
			inbound.inbound(token="wrong", mobile=MOBILE, message="BAL")
		self.assertIn(sms.money(payable), inbound.inbound(token="t0ken-ph8", **{"from": MOBILE, "text": "BAL"})["reply"])
		self.assertEqual(frappe.session.user, "Guest")
		frappe.set_user("Administrator")

	def test_mis_snapshot_and_reports(self):
		tok = self._token(self.indents[0])
		cpr = self._weigh(tok)["cpr"]
		day = frappe.db.get_value("Cane Purchase Receipt", cpr, "posting_date")
		from sugarcane.sugar_mis.live import circle_performance, snapshot

		s = snapshot(day)
		self.assertEqual(s["day"], str(day))
		self.assertGreaterEqual(s["cane"]["loads"], 1)
		self.assertEqual(len(s["cane"]["hours"]), 24)
		self.assertAlmostEqual(sum(h["maund"] for h in s["cane"]["hours"]), s["cane"]["maund"], delta=0.5)
		for key in ("yard", "road", "payments", "stock", "plant", "stoppages", "season", "trend", "circles"):
			self.assertIn(key, s)
		circle = frappe.db.get_value("Cane Purchase Receipt", cpr, "circle")
		row = next(r for r in circle_performance(self.season) if r["circle"] == circle)
		self.assertGreaterEqual(row["supplied_maund"], flt(frappe.db.get_value("Cane Purchase Receipt", cpr, "payable_maund")) - 0.1)
		self.assertGreater(row["indents"], 0)
		from sugarcane.sugar_mis.report.circle_wise_performance import circle_wise_performance as cwp
		from sugarcane.sugar_mis.report.grower_supply_ranking import grower_supply_ranking as gsr
		from sugarcane.sugar_mis.report.season_progress import season_progress as sp

		cols, rows, _m, chart, summary = sp.execute({"season": self.season})
		self.assertTrue(any(str(r["day"]) == str(day) for r in rows))
		self.assertEqual(rows[-1]["cum_maund"], round(sum(r["maund"] for r in rows), 1))
		self.assertTrue(cwp.execute({"season": self.season})[1])
		ranked = gsr.execute({"season": self.season})[1]
		self.assertIn(self.grower, [r.grower for r in ranked])
		self.assertEqual([r.rank for r in ranked], list(range(1, len(ranked) + 1)))
