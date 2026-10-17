"""Printed indents: 4 per A4 page, each with a Code 128 barcode of its number. Only authorized indents print. The first
print marks them Printed; a reprint (DUPLICATE on the slip) needs a Cane Manager / Cane Admin and a reason, and is logged."""

import frappe
from frappe import _
from frappe.utils import cint, formatdate, now_datetime

from sugarcane.calc.barcode import svg

REPRINT_ROLES = {"System Manager", "Cane Manager", "Cane Admin"}
PRINT_ROLES = REPRINT_ROLES | {"Indent Clerk", "Circle Officer"}
FIELDS = ["name", "season", "status", "docstatus", "grower", "grower_name", "father_name", "cnic", "passbook_no", "circle",
	"village", "village_name", "variety", "crop_type", "load_maund", "source", "indent_date", "valid_from", "valid_to",
	"authorized_by", "print_count", "batch"]


def _chunks(items, n):
	return [items[i:i + n] for i in range(0, len(items), n)]


def render(indents: list) -> bytes:
	from frappe.utils.pdf import get_pdf

	company = frappe.db.get_single_value("Sugar Settings", "company") or ""
	for i in indents:
		i.barcode = svg(i.name, module=1.25, height=38)
		i.indent_date_fmt, i.valid_from_fmt, i.valid_to_fmt = (formatdate(i.indent_date, "dd MMM yyyy"),
			formatdate(i.valid_from, "dd MMM"), formatdate(i.valid_to, "dd MMM yyyy"))
		i.authorized_by_name = frappe.utils.get_fullname(i.authorized_by) if i.authorized_by else ""
		i.load_fmt = f"{float(i.load_maund or 0):,.0f}"
	pages = [_chunks(page + [None] * (4 - len(page)), 2) for page in _chunks(indents, 4)]
	html = frappe.render_template("sugarcane/templates/indent/indents.html", {"pages": pages, "company": company,
		"printed_at": now_datetime().strftime("%d %b %Y %H:%M")})
	return get_pdf(html, {"page-size": "A4", "margin-top": "6mm", "margin-bottom": "6mm", "margin-left": "6mm", "margin-right": "6mm"})


def print_indents(names: list[str], reason: str | None = None) -> tuple[bytes, dict]:
	roles = set(frappe.get_roles())
	if not PRINT_ROLES & roles:
		frappe.throw(_("You are not allowed to print indents"), frappe.PermissionError)
	if not names:
		frappe.throw(_("Choose the indents to print"))
	rows = frappe.get_list("Cane Indent", filters={"name": ["in", names]}, fields=FIELDS, order_by="indent_date asc, name asc",
		limit_page_length=0)
	if len(rows) != len(set(names)):
		frappe.throw(_("Some indents were not found or you can't see them"))
	bad = [r.name for r in rows if r.docstatus != 1 or r.status not in ("Authorized", "Printed")]
	if bad:
		frappe.throw(_("Only authorized indents can be printed: {0}").format(", ".join(bad[:10]) + ("…" if len(bad) > 10 else "")))
	reprints = [r for r in rows if cint(r.print_count)]
	if reprints:
		if not REPRINT_ROLES & roles:
			frappe.throw(_("{0} indent(s) were printed before; a reprint needs a Cane Manager").format(len(reprints)), frappe.PermissionError)
		if not (reason or "").strip():
			frappe.throw(_("{0} indent(s) were printed before — give a reason for the reprint").format(len(reprints)))
	pdf = render(rows)
	stamp, user = now_datetime(), frappe.session.user
	for r in rows:
		frappe.db.set_value("Cane Indent", r.name, {"print_count": cint(r.print_count) + 1, "status": "Printed",
			**({} if r.print_count else {"printed_on": stamp})}, update_modified=False)
	for r in reprints:
		frappe.get_doc("Cane Indent", r.name).add_comment("Info", _("Reprinted (copy {0}): {1}").format(cint(r.print_count) + 1,
			frappe.utils.escape_html(reason)))
	for batch in {r.batch for r in rows if r.batch}:
		left = frappe.db.count("Cane Indent", {"batch": batch, "docstatus": 1, "status": "Authorized"})
		frappe.db.set_value("Indent Batch", batch, {"print_count": cint(frappe.db.get_value("Indent Batch", batch, "print_count")) + 1,
			"last_printed_by": user, "last_printed_on": stamp, **({"status": "Printed"} if not left else {})}, update_modified=False)
	return pdf, {"printed": len(rows), "reprinted": len(reprints)}
