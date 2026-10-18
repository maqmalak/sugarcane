"""Bell notifications (Frappe Notification Log) for cane work. The React header bell and the desk bell both show them,
live over the realtime "notification" event.

| Event | Who is told |
|---|---|
| overlap review opened | the circle's Circle Officer + Cane Managers / Cane Admins |
| overlap review decided | the surveyors of both surveys |
| phone registered, waiting for approval | Cane Managers / Cane Admins |
| check-in outside the circle | the circle's Circle Officer |
| season quotas adjusted | other Cane Managers / Cane Admins |

Logs are written straight away (not queued: this bench runs no background worker for the site), and demo records
(is_demo) never notify."""

import frappe
from frappe import _
from frappe.utils import cint

MANAGER_ROLES = ("Cane Manager", "Cane Admin")


def users_with_roles(roles) -> set[str]:
	users = set(frappe.get_all("Has Role", filters={"role": ["in", list(roles)], "parenttype": "User"}, pluck="parent"))
	return users & set(frappe.get_all("User", filters={"enabled": 1, "user_type": "System User"}, pluck="name"))


def circle_officer(circle) -> str | None:
	return frappe.db.get_value("Cane Circle", circle, "circle_officer") if circle else None


def notify(users, subject: str, doctype: str, name: str, kind: str = "Alert", body: str | None = None):
	"""One Notification Log per user (the acting user is skipped)."""
	me = frappe.session.user
	for user in sorted({u for u in users if u and u != me and u != "Guest"}):
		frappe.get_doc({
			"doctype": "Notification Log", "for_user": user, "type": kind, "subject": subject, "email_content": body or subject,
			"document_type": doctype, "document_name": name, "from_user": me if me != "Guest" else None,
		}).insert(ignore_permissions=True)


def _demo(doc) -> bool:
	return bool(cint(doc.get("is_demo")))


# ---------------------------------------------------------------- doc events
def overlap_review_inserted(doc, method=None):
	if _demo(doc):
		return
	notify(users_with_roles(MANAGER_ROLES) | {circle_officer(doc.circle)},
		_("Overlap to review: {0} and {1} share {2} acres ({3}%)").format(doc.survey, doc.other_survey, round(doc.overlap_acres or 0, 2),
			round(doc.overlap_pct or 0, 1)), doc.doctype, doc.name)


def overlap_review_updated(doc, method=None):
	before = doc.get_doc_before_save()
	if _demo(doc) or not before or before.status == doc.status or doc.status == "Open":
		return
	surveyors = set(frappe.get_all("Cane Survey", filters={"name": ["in", [doc.survey, doc.other_survey]]}, pluck="surveyor"))
	notify(surveyors, _("Overlap {0} decided: {1}").format(doc.name, _(doc.status)), doc.doctype, doc.name)


def device_inserted(doc, method=None):
	if _demo(doc) or doc.status != "Pending":
		return
	who = frappe.utils.get_fullname(doc.assigned_user) if doc.get("assigned_user") else _("a surveyor")
	notify(users_with_roles(MANAGER_ROLES), _("New phone waiting for approval: {0} ({1})").format(doc.name, who), doc.doctype, doc.name)


def attendance_updated(doc, method=None):
	if _demo(doc) or doc.status != "Out of Area":
		return
	before = doc.get_doc_before_save()
	if before and before.status == "Out of Area":
		return
	notify({circle_officer(doc.circle)}, _("{0} checked in outside {1} on {2}").format(
		frappe.utils.get_fullname(doc.surveyor), doc.circle or _("their circle"), frappe.utils.formatdate(doc.attendance_date)),
		doc.doctype, doc.name)


def quotas_adjusted(season: str, circles: list[str], text: str):
	notify(users_with_roles(MANAGER_ROLES), _("Season {0} quotas adjusted: {1}").format(season, text), "Crushing Season", season)


def indent_batches_generated(season: str, batches: list[dict]):
	"""New draft indent batches: the people who authorize them are told."""
	if not batches or all(frappe.db.get_value("Indent Batch", b["name"], "is_demo") for b in batches):
		return
	for b in batches:
		notify(users_with_roles(MANAGER_ROLES), _("Indent batch {0} for {1}: {2} indents ({3} maund) wait for authorization").format(
			b["name"], b["circle"], b["indents"], f"{b['maund']:,.0f}"), "Indent Batch", b["name"])


def indent_batch_authorized(doc):
	if _demo(doc):
		return
	notify(users_with_roles(("Indent Clerk",)) | {doc.generated_by}, _("Indent batch {0} ({1}) authorized — {2} indents ready to print").format(
		doc.name, doc.circle, doc.indent_count), doc.doctype, doc.name)


def elp_decided(doc):
	"""Gate decision on a vehicle registered at a loading point: the operator who registered it is told."""
	if _demo(doc) or not doc.registered_by:
		return
	text = (_("{0} ({1}) accepted at the mill gate").format(doc.vehicle_no, doc.name) if doc.status == "Accepted"
		else _("{0} ({1}) rejected at the mill gate: {2}").format(doc.vehicle_no, doc.name, doc.reject_reason or ""))
	notify({doc.registered_by}, text, doc.doctype, doc.name)
