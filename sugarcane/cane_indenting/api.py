"""Indenting API for the React app (and the desk buttons): preview / generate, authorize or reject a batch, print, look up
an indent by number or barcode, cancel, and the numbers for the Indenting insights page."""

import json
from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from sugarcane.cane_indenting import generator
from sugarcane.calc.barcode import svg

AUTHORIZERS = {"System Manager", "Cane Manager", "Cane Admin"}


def _season(season=None):
	season = season or frappe.db.get_single_value("Sugar Settings", "active_season")
	if not season:
		frappe.throw(_("Set an active crushing season in Sugar Settings first"))
	return season


def _list(value):
	return json.loads(value) if isinstance(value, str) and value.startswith("[") else (value if isinstance(value, list) else [value])


@frappe.whitelist(methods=["GET"])
def preview(season: str | None = None, from_date: str | None = None, to_date: str | None = None, circle: str | None = None) -> dict:
	generator.check_role()
	season = _season(season)
	std = generator.standards(season)
	f = getdate(from_date) if from_date else max(getdate(nowdate()), std.first)
	t = getdate(to_date) if to_date else add_days(f, 6)
	out = generator.preview(season, f, t, circle or None)
	out.pop("_chosen", None)
	return out


@frappe.whitelist(methods=["POST"])
def generate(season: str | None = None, from_date: str | None = None, to_date: str | None = None, circle: str | None = None,
		remarks: str | None = None) -> dict:
	return generator.generate(_season(season), from_date, to_date, circle or None, remarks=remarks)


@frappe.whitelist(methods=["POST"])
def authorize_batch(name: str) -> dict:
	doc = frappe.get_doc("Indent Batch", name)
	doc.check_permission("submit")
	doc.submit()
	return {"name": doc.name, "status": doc.status, "indents": doc.indent_count}


@frappe.whitelist(methods=["POST"])
def reject_batch(name: str, reason: str | None = None) -> dict:
	"""Rejecting a draft batch deletes it and its draft indents (their numbers stay unused)."""
	doc = frappe.get_doc("Indent Batch", name)
	if doc.docstatus != 0:
		frappe.throw(_("Only a draft batch can be rejected; cancel an authorized one instead"))
	doc.check_permission("delete")
	count = doc.indent_count
	frappe.delete_doc("Indent Batch", name)
	frappe.get_doc({"doctype": "Comment", "comment_type": "Info", "reference_doctype": "Crushing Season", "reference_name": doc.season,
		"content": _("Indent batch {0} ({1}, {2} indents) rejected{3}").format(name, doc.circle, count,
			f": {frappe.utils.escape_html(reason)}" if reason else "")}).insert(ignore_permissions=True)
	return {"name": name, "deleted": count}


@frappe.whitelist(methods=["POST"])
def print_pdf(batch: str | None = None, names: str | list | None = None, reason: str | None = None):
	"""PDF of the chosen indents (or every authorized indent of a batch). Marks them printed."""
	from sugarcane.cane_indenting.printing import print_indents

	if batch:
		frappe.get_doc("Indent Batch", batch).check_permission("read")
		wanted = frappe.get_all("Cane Indent", filters={"batch": batch, "docstatus": 1, "status": ["in", ["Authorized", "Printed"]]},
			pluck="name", order_by="indent_date asc, name asc")
		if not cint(frappe.form_dict.get("include_printed")):
			fresh = frappe.get_all("Cane Indent", filters={"batch": batch, "docstatus": 1, "status": "Authorized"}, pluck="name")
			wanted = fresh or wanted  # first print: the not-yet-printed ones; afterwards a full reprint
	else:
		wanted = [n for n in _list(names) if n]
	pdf, _info = print_indents(wanted, reason)
	frappe.local.response.filename = f"Indents {batch or (wanted[0] if len(wanted) == 1 else len(wanted))}.pdf"
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "download"


@frappe.whitelist(methods=["GET"])
def lookup(indent_no: str) -> dict:
	"""An indent by its number (typed or scanned): status, whether it is valid today, grower photo, barcode."""
	indent_no = (indent_no or "").strip().upper()
	if not frappe.db.exists("Cane Indent", indent_no):
		return {"found": False, "indent_no": indent_no}
	doc = frappe.get_doc("Cane Indent", indent_no)
	doc.check_permission("read")
	generator.expire_due()
	doc.reload()
	today = getdate(nowdate())
	usable = doc.docstatus == 1 and doc.status in ("Authorized", "Printed") and getdate(doc.valid_from) <= today <= getdate(doc.valid_to)
	reason = None
	if not usable:
		reason = (_("Not authorized yet") if doc.docstatus == 0 else _("Cancelled") if doc.docstatus == 2
			else _("Already used by token {0}").format(doc.token) if doc.status == "Used" else _("Expired") if doc.status == "Expired"
			else _("Valid from {0}").format(frappe.utils.formatdate(doc.valid_from)) if today < getdate(doc.valid_from) else doc.status)
	return {"found": True, "indent": doc.as_dict(), "usable_today": usable, "reason": reason, "barcode": svg(doc.name),
		"grower_photo": frappe.db.get_value("Grower", doc.grower, "grower_photo"),
		"days_left": (getdate(doc.valid_to) - today).days if usable else None}


@frappe.whitelist(methods=["POST"])
def cancel_indents(names: str | list, reason: str) -> dict:
	if not (reason or "").strip():
		frappe.throw(_("Give a reason for cancelling"))
	done = []
	for name in _list(names):
		doc = frappe.get_doc("Cane Indent", name)
		doc.check_permission("cancel")
		if doc.docstatus == 0:
			doc.check_permission("delete")
			frappe.delete_doc("Cane Indent", name)
		else:
			doc.cancel_reason = reason
			doc.cancel()
		done.append(name)
	return {"cancelled": done}


@frappe.whitelist(methods=["POST"])
def expire_now() -> dict:
	frappe.only_for(tuple(AUTHORIZERS))
	return {"expired": generator.expire_due()}


@frappe.whitelist(methods=["GET"])
def batch_detail(name: str) -> dict:
	doc = frappe.get_doc("Indent Batch", name)
	doc.check_permission("read")
	rows = frappe.get_all("Cane Indent", filters={"batch": name}, fields=["name", "indent_date", "grower", "grower_name", "village_name",
		"load_maund", "status", "print_count", "source"], order_by="indent_date asc, name asc", limit_page_length=0)
	return {"batch": doc.as_dict(), "indents": rows, "status_counts": dict(Counter(r.status for r in rows)),
		"can_authorize": doc.docstatus == 0 and bool(frappe.has_permission("Indent Batch", "submit", doc=doc)),
		"can_print": doc.docstatus == 1 and bool({"System Manager", "Cane Manager", "Cane Admin", "Indent Clerk", "Circle Officer"} & set(frappe.get_roles()))}


@frappe.whitelist(methods=["GET"])
def insights(season: str | None = None) -> dict:
	season = _season(season)
	generator.expire_due()
	std = generator.standards(season)
	today = getdate(nowdate())
	rows = frappe.get_list("Cane Indent", filters={"season": season}, fields=["name", "status", "docstatus", "indent_date",
		"circle", "load_maund", "grower"], limit_page_length=0)
	live = [r for r in rows if r.docstatus < 2]
	status = Counter(r.status for r in rows)
	ent = generator.entitlements(season, std)
	visible = set(frappe.get_list("Cane Circle", pluck="name", limit_page_length=0))
	ent = [b for b in ent if b["circle"] in visible]
	entitled = sum(b["entitled"] for b in ent)
	issued = sum(flt(r.load_maund) for r in live)
	used = sum(flt(r.load_maund) for r in rows if r.status == "Used")

	start = max(today, std.first) if today <= std.end else std.first
	per_day = Counter(getdate(r.indent_date) for r in live)
	days = [{"date": str(add_days(start, i)), "indents": per_day.get(add_days(start, i), 0), "capacity": std.per_day}
		for i in range(21)]
	by_circle = defaultdict(lambda: {"entitled": 0.0, "issued": 0.0, "used": 0.0, "expired": 0, "growers": set()})
	for b in ent:
		c = by_circle[b["circle"]]
		c["entitled"] += b["entitled"]
		c["growers"].add(b["grower"])
	for r in live:
		c = by_circle[r.circle]
		c["issued"] += flt(r.load_maund)
		if r.status == "Used":
			c["used"] += flt(r.load_maund)
		if r.status == "Expired":
			c["expired"] += 1
	circles = [{"name": k, "entitled": round(v["entitled"]), "issued": round(v["issued"]), "used": round(v["used"]),
		"expired": v["expired"], "growers": len(v["growers"]), "cover": round(100 * v["issued"] / v["entitled"], 1) if v["entitled"] else 0}
		for k, v in sorted(by_circle.items())]
	batches = Counter(b.status for b in frappe.get_list("Indent Batch", filters={"season": season}, fields=["status"], limit_page_length=0))
	valid_today = sum(1 for r in live if r.status in ("Authorized", "Printed") and getdate(r.indent_date) <= today
		and today <= add_days(getdate(r.indent_date), std.validity - 1))
	_lines, held = generator.survey_lines(season)

	highlights = []
	if batches.get("Draft"):
		highlights.append({"tone": "warn", "text": _("{0} batch(es) wait for authorization").format(batches["Draft"])})
	authorized_unprinted = status.get("Authorized", 0)
	if authorized_unprinted:
		highlights.append({"tone": "info", "text": _("{0} authorized indent(s) are not printed yet").format(authorized_unprinted)})
	if held:
		highlights.append({"tone": "warn", "text": _("{0} surveyed field(s) are held back until their overlap review is decided").format(len(held))})
	if status.get("Expired"):
		highlights.append({"tone": "bad", "text": _("{0} indent(s) expired unused — {1}% of those due so far").format(status["Expired"],
			round(100 * status["Expired"] / max(1, sum(1 for r in live if getdate(r.indent_date) < today)), 1))})
	if entitled:
		highlights.append({"tone": "good" if issued / entitled > 0.25 else "info",
			"text": _("{0}% of the season's entitled cane has indents").format(round(100 * issued / entitled, 1))})
	return {
		"season": season, "standards": {"load_maund": std.load, "per_day": std.per_day, "validity_days": std.validity,
			"first": str(std.first), "end": str(std.end)},
		"kpis": {"entitled": round(entitled), "issued": round(issued), "used": round(used), "indents": len(live),
			"growers": len({b["grower"] for b in ent}), "loads_entitled": sum(b["loads"] for b in ent), "valid_today": valid_today,
			"held": len(held), "draft_batches": batches.get("Draft", 0)},
		"status": [{"name": k, "value": v} for k, v in status.most_common()],
		"days": days, "circles": circles, "highlights": highlights,
	}


@frappe.whitelist(methods=["GET"])
def grower_balance(grower: str, season: str | None = None) -> dict:
	"""Entitled loads vs indents issued / used for one grower (for the grower form)."""
	frappe.get_doc("Grower", grower).check_permission("read")
	season = _season(season)
	ent = [b for b in generator.entitlements(season) if b["grower"] == grower]
	rows = frappe.get_all("Cane Indent", filters={"season": season, "grower": grower}, fields=["name", "status", "indent_date",
		"load_maund", "docstatus"], order_by="indent_date asc")
	return {"season": season, "entitled": sum(b["entitled"] for b in ent), "loads": sum(b["loads"] for b in ent),
		"issued": len([r for r in rows if r.docstatus < 2]), "used": len([r for r in rows if r.status == "Used"]),
		"indents": rows}
