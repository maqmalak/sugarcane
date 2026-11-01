"""TPT cash counters (Cash Counter 1, 2 …): session, strong room cash in / out, basket payment of bilties, counted close;
and the payee displays at the counters and weighbridges."""

import json

import frappe
from frappe import _

from sugarcane.api.v1.procurement import BILTY_FIELDS
from sugarcane.cane_procurement import counter as c
from sugarcane.cane_procurement import procurement as p

VIEW = p.CASH_ROLES | {"Cane Manager", "Cane Accountant", "MIS Viewer"}


def _list(v):
	return json.loads(v) if isinstance(v, str) and v.strip().startswith("[") else (v or [])


@frappe.whitelist(methods=["GET"])
def status() -> dict:
	p.need(VIEW, _("see the cash counters"))
	mine = c.open_session_of()
	busy = {r.counter: r for r in frappe.get_all("Cash Counter Session", filters={"status": "Open"},
		fields=["name", "counter", "cashier", "opened_at", "expected_balance"])}
	counters = []
	for k in c.counters():
		last = frappe.db.get_value("Cash Counter Session", {"counter": k.name, "status": "Closed"}, ["name", "counted_balance", "closed_at"],
			as_dict=True, order_by="closed_at desc")
		counters.append({**k, "open": busy.get(k.name), "last_close": last})
	return {"session": c.refresh(mine) if mine else None, "counters": counters, "can_pay": bool(p.CASH_ROLES & set(frappe.get_roles())),
		"denominations": list(c.DENOMS), "shifts": list(c.SHIFTS), "shift_now": c.shift_now()}


@frappe.whitelist(methods=["POST"])
def open_counter(counter: str, shift: str | None = None) -> dict:
	return c.refresh(c.open_session(counter, shift or None))


@frappe.whitelist(methods=["POST"])
def move(session: str, movement_type: str, amount, reference: str | None = None) -> dict:
	return c.move(session, movement_type, amount, reference)


@frappe.whitelist(methods=["GET"])
def bilty(q: str) -> dict:
	"""Scanner → one bilty (by bilty no. or its CPR) for the basket."""
	p.need(VIEW, _("see bilties"))
	q = (q or "").strip().upper()
	name = frappe.db.get_value("TPT Bilty", q) or frappe.db.get_value("TPT Bilty", {"cpr": q, "docstatus": 1}) \
		or frappe.db.get_value("TPT Bilty", {"token": q, "docstatus": 1})
	if not name:
		frappe.throw(_("No bilty for {0}").format(frappe.bold(q)), title=_("Not found"))
	return frappe.db.get_value("TPT Bilty", name, BILTY_FIELDS + ["docstatus"], as_dict=True)


@frappe.whitelist(methods=["POST"])
def pay(session: str, bilties, received_by=None, received_by_cnic=None, payment_mode="Cash", wallet_number=None,
		wallet_txn_id=None) -> dict:
	return c.pay_many(session, _list(bilties), received_by, received_by_cnic, payment_mode, wallet_number, wallet_txn_id)


@frappe.whitelist(methods=["POST"])
def close(session: str, denominations, note: str | None = None) -> dict:
	return c.close(session, _list(denominations), note)


@frappe.whitelist(methods=["GET"])
def sessions(counter: str | None = None, limit: int = 20) -> list:
	p.need(VIEW, _("see counter sessions"))
	return frappe.get_all("Cash Counter Session", filters={"counter": counter} if counter else {}, fields=["name", "counter", "cashier",
		"status", "opened_at", "closed_at", "opening_balance", "received_total", "returned_total", "cash_paid_total", "cash_paid_count",
		"jazzcash_total", "jazzcash_count", "expected_balance", "counted_balance", "difference"], order_by="opened_at desc", limit=int(limit))


# ---------------------------------------------------------------- payee displays
@frappe.whitelist(methods=["POST"])
def display_push(screen: str, state=None):
	p.need(p.CASH_ROLES | p.WEIGH_ROLES, _("drive a display"))
	c.display_push(screen, json.loads(state) if isinstance(state, str) else (state or {}))
	return {"ok": True}


@frappe.whitelist(methods=["GET"])
def display(screen: str) -> dict:
	p.need(VIEW | p.WEIGH_ROLES | p.GATE_ROLES, _("see the display"))
	return c.display_get(screen)


# ---------------------------------------------------------------- daily cashier summary
@frappe.whitelist(methods=["GET"])
def daily_summary(day: str | None = None) -> dict:
	p.need(VIEW, _("see the cashier summary"))
	return c.daily_summary(day or frappe.utils.today())


@frappe.whitelist()
def daily_summary_pdf(day: str | None = None):
	from frappe.utils.pdf import get_pdf

	p.need(VIEW, _("print the cashier summary"))
	data = c.daily_summary(day or frappe.utils.today())
	html = frappe.render_template("sugarcane/templates/procurement/cashier_summary.html", {**data,
		"printed_at": frappe.utils.now_datetime().strftime("%d %b %Y %H:%M"), "printed_by": frappe.utils.get_fullname(frappe.session.user)})
	frappe.local.response.filename = f"Cashier summary {data['day']}.pdf"
	frappe.local.response.filecontent = get_pdf(html, {"page-size": "A4", "orientation": "Landscape", "margin-top": "8mm",
		"margin-bottom": "8mm", "margin-left": "8mm", "margin-right": "8mm"})
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["GET"])
def short_excess(from_date: str, to_date: str, cashier: str | None = None) -> dict:
	p.need(VIEW, _("see counter shortages"))
	return c.short_excess(from_date, to_date, cashier or None)


@frappe.whitelist(methods=["GET"])
def shift_report(session: str) -> dict:
	p.need(VIEW, _("see the shift report"))
	return c.session_detail(session)


@frappe.whitelist()
def shift_report_pdf(session: str):
	"""X (open) / Z (closed) cashier shift report, A4."""
	from frappe.utils.pdf import get_pdf

	p.need(VIEW, _("print the shift report"))
	s = c.session_detail(session)
	html = frappe.render_template("sugarcane/templates/procurement/cashier_shift.html", {"s": s,
		"printed_at": frappe.utils.now_datetime().strftime("%d %b %Y %H:%M"), "printed_by": frappe.utils.get_fullname(frappe.session.user)})
	frappe.local.response.filename = f"{s.report} report {s.counter} {s.name}.pdf"
	frappe.local.response.filecontent = get_pdf(html, {"page-size": "A4", "margin-top": "10mm", "margin-bottom": "10mm",
		"margin-left": "10mm", "margin-right": "10mm"})
	frappe.local.response.type = "download"
