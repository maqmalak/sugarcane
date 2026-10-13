"""Journey to mill (distance + standard times, drawn route), bell notifications, and the sugar Desktop data."""

import json

import frappe
from frappe.tests import IntegrationTestCase

from sugarcane.calc import geo
from sugarcane.tests.test_masters import _make_hierarchy

MILL = (32.083, 72.671)


def _north_of_mill(km):
	lng, lat, _ = geo.GEOD.fwd(MILL[1], MILL[0], 0, km * 1000)
	return lat, lng


class TestJourney(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()

	def setUp(self):
		for field, value in {"mill_latitude": MILL[0], "mill_longitude": MILL[1], "road_factor": 1.3, "loaded_speed_kmph": 25,
				"empty_speed_kmph": 35, "journey_allowance_min": 15}.items():
			frappe.db.set_single_value("Sugar Settings", field, value)
		frappe.clear_document_cache("Sugar Settings", "Sugar Settings")

	def _source(self, km, **kw):
		lat, lng = _north_of_mill(km)
		return frappe.get_doc({"doctype": "Cane Source", "source_name": kw.pop("source_name", f"Test Post {km}"), "source_type": "Check Post",
			"latitude": lat, "longitude": lng, **kw}).insert()

	def test_estimated_from_straight_line(self):
		s = self._source(20)
		self.assertAlmostEqual(s.straight_km, 20, delta=0.05)
		self.assertAlmostEqual(s.distance_km, 26, delta=0.1)  # × 1.3
		self.assertEqual(s.distance_basis, "Estimated")
		self.assertEqual(s.journey_to_mill_min, round(60 * s.distance_km / 25 + 15))
		self.assertEqual(s.journey_back_min, round(60 * s.distance_km / 35))
		self.assertEqual(s.round_trip_min, s.journey_to_mill_min + s.journey_back_min)

	def test_entered_distance_and_times_are_kept(self):
		s = self._source(10, source_name="Test Post entered", road_distance_manual=1, distance_km=17)
		self.assertEqual(s.distance_basis, "Entered")
		self.assertEqual(s.distance_km, 17)
		s.journey_time_manual, s.journey_to_mill_min, s.journey_back_min = 1, 90, 40
		s.save()
		self.assertEqual((s.journey_to_mill_min, s.journey_back_min, s.round_trip_min), (90, 40, 130))

	def test_drawn_route_sets_road_distance(self):
		lat, lng = _north_of_mill(10)
		elbow = geo.GEOD.fwd(lng, lat, 90, 5000)  # 5 km east, then back to the mill
		route = {"type": "LineString", "coordinates": [[lng, lat], [elbow[0], elbow[1]], [MILL[1], MILL[0]]]}
		s = self._source(10, source_name="Test Post routed", route=json.dumps(route))
		self.assertEqual(s.distance_basis, "Drawn route")
		self.assertGreater(s.distance_km, 15)  # 5 km east + ~11.2 km back: longer than the 10 km straight line
		self.assertLess(s.distance_km, 17)
		with self.assertRaises(frappe.ValidationError):
			s.route = json.dumps({"type": "LineString", "coordinates": [[lng, lat]]})
			s.save()

	def test_moving_the_mill_recalculates(self):
		s = self._source(20, source_name="Test Post moved")
		settings = frappe.get_doc("Sugar Settings")
		settings.mill_latitude, settings.mill_longitude = _north_of_mill(10)
		settings.save()
		s.reload()
		self.assertAlmostEqual(s.straight_km, 10, delta=0.05)

	def test_sources_map(self):
		from sugarcane.journey import sources_map

		self._source(30, source_name="Test Post map")
		out = sources_map()
		self.assertEqual(out["mill"]["latitude"], MILL[0])
		self.assertTrue(any(f["properties"]["title"] == "Test Post map" for f in out["features"]))


class TestNotifications(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()
		cls.manager = "test.cane.manager@micromaxsugar.example"
		if not frappe.db.exists("User", cls.manager):
			u = frappe.get_doc({"doctype": "User", "email": cls.manager, "first_name": "Test Manager", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		frappe.get_doc("User", cls.manager).add_roles("Cane Manager")

	def _logs(self, doctype):
		return frappe.get_all("Notification Log", filters={"for_user": self.manager, "document_type": doctype}, pluck="subject")

	def test_overlap_review_notifies_managers(self):
		from sugarcane.tests.test_survey import LAT, LNG, _survey, m_lng, square

		base = LAT + 0.12
		_survey("91101-0000070-1", square(base, LNG, 100))
		b = _survey("91101-0000071-1", square(base, LNG + 50 * m_lng(), 100))
		review = frappe.get_value("Survey Overlap Review", {"survey": b.name}, "name")
		self.assertTrue(review)
		self.assertTrue(any(review in s or b.name in s for s in self._logs("Survey Overlap Review")))

	def test_pending_device_notifies_managers(self):
		frappe.get_doc({"doctype": "Survey Device", "android_id": "test-notify-device-1", "app": "EagleEye", "status": "Pending",
			"assigned_user": "Administrator"}).insert(ignore_permissions=True)
		self.assertTrue(any("approval" in s for s in self._logs("Survey Device")))

	def test_demo_records_do_not_notify(self):
		before = len(self._logs("Survey Device"))
		frappe.get_doc({"doctype": "Survey Device", "android_id": "test-notify-device-2", "app": "EagleEye", "status": "Pending",
			"is_demo": 1}).insert(ignore_permissions=True)
		self.assertEqual(len(self._logs("Survey Device")), before)


class TestHome(IntegrationTestCase):
	def test_home_has_sugar_blocks(self):
		from sugarcane.api.v1.home import get_home

		out = get_home(refresh=1)
		for key in ("alerts", "activity", "days", "module_mix", "stats", "tiles", "todos"):
			self.assertIn(key, out)
		self.assertEqual(len(out["days"]), 7)
		self.assertTrue(all(a["key"].startswith("sc_") or a["key"] == "approvals" for a in out["alerts"]))
		self.assertTrue(all(a["category"] in ("survey", "field", "masters", "finance") for a in out["activity"]))


class TestInbox(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()

	def _pair(self, offset):
		from sugarcane.tests.test_survey import LAT, LNG, _survey, m_lng, square

		base = LAT + offset
		a = _survey(f"91101-00000{int(offset * 100):02d}-1", square(base, LNG, 100))
		b = _survey(f"91101-00000{int(offset * 100):02d}-2", square(base, LNG + 50 * m_lng(), 100))
		return a, b, frappe.get_value("Survey Overlap Review", {"survey": b.name}, "name")

	def test_open_overlap_is_in_the_inbox(self):
		from sugarcane.api.v1.approvals import get_inbox

		_a, b, review = self._pair(0.14)
		item = next(p for p in get_inbox()["pending"] if p["name"] == review)
		self.assertEqual(item["category"], "overlap")
		self.assertIn("Accept both", item["actions"])
		self.assertIn(f"Reject {b.name}", item["actions"])

	def test_accept_and_reject_from_the_inbox(self):
		from sugarcane.api.v1.approvals import act, get_inbox

		a, b, review = self._pair(0.16)
		act("Survey Overlap Review", review, f"Reject {b.name}")
		self.assertEqual(frappe.db.get_value("Survey Overlap Review", review, "status"), "Rejected Survey")
		self.assertEqual(frappe.db.get_value("Cane Survey", b.name, "docstatus"), 2)  # the rejected survey is cancelled
		self.assertFalse(any(p["name"] == review for p in get_inbox()["pending"]))
		self.assertTrue(any(r["name"] == review and r["category"] == "overlap" for r in get_inbox()["recent"]))
		with self.assertRaises(frappe.ValidationError):
			act("Survey Overlap Review", review, "Accept both")  # already decided

		_a2, _b2, review2 = self._pair(0.18)
		act("Survey Overlap Review", review2, "Accept both")
		self.assertEqual(frappe.db.get_value("Survey Overlap Review", review2, "status"), "Accepted")


class TestHomeApprovals(TestInbox):
	def test_open_overlaps_count_on_the_home_page(self):
		from sugarcane.api.v1.home import approve, get_home

		_a, _b, review = self._pair(0.20)
		out = get_home(refresh=1)
		self.assertGreaterEqual(out["approvals_total"], 1)
		self.assertEqual(out["stats"]["pending"], out["approvals_total"])
		item = next(a for a in out["approvals"] if a["name"] == review)
		self.assertTrue(item["can_approve"])
		approve("Survey Overlap Review", review)  # the home card's button accepts both
		self.assertEqual(frappe.db.get_value("Survey Overlap Review", review, "status"), "Accepted")
