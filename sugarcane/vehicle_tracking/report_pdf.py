"""The ELP verification report (PDF): loading-point and gate photos side by side, registration vs arrival details,
and the audit team's verdict. Photos are private files, so they are embedded (wkhtmltopdf can't fetch them)."""

import base64

import frappe
from frappe import _
from frappe.utils import cint, format_datetime, now_datetime

VIEW_ORDER = ("Number Plate", "Driver", "Body Left", "Body Right", "Front", "Indent", "Back", "Chassis No.", "LP Board", "Load", "Other")
PER_ROW = 3


def _src(url):
	if not url:
		return None
	try:
		f = frappe.get_doc("File", {"file_url": url})
		return "data:image/jpeg;base64," + base64.b64encode(f.get_content()).decode()
	except Exception:
		return None


def _pick(photos, stage, views):
	rows = sorted([p for p in photos if p.stage == stage], key=lambda p: VIEW_ORDER.index(p.view) if p.view in VIEW_ORDER else 99)
	if views:  # same views on both rows when possible, so they line up for comparison
		rows = sorted(rows, key=lambda p: views.index(p.view) if p.view in views else 99)
	out = [{"src": _src(p.photo), "view": p.view, "when": format_datetime(p.taken_at, "dd-MM-yyyy HH:mm") if p.taken_at else ""}
		for p in rows[:PER_ROW]]
	return out + [None] * (PER_ROW - len(out))


def verification_pdf(name: str) -> bytes:
	from frappe.utils.pdf import get_pdf

	from sugarcane.vehicle_tracking import elp

	doc = frappe.get_doc("LP Vehicle Registration", name)
	doc.check_permission("read")
	if not (elp.AUDIT_ROLES | elp.GATE_ROLES | {"MIS Viewer"}) & set(frappe.get_roles()):
		frappe.throw(_("Not allowed"), frappe.PermissionError)
	lp = _pick(doc.photos, "Loading Point", [])
	gate = _pick(doc.photos, "Gate", [p["view"] for p in lp if p])
	code = doc.loading_point or doc.depot
	point_code = code if code == doc.point_name else f"{code} - {doc.point_name}"
	gps = lambda a, b: f"{a:.7f}, {b:.7f}" if a and b else "—"  # noqa: E731
	s = frappe.get_cached_doc("Sugar Settings")
	rows = [
		(_("Registration Number"), doc.name, doc.name),
		(_("Vehicle Number"), doc.vehicle_no, doc.vehicle_no if doc.arrived_at else "—"),
		(_("Haulage Name"), doc.vehicle_type or "—", doc.vehicle_type or "—"),
		(_("LP Code"), point_code, _("Gate")),
		(_("Date"), format_datetime(doc.registered_at, "dd-MM-yyyy"), format_datetime(doc.arrived_at, "dd-MM-yyyy") if doc.arrived_at else "—"),
		(_("Time"), format_datetime(doc.registered_at, "HH:mm:ss"), format_datetime(doc.arrived_at, "HH:mm:ss") if doc.arrived_at else "—"),
		(_("Serial Number"), doc.serial_no or "—", doc.arrival_serial_no or "—"),
		(_("GPS Coordinates Actual"), gps(doc.latitude, doc.longitude), gps(doc.arrival_latitude, doc.arrival_longitude)),
		(_("GPS Coordinates as per Parameters"), gps(doc.point_latitude, doc.point_longitude), gps(s.mill_latitude, s.mill_longitude)),
		(_("Distance from Point / Inside Geofence"), f"{int(doc.distance_from_point_m or 0)} m · {'Yes' if doc.inside_geofence else 'No'}", "—"),
		(_("Tower Id"), doc.cell_id or "—", doc.arrival_cell_id or "—"),
		(_("Journey Time"), _("Standard {0} min · average {1} min").format(
			frappe.db.get_value(doc.point_type, doc.loading_point or doc.depot, "journey_to_mill_min") or "—", doc.average_minutes or "—"),
			_("{0} min{1}").format(doc.transit_minutes or "—", _(" ({0} min late)").format(doc.late_minutes) if doc.late_minutes else "")),
	]
	copy = cint(doc.report_print_count) + 1
	html = frappe.render_template("sugarcane/templates/elp/verification.html", {"r": doc, "company": s.company, "lp_photos": lp,
		"gate_photos": gate, "rows": rows, "verified_by": frappe.utils.get_fullname(doc.decided_by) if doc.decided_by else None,
		"verified_at": format_datetime(doc.decided_at, "dd-MM-yyyy HH:mm") if doc.decided_at else None,
		"printed_at": now_datetime().strftime("%d-%m-%Y %H:%M"), "printed_by": frappe.utils.get_fullname(frappe.session.user), "copy": copy})
	pdf = get_pdf(html, {"page-size": "A4"})
	frappe.db.set_value("LP Vehicle Registration", name, "report_print_count", copy, update_modified=False)
	elp.log("Report Printed", doc, _("Copy {0}").format(copy))
	return pdf
