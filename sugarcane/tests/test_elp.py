"""ELP (Electronic Loading Point): photo quality, geofence, indent and vehicle checks at registration, gate arrival at
the mill, the audit team's verdict (LP verified, indent used), the verification report, the event log and permissions."""

import base64
import io

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime

from sugarcane.tests.test_indenting import NORTH, START, END, _range, _rule, _setup_season
from sugarcane.tests.test_masters import _make_hierarchy
from sugarcane.tests.test_survey import LAT, LNG, _survey, square

LP = "Test LP North"
MILL = (32.083, 72.671)
VIEWS = ("Number Plate", "Indent", "Driver", "Body Left")


def jpeg(kind="sharp") -> str:
	from PIL import Image, ImageDraw, ImageFilter

	img = Image.new("RGB", (320, 240), (150, 150, 150))
	d = ImageDraw.Draw(img)
	for x in range(0, 320, 16):
		for y in range(0, 240, 16):
			if (x // 16 + y // 16) % 2:
				d.rectangle((x, y, x + 15, y + 15), fill=(30, 30, 30))
			else:
				d.rectangle((x, y, x + 15, y + 15), fill=(230, 230, 230))
	if kind == "blurred":
		img = img.filter(ImageFilter.GaussianBlur(12))
	elif kind == "dark":
		img = Image.new("RGB", (320, 240), (8, 8, 8))
	buf = io.BytesIO()
	img.save(buf, "JPEG", quality=90)
	return base64.b64encode(buf.getvalue()).decode()


def _lp():
	if not frappe.db.exists("Cane Source", "Test Check Post North"):
		frappe.get_doc({"doctype": "Cane Source", "source_name": "Test Check Post North", "source_type": "Check Post",
			"latitude": LAT + 0.5, "longitude": LNG + 0.01, "is_active": 1}).insert()
	if not frappe.db.exists("Loading Point", LP):
		frappe.get_doc({"doctype": "Loading Point", "loading_point_name": LP, "source": "Test Check Post North", "circle": NORTH,
			"latitude": LAT + 0.5, "longitude": LNG, "geofence_radius_m": 150, "is_active": 1}).insert()
	frappe.db.set_value("Loading Point", LP, "journey_to_mill_min", 90)
	return LP


class TestELP(IntegrationTestCase):
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
		frappe.db.set_single_value("Sugar Settings", {"mill_latitude": MILL[0], "mill_longitude": MILL[1]})
		frappe.clear_document_cache("Sugar Settings", "Sugar Settings")
		self.season = _setup_season()
		for dt in ("LP Vehicle Registration", "Cane Indent", "Indent Batch", "Indent Quota Rule", "Indent Range"):
			for name in frappe.get_all(dt, filters={"season": self.season}, pluck="name"):
				frappe.db.delete(dt, {"name": name})
		_range(self.season)
		_rule(self.season)
		_lp()
		# a fresh grower and field per test: a second survey on the same spot would be held for an overlap review
		n = sorted(m for m in dir(self) if m.startswith("test_")).index(self._testMethodName)
		s = _survey(f"91301-00000{n:02d}-1", square(LAT + 0.42 + n * 0.01, LNG, 100))
		out = generator.generate(self.season, START, END, NORTH, today=START)
		api.authorize_batch(next(b["name"] for b in out["batches"] if b["circle"] == NORTH))
		self.indents = frappe.get_all("Cane Indent", filters={"season": self.season, "grower": s.grower, "docstatus": 1},
			fields=["name", "indent_date"], order_by="indent_date asc")
		self.assertGreaterEqual(len(self.indents), 2)

	def _item(self, indent, **kw):
		p = frappe.get_doc("Loading Point", LP)
		at = kw.pop("at", f"{indent.indent_date} 08:00:00")
		lat, lng = kw.pop("lat", p.latitude + 0.0002), kw.pop("lng", p.longitude)
		return {"uuid": frappe.generate_hash(length=16), "point_type": "Loading Point", "loading_point": LP, "indent": indent.name,
			"vehicle_no": kw.pop("vehicle_no", "TST-1234"), "latitude": lat, "longitude": lng, "registered_at": at, "serial_no": "S1",
			"photos": kw.pop("photos", [{"view": v, "data": jpeg(), "latitude": lat, "longitude": lng} for v in VIEWS]), **kw}

	# ------------------------------------------------------------ photo quality
	def test_image_quality(self):
		from sugarcane.vehicle_tracking.elp import image_quality

		self.assertTrue(image_quality(base64.b64decode(jpeg()))["ok"])
		blurred = image_quality(base64.b64decode(jpeg("blurred")))
		self.assertFalse(blurred["ok"])
		self.assertIn("blurred", blurred["problems"])
		dark = image_quality(base64.b64decode(jpeg("dark")))
		self.assertIn("too dark", dark["problems"])
		self.assertFalse(image_quality(b"not an image")["ok"])

	# ------------------------------------------------------------ registration
	def test_registration_rules(self):
		from sugarcane.vehicle_tracking.elp import register

		i0 = self.indents[0]
		with self.assertRaises(frappe.ValidationError):  # outside the loading point
			register(self._item(i0, lat=LAT + 0.6))
		with self.assertRaises(frappe.ValidationError):  # a required view missing
			register(self._item(i0, photos=[{"view": "Number Plate", "data": jpeg()}]))
		bad = [{"view": v, "data": jpeg("blurred" if v == "Driver" else "sharp")} for v in VIEWS]
		with self.assertRaises(frappe.ValidationError):  # blurred driver photo
			register(self._item(i0, photos=bad))
		with self.assertRaises(frappe.ValidationError):  # indent not valid on that day
			register(self._item(i0, at="2041-01-01 08:00:00"))

		item = self._item(i0)
		name, status = register(item)
		self.assertEqual(status, "created")
		doc = frappe.get_doc("LP Vehicle Registration", name)
		self.assertEqual(doc.status, "In Transit")
		self.assertTrue(doc.inside_geofence)
		self.assertEqual(get_datetime(doc.expected_arrival), add_to_date(get_datetime(doc.registered_at), minutes=90))
		self.assertEqual(len([p for p in doc.photos if p.photo]), 4)
		self.assertEqual(register(item), (name, "duplicate"))  # same uuid again
		with self.assertRaises(frappe.ValidationError):  # indent already on a load
			register(self._item(i0, vehicle_no="TST-9999"))
		with self.assertRaises(frappe.ValidationError):  # vehicle already on the road
			register(self._item(self.indents[1]))
		self.assertTrue(frappe.db.exists("ELP Event Log", {"registration": name, "event": "Registered"}))

	def test_blacklisted_vehicle(self):
		from sugarcane.vehicle_tracking.elp import register

		if not frappe.db.exists("Sugar Vehicle", {"registration_no": "TST-BLK"}):
			if not frappe.db.exists("Vehicle Type", "Test Trolley"):
				frappe.get_doc({"doctype": "Vehicle Type", "vehicle_type_name": "Test Trolley", "is_active": 1}).insert()
			frappe.get_doc({"doctype": "Sugar Vehicle", "registration_no": "TST-BLK", "vehicle_type": "Test Trolley", "is_blacklisted": 1,
				"blacklist_reason": "Fraud"}).insert()
		with self.assertRaises(frappe.ValidationError):
			register(self._item(self.indents[0], vehicle_no="tst blk"))

	# ------------------------------------------------------------ gate & audit
	def test_arrive_verify_report(self):
		from sugarcane.vehicle_tracking import elp
		from sugarcane.vehicle_tracking.report_pdf import verification_pdf

		i0 = self.indents[0]
		name, _s = elp.register(self._item(i0))
		with self.assertRaises(frappe.ValidationError):  # a gate phone far from the mill
			elp.arrive(name, [{"view": "Number Plate", "data": jpeg()}], MILL[0] + 0.2, MILL[1])
		with self.assertRaises(frappe.ValidationError):  # can't verify before arrival
			elp.decide(name, True)
		doc = elp.arrive(name, [{"view": v, "data": jpeg()} for v in VIEWS[:3]], MILL[0] + 0.0005, MILL[1],
			arrived_at=f"{i0.indent_date} 09:45:00")
		self.assertEqual(doc.status, "Arrived")
		self.assertEqual(doc.transit_minutes, 105)
		self.assertEqual(doc.late_minutes, 15)
		with self.assertRaises(frappe.ValidationError):  # rejecting needs a reason
			elp.decide(name, False)
		doc = elp.decide(name, True)
		self.assertEqual(doc.status, "Accepted")
		self.assertTrue(doc.lp_verified)
		self.assertEqual(frappe.db.get_value("Cane Indent", i0.name, ["status", "token"]), ("Used", name))
		pdf = verification_pdf(name)
		self.assertTrue(pdf.startswith(b"%PDF"))
		self.assertEqual(frappe.db.get_value("LP Vehicle Registration", name, "report_print_count"), 1)
		events = set(frappe.get_all("ELP Event Log", filters={"registration": name}, pluck="event"))
		self.assertTrue({"Registered", "Arrived", "Accepted", "Report Printed"} <= events)

	def test_roles(self):
		from sugarcane.vehicle_tracking import elp

		name, _s = elp.register(self._item(self.indents[0]))
		gate = "test.gate@micromaxsugar.example"
		if not frappe.db.exists("User", gate):
			u = frappe.get_doc({"doctype": "User", "email": gate, "first_name": "Test Gate", "send_welcome_email": 0})
			u.flags.no_welcome_mail = True
			u.insert()
		frappe.get_doc("User", gate).add_roles("Token Clerk")
		frappe.set_user(gate)
		try:
			elp.arrive(name, [{"view": "Number Plate", "data": jpeg()}])  # gate staff record the arrival …
			with self.assertRaises(frappe.PermissionError):
				elp.decide(name, True)  # … but only the audit team decides
		finally:
			frappe.set_user("Administrator")

	def test_board_and_mine(self):
		from sugarcane.api.v1 import elp as api
		from sugarcane.vehicle_tracking import elp

		elp.register(self._item(self.indents[0]))
		out = api.board(days=30000)
		self.assertGreaterEqual(out["counts"].get("In Transit", 0), 1)
		self.assertTrue(any(r.vehicle_no == "TST-1234" for r in api.mine(days=30000)))
