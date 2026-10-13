"""Grower lookups for the React app. frappe.get_list applies DocPerms and the user's circle User Permissions."""

import frappe
from frappe.utils import cint

FIELDS = ["name", "grower_name", "father_name", "cnic", "mobile", "passbook_no", "circle", "village", "village_name",
	"filer_status", "bank_name", "iban", "disabled"]


@frappe.whitelist(methods=["GET"])
def search(q: str | None = None, circle: str | None = None, start: int = 0, page_length: int = 25) -> dict:
	filters = {"disabled": 0}
	if circle:
		filters["circle"] = circle
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
