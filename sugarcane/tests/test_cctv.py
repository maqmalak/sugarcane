"""CCTV at the gate and weighbridge: demo frames, snapshots per stage, the tare "same vehicle" check, the weighbridge scanner
(indent / gross slip / vehicle no. → token) and the gross slip."""

import frappe
from frappe.utils import add_to_date, get_datetime

from sugarcane.api.v1 import procurement as api
from sugarcane.cane_procurement import procurement as p
from sugarcane.cane_procurement.printing import render
from sugarcane.tests.test_procurement import TERMINAL, ProcurementBase, _reading
from sugarcane.weighbridge import cctv

PIC = "/assets/sugarcane/demo_cctv/{}_{}.jpg"


def _cams():
	for name, place, view, terminal in (("TEST GATE · LEFT", "Mill Gate", "Left", None), ("TEST WB · LEFT", "Weighbridge", "Left", TERMINAL),
			("TEST WB · RIGHT", "Weighbridge", "Right", TERMINAL), ("TEST WB · DOWN", "Weighbridge", "Rear", TERMINAL)):
		if not frappe.db.exists("CCTV Camera", name):
			frappe.get_doc({"doctype": "CCTV Camera", "camera_name": name, "place": place, "view": view, "terminal": terminal,
				"is_active": 1, "take_snapshots": 1, "auth": "None",
				**({} if name.endswith("DOWN") else {"demo_loaded": PIC.format(view.lower(), "loaded"),
					"demo_empty": PIC.format(view.lower(), "empty")})}).insert()


class TestCctv(ProcurementBase):
	CNIC = "91409"
	LAT_OFFSET = 0.95

	def test_demo_frame_looks_like_a_camera(self):
		_cams()
		jpg = cctv.frame("TEST WB · LEFT", "empty")
		self.assertEqual(jpg[:2], b"\xff\xd8")
		from io import BytesIO

		from PIL import Image

		self.assertEqual(Image.open(BytesIO(jpg)).size, (1280, 720))

	def test_snapshots_body_check_scan_and_gross_slip(self):
		_cams()
		ind = self.indents[0]
		tok = self._token(ind)
		gate = cctv.snap("Gate", tok.name, tok.vehicle_no, "Mill Gate")
		self.assertTrue(frappe.db.get_value("Vehicle Snapshot", {"name": ("in", gate), "view": "Left"}, "photo"))

		at = get_datetime(tok.issued_at)
		_reading(15000, at)
		g = p.capture(tok.name, "Gross", terminal=TERMINAL, at=add_to_date(at, minutes=10))
		rows = cctv.snap("Gross", tok.name, tok.vehicle_no, "Weighbridge", terminal=TERMINAL, weighment=g["weighment"])
		self.assertEqual(len(rows), 3)
		down = frappe.db.get_value("Vehicle Snapshot", {"name": ("in", rows), "view": "Rear"}, ["photo", "error"], as_dict=True)
		self.assertFalse(down.photo)  # camera without URL or demo picture: recorded, not fatal
		self.assertTrue(down.error)
		self.assertEqual(set(cctv.snapshots(tok.name)), {"Gate", "Gross"})

		# The weighbridge scanner finds the token from the indent, the gross slip and the vehicle no.
		self.assertEqual(api.scan(ind.name)["token"], tok.name)
		self.assertEqual(api.scan(g["weighment"])["token"], tok.name)
		self.assertEqual(api.scan(tok.vehicle_no)["token"], tok.name)
		self.assertTrue(render("gross", [g["weighment"]]).startswith(b"%PDF"))

		# Live tare: refused until the weighman ticks "same vehicle"; then saved with the tick and tare photos.
		_reading(4000)
		with self.assertRaises(frappe.ValidationError):
			p.capture(tok.name, "Tare", terminal=TERMINAL)
		out = p.capture(tok.name, "Tare", terminal=TERMINAL, body_match=1)
		self.assertTrue(out["cpr"])
		self.assertEqual(frappe.db.get_value("Cane Weighment", out["weighment"], "tare_body_match"), 1)
		self.assertTrue(frappe.db.exists("Vehicle Snapshot", {"token": tok.name, "stage": "Tare", "view": "Left", "photo": ("is", "set")}))
