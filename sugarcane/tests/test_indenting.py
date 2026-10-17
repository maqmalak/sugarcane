"""Phase 2: indent ranges, generation (quota rules, circle cap, held overlaps, repeatable runs), batch authorization,
printing / reprint rules, expiry, cancelling, the approvals inbox and permissions."""

import frappe
from frappe.tests import IntegrationTestCase

from sugarcane.tests.test_masters import _make_hierarchy
from sugarcane.tests.test_survey import LAT, LNG, _season, _survey, square

NORTH = "Test Circle North"
START, END = "2040-11-01", "2040-11-10"


def _setup_season():
	season = _season()
	frappe.db.set_value("Crushing Season", season, {"indent_load_maund": 200, "indent_validity_days": 3,
		"indent_partial_load_pct": 50, "daily_intake_maund": 2000, "indent_start_date": None})  # 10 loads a day
	return season


def _range(season, circle=NORTH, prefix="40-901-", start=1, end=500):
	if not frappe.db.exists("Indent Range", {"season": season, "prefix": prefix}):
		frappe.get_doc({"doctype": "Indent Range", "season": season, "circle": circle, "prefix": prefix, "digits": 6,
			"from_no": start, "to_no": end}).insert()


def _rule(season, name="Test plant 50 %", **kw):
	frappe.get_doc({"doctype": "Indent Quota Rule", "season": season, "rule_name": name, "quota_pct": kw.pop("quota_pct", 50),
		"from_date": START, "to_date": END, "enabled": 1, **kw}).insert()


class TestIndenting(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()

	def setUp(self):
		self.season = _setup_season()
		for dt in ("Cane Indent", "Indent Batch", "Indent Quota Rule", "Indent Range"):
			for name in frappe.get_all(dt, filters={"season": self.season}, pluck="name"):
				frappe.db.delete(dt, {"name": name})
		frappe.db.delete("Indent Batch Day", {"parenttype": "Indent Batch"})
		_range(self.season)
		_rule(self.season)

	def _mine(self, growers):
		return frappe.get_all("Cane Indent", filters={"season": self.season, "grower": ["in", growers]},
			fields=["name", "grower", "indent_date", "status", "docstatus", "batch", "valid_to"], order_by="name asc")

	def _two_growers(self, base):
		"""Two fresh growers (CNICs unique to `base`) with one surveyed field each."""
		tag = int(round(base * 100)) % 1000
		a = _survey(f"91201-0000{tag:03d}-1", square(base, LNG, 100))
		b = _survey(f"91201-0000{tag:03d}-2", square(base + 0.01, LNG, 100))
		return a, b

	# ------------------------------------------------------------ numbers
	def test_numbers_come_from_the_range_and_fall_back(self):
		from sugarcane.cane_indenting.numbering import allocate

		frappe.db.set_value("Indent Range", {"prefix": "40-901-"}, "to_no", 2)
		frappe.get_doc("Indent Range", frappe.db.get_value("Indent Range", {"prefix": "40-901-"})).save()
		self.assertEqual(allocate(self.season, NORTH), "40-901-000001")
		self.assertEqual(allocate(self.season, NORTH), "40-901-000002")
		with self.assertRaises(frappe.ValidationError):
			allocate(self.season, NORTH)  # exhausted, no mill-wide range
		_range(self.season, circle=None, prefix="40-000-", start=900001, end=900005)
		self.assertEqual(allocate(self.season, NORTH), "40-000-900001")
		with self.assertRaises(frappe.ValidationError):  # overlapping numbers with the same prefix
			_range(self.season, circle=None, prefix="40-000-", start=900003, end=900010) or frappe.get_doc({"doctype": "Indent Range",
				"season": self.season, "prefix": "40-000-", "digits": 6, "from_no": 900003, "to_no": 900010}).insert()

	# ------------------------------------------------------------ generation
	def test_generate_authorize_print_expire(self):
		from sugarcane.cane_indenting import api, generator
		from sugarcane.cane_indenting.printing import print_indents

		a, b = self._two_growers(LAT + 0.30)
		expected = a.expected_production_maund
		loads = generator.calc.loads_for(expected * 0.5, 200, 50)
		self.assertGreater(loads, 0)

		pre = generator.preview(self.season, START, END, NORTH, today=START)
		pre.pop("_chosen")
		self.assertTrue(pre["can_generate"], pre["warnings"])
		out = generator.generate(self.season, START, END, NORTH, today=START)
		mine = self._mine([a.grower, b.grower])
		self.assertEqual(len([m for m in mine if m.grower == a.grower]), loads)
		self.assertTrue(all(START <= str(m.indent_date) <= END for m in mine))
		self.assertTrue(all(m.status == "Draft" and m.batch for m in mine))
		self.assertTrue(all(m.name.startswith("40-901-") for m in mine))

		# running again creates nothing new
		again = generator.preview(self.season, START, END, NORTH, today=START)
		again.pop("_chosen")
		self.assertEqual(again["new"], 0)

		batch = next(x["name"] for x in out["batches"] if x["circle"] == NORTH)
		api.authorize_batch(batch)
		self.assertEqual(frappe.db.get_value("Indent Batch", batch, "status"), "Authorized")
		mine = self._mine([a.grower])
		self.assertTrue(all(m.docstatus == 1 and m.status == "Authorized" for m in mine))

		pdf, info = print_indents([m.name for m in mine])
		self.assertTrue(pdf.startswith(b"%PDF"))
		self.assertEqual(info["printed"], len(mine))
		self.assertTrue(all(m.status == "Printed" for m in self._mine([a.grower])))
		with self.assertRaises(frappe.ValidationError):
			print_indents([mine[0].name])  # a reprint needs a reason
		_pdf, info = print_indents([mine[0].name], reason="Grower lost the slip")
		self.assertEqual(info["reprinted"], 1)
		self.assertEqual(frappe.db.get_value("Cane Indent", mine[0].name, "print_count"), 2)

		look = api.lookup(mine[0].name.lower())
		self.assertTrue(look["found"])
		self.assertFalse(look["usable_today"])  # the test season is in 2040
		self.assertIn("<svg", look["barcode"])

		self.assertGreaterEqual(generator.expire_due(today="2040-12-31"), len(mine))
		self.assertTrue(all(m.status == "Expired" for m in self._mine([a.grower])))

	def test_cancel_batch_keeps_used_indents(self):
		from sugarcane.cane_indenting import api, generator

		a, _b = self._two_growers(LAT + 0.32)
		out = generator.generate(self.season, START, END, NORTH, today=START)
		batch = next(x["name"] for x in out["batches"] if x["circle"] == NORTH)
		api.authorize_batch(batch)
		used = self._mine([a.grower])[0].name
		frappe.db.set_value("Cane Indent", used, {"status": "Used", "token": "TKN-TEST-1"})  # what a Phase 3 token will do
		frappe.get_doc("Indent Batch", batch).cancel()
		statuses = {m.name: (m.status, m.docstatus) for m in frappe.get_all("Cane Indent", filters={"batch": batch},
			fields=["name", "status", "docstatus"])}
		self.assertEqual(statuses[used], ("Used", 1))
		self.assertTrue(all(s == ("Cancelled", 2) for n, s in statuses.items() if n != used))
		# cancelled loads are not issued again
		again = generator.preview(self.season, START, END, NORTH, today=START)
		again.pop("_chosen")
		self.assertEqual(again["new"], 0)

	def test_held_overlap_and_circle_cap(self):
		from sugarcane.cane_indenting import generator
		from sugarcane.quota import season_quotas

		a, _b = self._two_growers(LAT + 0.34)
		frappe.db.set_value("Cane Survey", a.name, "overlap_status", "Under Review")
		lines, held = generator.survey_lines(self.season)
		self.assertIn(a.name, [h["name"] for h in held])
		self.assertNotIn(a.name, [x["name"] for x in lines])

		before = sum(x["entitled"] for x in generator.entitlements(self.season) if x["circle"] == NORTH)
		doc = frappe.get_doc("Crushing Season", self.season)
		doc.append("circle_quotas", {"circle": NORTH, "quota_maund": round(before / 2)})
		doc.save()
		self.assertEqual(season_quotas(self.season)[NORTH], round(before / 2))
		after = sum(x["entitled"] for x in generator.entitlements(self.season) if x["circle"] == NORTH)
		self.assertAlmostEqual(after, round(before / 2), delta=1)

	def test_capacity_spreads_loads(self):
		from sugarcane.cane_indenting import generator

		frappe.db.set_value("Crushing Season", self.season, "daily_intake_maund", 200)  # one load a day
		self._two_growers(LAT + 0.36)
		pre = generator.preview(self.season, START, END, NORTH, today=START)
		chosen = pre.pop("_chosen")
		per_day = {}
		for x in chosen:
			per_day[x.date] = per_day.get(x.date, 0) + 1
		self.assertTrue(all(n <= 1 for n in per_day.values()))

	# ------------------------------------------------------------ inbox & permissions
	def test_inbox_authorize_and_reject(self):
		from sugarcane.api.v1.approvals import act, get_inbox
		from sugarcane.cane_indenting import generator

		a, _b = self._two_growers(LAT + 0.38)
		out = generator.generate(self.season, START, "2040-11-05", NORTH, today=START)
		first = next(x["name"] for x in out["batches"] if x["circle"] == NORTH)
		item = next(p for p in get_inbox()["pending"] if p["name"] == first)
		self.assertEqual(item["category"], "indent")
		self.assertEqual(item["actions"], ["Authorize", "Reject"])
		act("Indent Batch", first, "Authorize")
		self.assertEqual(frappe.db.get_value("Indent Batch", first, "docstatus"), 1)

		out = generator.generate(self.season, "2040-11-06", END, NORTH, today=START)
		second = next(x["name"] for x in out["batches"] if x["circle"] == NORTH)
		names = frappe.get_all("Cane Indent", filters={"batch": second}, pluck="name")
		act("Indent Batch", second, "Reject", "Wrong dates")
		self.assertFalse(frappe.db.exists("Indent Batch", second))
		self.assertFalse(frappe.db.exists("Cane Indent", {"name": ["in", names]}))

	def test_surveyor_cannot_generate(self):
		from sugarcane.cane_indenting import generator

		user = "test.surveyor@micromaxsugar.example"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "Test Surveyor", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		frappe.get_doc("User", user).add_roles("Surveyor")
		frappe.set_user(user)
		try:
			with self.assertRaises(frappe.PermissionError):
				generator.generate(self.season, START, END, NORTH, today=START)
		finally:
			frappe.set_user("Administrator")
