"""Slips: gate token (A6), CPR (A4) and TPT bilty (A6), each with a Code 128 barcode of its number. A second print is
marked DUPLICATE n and counted on the document."""

import frappe
from frappe import _
from frappe.utils import cint, flt, format_datetime, formatdate, money_in_words, now_datetime

from sugarcane.calc.barcode import svg

KINDS = {
	"token": ("Cane Token", "Cane Token", "A6"),
	"gross": ("Cane Weighment", "Gross Weight Slip", "A6"),
	"cpr": ("Cane Purchase Receipt", "Cane Purchase Receipt (CPR)", "A4"),
	"bilty": ("TPT Bilty", "TPT Bilty (carriage slip)", "A6"),
}
MONEY = ("govt_rate", "govt_value", "road_cess_grower", "subsidy_rate", "subsidy", "additional_subsidy_rate", "additional_subsidy",
	"net_amount", "tpt_rate", "tpt_amount", "loan_deduction", "payable_cpr")
KG = ("gross_kg", "tare_kg", "net_kg", "binding_kg", "garbage_kg", "payable_kg")


def _fmt(d, kind):
	d.barcode = svg(d.name, module=1.2, height=34)
	d.dup = cint(d.print_count) + 1 if cint(d.print_count) else 0
	d.day_fmt = formatdate(d.get("crushing_day") or d.get("posting_date"), "dd MMM yyyy")
	if kind == "token":
		d.issued_fmt = format_datetime(d.issued_at, "dd MMM HH:mm")
	elif kind == "gross":
		d.gross_fmt, d.gross_at_fmt = f"{cint(d.gross_kg):,}", format_datetime(d.gross_at, "dd MMM HH:mm")
		d.tok = frappe.db.get_value("Cane Token", d.token, ["vehicle_type", "driver", "driver_name", "point_name", "source", "lane", "indent"],
			as_dict=True) or frappe._dict()
		d.photos = frappe.db.count("Vehicle Snapshot", {"token": d.token, "stage": "Gross", "photo": ("is", "set")})
	elif kind == "bilty":
		d.maund_fmt, d.rate_fmt, d.amount_fmt = f"{flt(d.payable_maund):,.3f}", f"{flt(d.tpt_rate):,.2f}", f"{flt(d.amount):,.2f}"
		d.amount_words = money_in_words(d.amount, "PKR")
		d.paid_fmt = format_datetime(d.paid_at, "dd MMM HH:mm") if d.paid_at else ""
	else:
		d.f = frappe._dict({k: f"{flt(d.get(k)):,.2f}" for k in MONEY} | {k: f"{cint(d.get(k)):,}" for k in KG})
		d.maund_fmt = f"{flt(d.payable_maund):,.3f}"
		d.posted_fmt = format_datetime(d.posted_at, "dd MMM HH:mm")
		d.amount_words = money_in_words(d.payable_cpr, "PKR")
	return d


def render(kind: str, names: list[str]) -> bytes:
	from frappe.utils.pdf import get_pdf

	doctype, title, size = KINDS[kind]
	docs = []
	for n in names:
		doc = frappe.get_doc(doctype, n)
		doc.check_permission("print")
		if doc.docstatus != 1 and not (kind == "gross" and doc.docstatus == 0):
			frappe.throw(_("{0} {1} is not submitted").format(_(doctype), n))
		d = _fmt(frappe._dict(doc.as_dict()), kind)
		d.title = title
		docs.append(d)
	html = frappe.render_template("sugarcane/templates/procurement/slip.html", {"docs": docs, "kind": kind,
		"company": frappe.db.get_single_value("Sugar Settings", "company") or "", "printed_at": now_datetime().strftime("%d %b %Y %H:%M"),
		"printed_by": frappe.utils.get_fullname(frappe.session.user)})
	pdf = get_pdf(html, {"page-size": size, "margin-top": "5mm", "margin-bottom": "5mm", "margin-left": "5mm", "margin-right": "5mm"})
	for d in docs:
		frappe.db.set_value(doctype, d.name, "print_count", cint(d.print_count) + 1, update_modified=False)
	return pdf
