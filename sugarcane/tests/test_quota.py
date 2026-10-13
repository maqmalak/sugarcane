"""Season quota adjustment: season rows override the circle quota, saving keeps who/when/previous, reset, closed seasons,
permissions, and the insights / Circle Wise report reading the season figure."""

import frappe
from frappe.tests import IntegrationTestCase

from sugarcane.quota import quota_of, season_quotas
from sugarcane.tests.test_masters import _make_hierarchy
from sugarcane.tests.test_survey import LAT, LNG, _season, _survey, square

NORTH, SOUTH = "Test Circle North", "Test Circle South"


class TestSeasonQuota(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()
		frappe.db.set_value("Cane Circle", NORTH, "quota_maund", 100_000)
		frappe.db.set_value("Cane Circle", SOUTH, "quota_maund", 50_000)

	def setUp(self):
		self.season = _season()
		doc = frappe.get_doc("Crushing Season", self.season)
		doc.status = "Planned"
		doc.set("circle_quotas", [])
		doc.save()

	def _row(self, view, circle):
		return next(r for r in view["rows"] if r["circle"] == circle)

	def test_season_quota_overrides_circle_quota(self):
		from sugarcane.api.v1.quota import save, view

		self.assertEqual(quota_of(self.season, NORTH), 100_000)
		out = save(self.season, [{"circle": NORTH, "quota_maund": 120_400, "basis": "Survey", "remarks": "good crop"}], reason="Survey up")
		self.assertEqual(out["changed"], [NORTH])
		row = self._row(out, NORTH)
		self.assertTrue(row["has_season_quota"])
		self.assertEqual(row["quota"], 120_400)
		self.assertEqual(row["previous_quota"], 100_000)
		self.assertEqual(row["basis"], "Survey")
		self.assertEqual(row["remarks"], "good crop")
		self.assertEqual(self._row(out, SOUTH)["quota"], 50_000)  # untouched circle keeps the circle quota
		self.assertEqual(season_quotas(self.season)[NORTH], 120_400)
		self.assertEqual(frappe.db.get_value("Cane Circle", NORTH, "quota_maund"), 100_000)  # the circle itself is not changed
		self.assertTrue(any("Survey up" in h["text"] for h in view(self.season)["history"]))

	def test_second_adjustment_records_previous_and_skips_unchanged(self):
		from sugarcane.api.v1.quota import save

		save(self.season, [{"circle": NORTH, "quota_maund": 110_000}])
		out = save(self.season, [{"circle": NORTH, "quota_maund": 90_000}, {"circle": SOUTH, "quota_maund": 50_000}])
		self.assertEqual(out["changed"], [NORTH])  # South is unchanged, so not written
		self.assertEqual(self._row(out, NORTH)["previous_quota"], 110_000)
		self.assertFalse(self._row(out, SOUTH)["has_season_quota"])
		self.assertEqual(len(frappe.get_doc("Crushing Season", self.season).circle_quotas), 1)

	def test_reset_goes_back_to_circle_quota(self):
		from sugarcane.api.v1.quota import reset, save

		save(self.season, [{"circle": NORTH, "quota_maund": 150_000}])
		out = reset(self.season, [NORTH])
		self.assertFalse(self._row(out, NORTH)["has_season_quota"])
		self.assertEqual(self._row(out, NORTH)["quota"], 100_000)

	def test_validation(self):
		from sugarcane.api.v1.quota import save

		with self.assertRaises(frappe.ValidationError):
			save(self.season, [{"circle": NORTH, "quota_maund": -5}])
		doc = frappe.get_doc("Crushing Season", self.season)
		doc.append("circle_quotas", {"circle": NORTH, "quota_maund": 1})
		doc.append("circle_quotas", {"circle": NORTH, "quota_maund": 2})
		with self.assertRaises(frappe.ValidationError):
			doc.save()

	def test_closed_season_is_read_only(self):
		from sugarcane.api.v1.quota import save, view

		frappe.db.set_value("Crushing Season", self.season, "status", "Closed")
		self.assertFalse(view(self.season)["can_edit"])
		with self.assertRaises(frappe.ValidationError):
			save(self.season, [{"circle": NORTH, "quota_maund": 1000}])

	def test_surveyor_cannot_adjust(self):
		from sugarcane.api.v1.quota import save, view

		user = "test.surveyor@micromaxsugar.example"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "Test Surveyor", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		frappe.get_doc("User", user).add_roles("Surveyor")
		frappe.set_user(user)
		try:
			self.assertFalse(view(self.season)["can_edit"])
			with self.assertRaises(frappe.PermissionError):
				save(self.season, [{"circle": NORTH, "quota_maund": 1000}])
		finally:
			frappe.set_user("Administrator")

	def test_insights_and_report_use_season_quota(self):
		from sugarcane.api.v1.insights import survey
		from sugarcane.api.v1.quota import save
		from sugarcane.eagleeye_survey.report.circle_wise_survey_summary.circle_wise_survey_summary import execute

		_survey("91101-0000060-1", square(LAT + 0.10, LNG, 100))
		save(self.season, [{"circle": NORTH, "quota_maund": 77_000}])
		north = next(c for c in survey(self.season)["by_circle"] if c["name"] == NORTH)
		self.assertEqual(north["quota"], 77_000)
		_cols, data, *_ = execute({"season": self.season})
		self.assertEqual(next(r for r in data if r["circle"] == NORTH)["quota_maund"], 77_000)
