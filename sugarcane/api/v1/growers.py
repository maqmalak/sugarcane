"""Grower lookups for the React app. frappe.get_list applies DocPerms and the user's circle User Permissions."""

import frappe
from frappe import _
from frappe.utils import cint

FIELDS = ["name", "grower_name", "father_name", "cnic", "mobile", "passbook_no", "circle", "village", "village_name",
	"filer_status", "bank_name", "iban", "disabled", "grower_photo"]


@frappe.whitelist(methods=["GET"])
def search(q: str | None = None, circle: str | None = None, start: int = 0, page_length: int = 25, with_photo: int = 0) -> dict:
	filters = {"disabled": 0}
	if circle:
		filters["circle"] = circle
	if cint(with_photo):
		filters["grower_photo"] = ["is", "set"]
	or_filters = None
	q = (q or "").strip()
	if q:
		like = f"%{q}%"
		or_filters = [["name", "like", like], ["grower_name", "like", like], ["cnic", "like", like],
			["passbook_no", "like", like], ["father_name", "like", like], ["village_name", "like", like]]
	page_length = min(max(cint(page_length), 1), 200)
	rows = frappe.get_list("Grower", fields=FIELDS, filters=filters, or_filters=or_filters, order_by="name asc",
		limit_start=cint(start), limit_page_length=page_length)
	total = len(frappe.get_list("Grower", filters=filters, or_filters=or_filters, pluck="name", limit_page_length=0))
	return {"rows": rows, "total": total}


@frappe.whitelist(methods=["GET"])
def photos(grower: str) -> dict:
	"""The grower's profile photo and every photo from their surveys (grower photos + field photos), newest first,
	each with where and when it was taken and the survey it belongs to."""
	doc = frappe.get_doc("Grower", grower)
	doc.check_permission("read")
	surveys = frappe.get_list("Cane Survey", filters={"grower": grower, "docstatus": ["<", 2]},
		fields=["name", "survey_date", "village", "grower_photo", "grower_photo_latitude", "grower_photo_longitude",
			"grower_photo_taken_at"], order_by="survey_date desc", limit_page_length=0)
	out = []
	for s in surveys:
		if s.grower_photo:
			out.append({"url": s.grower_photo, "kind": "grower", "caption": _("Grower photo"), "survey": s.name, "date": str(s.survey_date),
				"latitude": s.grower_photo_latitude, "longitude": s.grower_photo_longitude,
				"taken_at": str(s.grower_photo_taken_at) if s.grower_photo_taken_at else None})
	if surveys:
		for p in frappe.get_all("Cane Survey Photo", filters={"parenttype": "Cane Survey", "parent": ["in", [s.name for s in surveys]]},
				fields=["parent", "photo", "caption", "latitude", "longitude", "taken_at"], order_by="taken_at desc"):
			if p.photo:
				out.append({"url": p.photo, "kind": "field", "caption": p.caption or _("Field photo"), "survey": p.parent, "date": None,
					"latitude": p.latitude, "longitude": p.longitude, "taken_at": str(p.taken_at) if p.taken_at else None})
	return {"grower": grower, "grower_name": doc.grower_name, "profile_photo": doc.grower_photo, "photos": out,
		"surveys": len(surveys)}
