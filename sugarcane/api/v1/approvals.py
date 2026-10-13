"""Approvals inbox on this app's sites (overrides mm_core.approvals.get_inbox / act): everything mm_core lists, plus
the open Survey Overlap Reviews the user may decide — Accept both, or Reject one of the two surveys — and the
overlap decisions of the last days under "Recent".

Overlaps come through frappe.get_list, so a circle officer sees only their circles' reviews. Deciding goes through the
review's own controller (who may decide, cancelling the rejected survey, refreshing both surveys' overlap status)."""

import frappe
from frappe import _
from frappe.utils import add_days, flt, nowdate

from mm_core import approvals as base
from sugarcane.eagleeye_survey.doctype.survey_overlap_review.survey_overlap_review import DECIDERS

DT = "Survey Overlap Review"
ACCEPT = "Accept both"


def _reject_label(survey: str) -> str:
	return _("Reject {0}").format(survey)


def _can_decide() -> bool:
	return bool(set(frappe.get_roles()) & set(DECIDERS)) and frappe.has_permission(DT, "write")


def _overlaps_pending() -> list[dict]:
	if not _can_decide():
		return []
	rows = frappe.get_list(DT, filters={"status": "Open"}, fields=["name", "survey", "other_survey", "grower", "other_grower", "circle",
		"overlap_acres", "overlap_pct", "creation", "owner"], order_by="creation desc", limit_page_length=200)
	names = {g: n for g, n in frappe.get_all("Grower", filters={"name": ["in", [x for r in rows for x in (r.grower, r.other_grower) if x]]},
		fields=["name", "grower_name"], as_list=True)}
	out = []
	for r in rows:
		who = " ↔ ".join(names.get(g) or g or "—" for g in (r.grower, r.other_grower))
		out.append({"doctype": DT, "name": r.name, "state": "Open",
			"title": _("{0} ↔ {1} · {2} acres shared ({3}%) · {4} · {5}").format(r.survey, r.other_survey, flt(r.overlap_acres, 2),
				flt(r.overlap_pct, 1), r.circle or "—", who),
			"amount": None, "since": str(r.creation), "owner": r.owner, "category": "overlap", "workflow": None,
			"actions": [ACCEPT, _reject_label(r.survey), _reject_label(r.other_survey)],
			"survey": r.survey, "other_survey": r.other_survey})
	return out


@frappe.whitelist()
def get_inbox(company: str | None = None, days: int = 30) -> dict:
	out = base.get_inbox(company, days)
	overlaps = _overlaps_pending()
	out["pending"] = overlaps + out["pending"]
	for r in out["recent"]:
		if r["doctype"] == DT:
			r["category"] = "overlap"
	out["counts"] = {**out["counts"], "pending": out["counts"]["pending"] + len(overlaps), "overlap": len(overlaps)}
	return out


@frappe.whitelist(methods=["POST"])
def act(doctype: str, name: str, action: str, remarks: str | None = None) -> dict:
	if doctype != DT:
		return base.act(doctype, name, action)
	doc = frappe.get_doc(DT, name)
	doc.check_permission("write")
	if doc.status != "Open":
		frappe.throw(_("This review is already decided ({0})").format(doc.status))
	status = {ACCEPT: "Accepted", _reject_label(doc.survey): "Rejected Survey",
		_reject_label(doc.other_survey): "Rejected Other Survey"}.get(action)
	if not status:
		frappe.throw(_("Unknown action {0}").format(action))
	doc.status = status
	if remarks:
		doc.remarks = remarks
	doc.save()
	label = {"Accepted": _("Accepted both"), "Rejected Survey": _("Rejected {0}").format(doc.survey),
		"Rejected Other Survey": _("Rejected {0}").format(doc.other_survey)}[status]
	doc.add_comment("Workflow", label)
	return {"name": doc.name, "state": status, "docstatus": doc.docstatus}
