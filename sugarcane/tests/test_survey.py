"""Phase 1: geometry, survey measuring, overlap reviews, attendance geofence, hierarchy pins/boundaries, sync API."""

import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase, UnitTestCase
from frappe.utils import add_to_date, get_datetime, now_datetime, nowdate

from sugarcane.calc import geo
from sugarcane.tests.test_masters import _make_hierarchy

LAT, LNG = 32.10, 72.70  # near Sargodha


def _deg(lat, lng, metres, azimuth):
	lng2, lat2, _ = geo.GEOD.fwd(lng, lat, azimuth, metres)
	return lat2 - lat, lng2 - lng


M_LAT = _deg(LAT, LNG, 1, 0)[0]  # degrees per metre north here


def m_lng(lat=LAT):
	return _deg(lat, LNG, 1, 90)[1]


def square(lat, lng, side_m):
	"""Square GeoJSON polygon with its south-west corner at (lat, lng), sides measured on the ellipsoid."""
	dlat, dlng = side_m * M_LAT, side_m * m_lng(lat)
	ring = [[lng, lat], [lng + dlng, lat], [lng + dlng, lat + dlat], [lng, lat + dlat], [lng, lat]]
	return {"type": "Polygon", "coordinates": [ring]}


def tiny_jpeg_b64():
	import base64
	import io

	from PIL import Image

	buf = io.BytesIO()
	Image.new("RGB", (8, 8), (40, 160, 60)).save(buf, format="JPEG")
	return base64.b64encode(buf.getvalue()).decode()


def fc(geometry):
	return json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": geometry}]})


ACRE_SIDE_M = 63.6149  # √4046.856 m²


class TestGeo(UnitTestCase):
	def test_area_of_one_acre(self):
		poly = geo.polygon_of(square(LAT, LNG, ACRE_SIDE_M))
		self.assertAlmostEqual(geo.area_acres(poly), 1.0, delta=0.003)
		self.assertAlmostEqual(geo.area_kanal(poly), 8.0, delta=0.03)

	def test_area_of_100m_square(self):
		poly = geo.polygon_of(square(LAT, LNG, 100))
		self.assertAlmostEqual(geo.area_sq_m(poly), 10_000, delta=25)
		self.assertAlmostEqual(geo.perimeter_m(poly), 400, delta=1)

	def test_feature_collection_and_feature_inputs(self):
		g = square(LAT, LNG, 100)
		a = geo.area_sq_m(geo.polygon_of(g))
		self.assertAlmostEqual(geo.area_sq_m(geo.polygon_of(fc(g))), a, places=3)
		self.assertAlmostEqual(geo.area_sq_m(geo.polygon_of({"type": "Feature", "geometry": g})), a, places=3)
		self.assertIsNone(geo.polygon_of(None))
		self.assertIsNone(geo.polygon_of({"type": "Point", "coordinates": [LNG, LAT]}))

	def test_leaflet_circle(self):
		value = {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"radius": 100},
			"geometry": {"type": "Point", "coordinates": [LNG, LAT]}}]}
		self.assertAlmostEqual(geo.area_sq_m(geo.polygon_of(value)), 3.14159 * 100 * 100, delta=150)

	def test_self_intersecting_polygon_is_repaired(self):
		bow = {"type": "Polygon", "coordinates": [[[LNG, LAT], [LNG + 0.001, LAT + 0.001], [LNG + 0.001, LAT],
			[LNG, LAT + 0.001], [LNG, LAT]]]}
		poly = geo.polygon_of(bow)
		self.assertTrue(poly.is_valid)
		self.assertGreater(geo.area_sq_m(poly), 0)

	def test_too_few_corners(self):
		with self.assertRaises(geo.GeoError):
			geo.polygon_of({"type": "Polygon", "coordinates": [[[LNG, LAT], [LNG + 0.001, LAT], [LNG, LAT]]]})

	def test_overlap(self):
		a = geo.polygon_of(square(LAT, LNG, 100))
		b = geo.polygon_of(square(LAT, LNG + 50 * m_lng(), 100))  # shifted 50 m east: half overlaps
		ov = geo.overlap(a, b)
		self.assertAlmostEqual(ov["pct_of_a"], 50, delta=0.5)
		self.assertAlmostEqual(ov["pct_of_smaller"], 50, delta=0.5)
		self.assertAlmostEqual(ov["acres"] * 4046.856, 5000, delta=30)
		far = geo.polygon_of(square(LAT + 0.01, LNG, 100))
		self.assertEqual(geo.overlap(a, far)["acres"], 0)

	def test_contains_with_buffer(self):
		a = geo.polygon_of(square(LAT, LNG, 100))
		self.assertTrue(geo.contains_point(a, LAT + 50 * M_LAT, LNG + 50 * m_lng()))
		outside_lat = LAT + 130 * M_LAT  # 30 m north of the square
		self.assertFalse(geo.contains_point(a, outside_lat, LNG + 50 * m_lng()))
		self.assertTrue(geo.contains_point(a, outside_lat, LNG + 50 * m_lng(), buffer_m=40))

	def test_distance_and_path(self):
		self.assertAlmostEqual(geo.distance_m(LAT, LNG, LAT + 1000 * M_LAT, LNG), 1000, delta=5)
		pts = [(LAT, LNG), (LAT + 1000 * M_LAT, LNG), (LAT + 1000 * M_LAT, LNG + 1000 * m_lng())]
		self.assertAlmostEqual(geo.path_length_m(pts), 2000, delta=10)

	def test_share_inside(self):
		outer = geo.polygon_of(square(LAT, LNG, 100))
		inner = geo.polygon_of(square(LAT, LNG + 50 * m_lng(), 100))
		self.assertAlmostEqual(geo.share_inside(inner, outer), 50, delta=0.5)


def _season():
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if not frappe.db.exists("Crushing Season", "Test Survey Season"):
		frappe.get_doc({"doctype": "Crushing Season", "season_name": "Test Survey Season", "company": company,
			"start_date": "2040-11-01", "end_date": "2041-03-31", "status": "Planned"}).insert()
	return "Test Survey Season"


def _variety():
	if not frappe.db.exists("Cane Variety", "Test Variety"):
		frappe.get_doc({"doctype": "Cane Variety", "variety_name": "Test Variety", "expected_yield": 1000}).insert()
	return "Test Variety"


def _grower(cnic):
	name = frappe.db.get_value("Grower", {"cnic": cnic})
	if name:
		return name
	return frappe.get_doc({"doctype": "Grower", "grower_name": "Survey Test Grower", "cnic": cnic,
		"circle": "Test Circle North", "village": "901-001"}).insert().name


def _survey(cnic, polygon, submit=True, **kw):
	doc = frappe.get_doc({"doctype": "Cane Survey", "season": _season(), "survey_for": "Company", "grower": _grower(cnic),
		"circle": "Test Circle North", "village": "901-001", "variety": _variety(), "crop_land_acres": kw.pop("acres", 2.5),
		"polygon": fc(polygon) if polygon else None, **kw})
	doc.insert()
	if submit:
		doc.submit()
	return doc


class TestSurvey(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()
		frappe.db.set_single_value("Sugar Settings", "overlap_tolerance_pct", 5)
		circle = frappe.get_doc("Cane Circle", "Test Circle North")
		circle.polygon = fc(square(LAT - 0.01, LNG - 0.01, 3000))
		circle.save()
		village = frappe.get_doc("Cane Village", "901-001")
		village.polygon = fc(square(LAT - 0.002, LNG - 0.002, 1000))
		village.latitude = village.longitude = None
		village.save()

	def test_hierarchy_area_and_pin(self):
		village = frappe.get_doc("Cane Village", "901-001")
		self.assertAlmostEqual(village.area_acres, 1_000_000 / 4046.856, delta=1)
		self.assertTrue(geo.contains_point(geo.polygon_of(village.polygon), village.latitude, village.longitude))

	def test_save_geo_api(self):
		from sugarcane.api.v1.survey_map import geo_feature, save_geo

		out = save_geo("Cane Sector", frappe.db.get_value("Cane Sector", {"circle": "Test Circle North"}) or
			frappe.get_doc({"doctype": "Cane Sector", "sector_name": "Test Sector", "sector_code": "9",
				"circle": "Test Circle North"}).insert().name, polygon=json.dumps(square(LAT, LNG, 500)))
		self.assertAlmostEqual(out["area_acres"], 250_000 / 4046.856, delta=0.5)
		feat = geo_feature("Cane Circle", "Test Circle North")
		self.assertTrue(feat["polygon"])
		self.assertTrue(any(f["properties"]["doctype"] == "Cane Village" for f in feat["children"]["features"]))

	def test_measure_and_expected_production(self):
		doc = _survey("91101-0000001-1", square(LAT, LNG, ACRE_SIDE_M * 2), submit=False, acres=4.2, disease=None)
		self.assertAlmostEqual(doc.calc_area_acres, 4.0, delta=0.02)
		self.assertAlmostEqual(doc.calc_area_kanal, 32.0, delta=0.15)
		self.assertAlmostEqual(doc.area_variance_pct, (4.0 - 4.2) / 4.2 * 100, delta=0.6)
		self.assertEqual(doc.inside_village, 1)
		self.assertAlmostEqual(doc.expected_production_maund, doc.calc_area_acres * 1000, delta=0.1)
		self.assertIsNotNone(doc.bbox_min_lat)

	def test_disease_reduces_expected_production(self):
		if not frappe.db.exists("Crop Disease", "Test Red Rot"):
			frappe.get_doc({"doctype": "Crop Disease", "disease_name": "Test Red Rot"}).insert()
		doc = _survey("91101-0000002-1", square(LAT + 0.0005, LNG, ACRE_SIDE_M), submit=False, disease="Test Red Rot",
			disease_pct=20)
		self.assertAlmostEqual(doc.expected_production_maund, doc.calc_area_acres * 1000 * 0.8, delta=0.1)

	def test_submit_needs_boundary(self):
		doc = _survey("91101-0000003-1", None, submit=False)
		with self.assertRaises(frappe.ValidationError):
			doc.submit()

	def test_land_split_validation(self):
		with self.assertRaises(frappe.ValidationError):
			_survey("91101-0000004-1", square(LAT, LNG, 50), submit=False, total_acres=2, acres=2, empty_land_acres=1)

	def test_village_must_be_in_circle(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc({"doctype": "Cane Survey", "season": _season(), "survey_for": "Competitor",
				"competitor_mill": "X", "circle": "Test Circle North", "village": "902-001", "variety": _variety(),
				"polygon": fc(square(LAT, LNG, 50))}).insert()

	def test_overlap_review_flow(self):
		base_lat = LAT + 0.003
		a = _survey("91101-0000005-1", square(base_lat, LNG, 100))
		self.assertEqual(frappe.db.get_value("Cane Survey", a.name, "overlap_status"), "Clear")
		b = _survey("91101-0000006-1", square(base_lat, LNG + 40 * m_lng(), 100))  # 60 % overlap
		review = frappe.get_doc("Survey Overlap Review", {"survey": b.name, "other_survey": a.name})
		self.assertAlmostEqual(review.overlap_pct, 60, delta=1)
		for name in (a.name, b.name):
			self.assertEqual(frappe.db.get_value("Cane Survey", name, "overlap_status"), "Under Review")
		review.status = "Rejected Survey"  # reject b
		review.save()
		self.assertEqual(frappe.db.get_value("Cane Survey", b.name, "docstatus"), 2)
		self.assertEqual(frappe.db.get_value("Cane Survey", b.name, "overlap_status"), "Rejected")
		self.assertEqual(frappe.db.get_value("Cane Survey", a.name, "overlap_status"), "Accepted")
		with self.assertRaises(frappe.ValidationError):
			review.reload()
			review.status = "Accepted"
			review.save()

	def test_small_overlap_is_tolerated(self):
		base_lat = LAT + 0.006
		a = _survey("91101-0000007-1", square(base_lat, LNG, 100))
		b = _survey("91101-0000008-1", square(base_lat, LNG + 97 * m_lng(), 100))  # 3 % overlap < 5 % tolerance
		self.assertFalse(frappe.db.exists("Survey Overlap Review", {"survey": b.name}))
		self.assertEqual(frappe.db.get_value("Cane Survey", b.name, "overlap_status"), "Clear")
		self.assertEqual(frappe.db.get_value("Cane Survey", a.name, "overlap_status"), "Clear")

	def test_cancel_closes_open_reviews(self):
		base_lat = LAT + 0.009
		a = _survey("91101-0000009-1", square(base_lat, LNG, 100))
		b = _survey("91101-0000010-1", square(base_lat + 20 * M_LAT, LNG, 100))
		b.reload()
		b.cancel()
		review = frappe.get_doc("Survey Overlap Review", {"survey": b.name})
		self.assertEqual(review.status, "Rejected Survey")
		self.assertEqual(frappe.db.get_value("Cane Survey", a.name, "overlap_status"), "Accepted")

	def test_attendance_geofence_and_hours(self):
		user = "test.surveyor@micromaxsugar.example"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "Test Surveyor", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		t_in = get_datetime(f"{nowdate()} 08:00:00")
		att = frappe.get_doc({"doctype": "Surveyor Attendance", "surveyor": user, "circle": "Test Circle North",
			"time_in": t_in, "latitude_in": LAT, "longitude_in": LNG,
			"time_out": add_to_date(t_in, hours=8), "latitude_out": LAT, "longitude_out": LNG}).insert()
		self.assertEqual((att.inside_geofence_in, att.status, att.working_hours), (1, "Present", 8))
		att.submit()
		with self.assertRaises(frappe.ValidationError):  # one attendance per day
			frappe.get_doc({"doctype": "Surveyor Attendance", "surveyor": user, "time_in": t_in, "latitude_in": LAT,
				"longitude_in": LNG}).insert()
		far = frappe.get_doc({"doctype": "Surveyor Attendance", "surveyor": user, "circle": "Test Circle North",
			"time_in": add_to_date(t_in, days=-1), "latitude_in": LAT + 0.5, "longitude_in": LNG,
			"time_out": add_to_date(t_in, days=-1, hours=2), "latitude_out": LAT, "longitude_out": LNG}).insert()
		self.assertEqual((far.inside_geofence_in, far.status), (0, "Out of Area"))
		half = frappe.get_doc({"doctype": "Surveyor Attendance", "surveyor": user, "circle": "Test Circle North",
			"time_in": add_to_date(t_in, days=-2), "latitude_in": LAT, "longitude_in": LNG,
			"time_out": add_to_date(t_in, days=-2, hours=3), "latitude_out": LAT, "longitude_out": LNG}).insert()
		self.assertEqual(half.status, "Half Day")


class TestSyncAPI(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		from sugarcane.setup.company import ensure_company

		ensure_company()
		_make_hierarchy()
		cls.device = frappe.get_doc({"doctype": "Survey Device", "android_id": "test-android-0001", "status": "Approved",
			"assigned_user": "Administrator"}).insert()

	def _upload(self, **payload):
		from sugarcane.api.v1 import survey

		with patch.object(survey, "current_device", return_value=self.device):
			return survey.upload(**{k: json.dumps(v) for k, v in payload.items()})

	def test_survey_upload_is_idempotent(self):
		item = {"uuid": "test-uuid-survey-1", "season": _season(), "survey_for": "Company", "grower": _grower("91101-0000020-1"),
			"circle": "Test Circle North", "village": "901-001", "variety": _variety(), "crop_land_acres": 1,
			"polygon": square(LAT + 0.02, LNG, ACRE_SIDE_M), "captured_at": str(now_datetime()),
			"photos": [{"uuid": "test-photo-1", "filename": "p1.jpg", "data": tiny_jpeg_b64(), "caption": "Field"}]}
		first = self._upload(surveys=[item])["surveys"][0]
		self.assertEqual(first["status"], "created", first)
		doc = frappe.get_doc("Cane Survey", first["name"])
		self.assertEqual(doc.docstatus, 1)
		self.assertEqual(doc.device, self.device.name)
		self.assertEqual(len(doc.photos), 1)
		self.assertAlmostEqual(doc.calc_area_acres, 1.0, delta=0.01)
		again = self._upload(surveys=[item])["surveys"][0]
		self.assertEqual((again["status"], again["name"]), ("duplicate", first["name"]))
		self.assertEqual(frappe.db.count("Cane Survey", {"survey_uuid": "test-uuid-survey-1"}), 1)

	def test_bad_item_does_not_stop_batch(self):
		good = {"uuid": "test-uuid-survey-2", "season": _season(), "survey_for": "Competitor", "competitor_mill": "Other Mill",
			"circle": "Test Circle North", "village": "901-001", "variety": _variety(),
			"polygon": square(LAT + 0.025, LNG, 60)}
		bad = {**good, "uuid": "test-uuid-survey-3", "village": "902-001"}  # village not in circle
		out = self._upload(surveys=[bad, good])["surveys"]
		self.assertEqual([o["status"] for o in out], ["error", "created"])
		self.assertIn("902-001", out[0]["message"])

	def test_attendance_check_in_then_out(self):
		t_in = get_datetime(f"{nowdate()} 07:30:00")
		item = {"uuid": "test-uuid-att-1", "time_in": str(t_in), "latitude_in": LAT, "longitude_in": LNG, "accuracy_in": 4}
		first = self._upload(attendance=[item])["attendance"][0]
		self.assertEqual(first["status"], "created", first)
		self.assertEqual(self._upload(attendance=[item])["attendance"][0]["status"], "duplicate")
		out = {**item, "time_out": str(add_to_date(t_in, hours=8)), "latitude_out": LAT, "longitude_out": LNG}
		second = self._upload(attendance=[out])["attendance"][0]
		self.assertEqual(second["status"], "updated")
		self.assertEqual(frappe.db.get_value("Surveyor Attendance", first["name"], "working_hours"), 8)

	def test_locations_skip_duplicates(self):
		pts = [{"uuid": f"test-loc-{i}", "logged_at": str(add_to_date(now_datetime(), minutes=i)), "latitude": LAT,
			"longitude": LNG + i * 0.0001, "accuracy": 5} for i in range(5)]
		self.assertEqual(self._upload(locations=pts)["locations"], {"received": 5, "inserted": 5})
		self.assertEqual(self._upload(locations=pts + pts[:1])["locations"], {"received": 6, "inserted": 0})

	def test_device_binding(self):
		from sugarcane.api.v1 import survey

		frappe.local.request = frappe._dict(headers={})
		with patch.object(frappe, "get_request_header", return_value="unknown-device"), self.assertRaises(frappe.PermissionError):
			survey.current_device()
		other_user = "test.other.surveyor@micromaxsugar.example"
		if not frappe.db.exists("User", other_user):
			u = frappe.get_doc({"doctype": "User", "email": other_user, "first_name": "Other", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		other = frappe.get_doc({"doctype": "Survey Device", "android_id": "test-android-0002", "status": "Approved",
			"assigned_user": other_user}).insert()
		with patch.object(frappe, "get_request_header", return_value=other.android_id), self.assertRaises(frappe.PermissionError):
			survey.current_device()
		with patch.object(frappe, "get_request_header", return_value=self.device.android_id):
			self.assertEqual(survey.current_device().name, self.device.name)

	def test_login_registers_pending_device(self):
		from frappe.utils.password import update_password

		from sugarcane.api.v1 import survey

		user = "test.login.surveyor@micromaxsugar.example"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "Login", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
			u.add_roles("Surveyor")
		update_password(user, "Test-pass-2026!")
		frappe.db.set_single_value("Sugar Settings", "auto_approve_devices", 0)
		frappe.local.request_ip = "127.0.0.1"  # the rate limiter keys on the caller's IP
		login = survey.login
		out = login(usr=user, pwd="Test-pass-2026!", android_id="test-android-login")
		self.assertEqual(out["status"], "Pending")
		self.assertNotIn("api_secret", out)
		frappe.db.set_value("Survey Device", {"android_id": "test-android-login"}, "status", "Approved")
		out = login(usr=user, pwd="Test-pass-2026!", android_id="test-android-login")
		self.assertEqual(out["status"], "Approved")
		self.assertTrue(out["api_key"] and out["api_secret"])
		with patch.object(frappe.db, "commit"), self.assertRaises(frappe.AuthenticationError):  # fail() commits its log
			login(usr=user, pwd="wrong", android_id="test-android-login")
		frappe.set_user("Administrator")

	def test_masters_delta(self):
		from sugarcane.api.v1 import survey

		with patch.object(survey, "current_device", return_value=self.device):
			full = survey.masters()
			self.assertTrue(full["full"])
			self.assertTrue(any(v["name"] == "901-001" for v in full["villages"]))
			delta = survey.masters(since=full["server_time"])
			self.assertFalse(delta["full"])
			self.assertFalse(any(v["name"] == "901-001" for v in delta["villages"]))
