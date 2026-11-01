"""CCTV for the gate and weighbridge screens: camera list, live frame, and the photos saved for a token."""

import frappe
from frappe import _

from sugarcane.cane_procurement import procurement as p
from sugarcane.weighbridge import cctv

VIEW_ROLES = p.GATE_ROLES | p.WEIGH_ROLES | {"Yard Supervisor", "Cane Manager", "MIS Viewer"}


@frappe.whitelist(methods=["GET"])
def cameras(place: str = "Mill Gate", terminal: str | None = None, depot: str | None = None) -> list:
	p.need(VIEW_ROLES, _("see the cameras"))
	return cctv.cameras(place, terminal, depot)


@frappe.whitelist(methods=["GET"])
def live(camera: str, state: str = "loaded", t: str | None = None):
	"""The camera's current picture as image/jpeg (the screen reloads it every second or two)."""
	p.need(VIEW_ROLES, _("see the cameras"))
	try:
		content = cctv.frame(camera, "empty" if state == "empty" else "loaded")
	except Exception as e:
		frappe.local.response.http_status_code = 503
		frappe.local.response.message = str(e)
		return
	frappe.local.response.filename = f"{camera}.jpg"
	frappe.local.response.filecontent = content
	frappe.local.response.content_type = "image/jpeg"
	frappe.local.response.display_content_as = "inline"
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["GET"])
def snapshots(token: str) -> dict:
	frappe.has_permission("Cane Token", "read", token, throw=True)
	return cctv.snapshots(token)
