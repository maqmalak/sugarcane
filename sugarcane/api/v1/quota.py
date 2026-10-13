"""Season quota adjustment for the React app: each circle's cane quota for a crushing season next to what the survey
expects, and saving the adjusted figures to the season's Circle Quotas table (with who, when, basis and a reason).

Circles come through frappe.get_list, so a circle officer sees only their circles; saving needs write access on the
Crushing Season (Cane Manager / Cane Admin / System Manager)."""

import json
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import flt, fmt_money, now_datetime

BASES = ("Manual", "Survey", "Season Target", "Scaled")


def _season(season=None):
	return season or frappe.db.get_single_value("Sugar Settings", "active_season")


def _pct(a, b):
	return round(100 * a / b, 1) if b else 0.0


def _previous_season(season):
	start = frappe.db.get_value("Crushing Season", season, "start_date")
	if not start:
		return None
	return frappe.db.get_value("Crushing Season", {"start_date": ["<", start]}, "name", order_by="start_date desc")


def _survey_by_circle(season):
	out = defaultdict(lambda: {"fields": 0, "growers": set(), "acres": 0.0, "expected": 0.0})
	for r in frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season, "survey_for": ["!=", "Competitor"]},
			fields=["circle", "grower", "calc_area_acres", "expected_production_maund"], limit_page_length=0):
		x = out[r.circle]
		x["fields"] += 1
		x["acres"] += flt(r.calc_area_acres)
		x["expected"] += flt(r.expected_production_maund)
		if r.grower:
			x["growers"].add(r.grower)
	return out


def _season_rows(season):
	if not season:
		return {}
	return {r.circle: r for r in frappe.get_all("Season Circle Quota", filters={"parent": season, "parenttype": "Crushing Season"},
		fields=["circle", "quota_maund", "previous_quota_maund", "basis", "remarks", "adjusted_by", "adjusted_on"])}


@frappe.whitelist(methods=["GET"])
def view(season: str | None = None) -> dict:
	season = _season(season)
	if not season:
		frappe.throw(_("Set an active crushing season in Sugar Settings first"))
	doc = frappe.get_doc("Crushing Season", season)
	doc.check_permission("read")
	previous = _previous_season(season)
	rows_now, rows_before = _season_rows(season), _season_rows(previous)
	survey = _survey_by_circle(season)
	circles = frappe.get_list("Cane Circle", filters={"is_active": 1}, fields=["name", "circle_name", "circle_code", "zone",
		"affiliation", "quota_maund"], order_by="circle_code asc", limit_page_length=0)

	out = []
	for c in circles:
		s, r = survey.get(c.name), rows_now.get(c.name)
		quota = flt(r.quota_maund) if r else flt(c.quota_maund)
		expected = round(s["expected"]) if s else 0
		before = rows_before.get(c.name)
		out.append({
			"circle": c.name, "circle_name": c.circle_name, "code": c.circle_code, "zone": c.zone, "affiliation": c.affiliation,
			"circle_quota": flt(c.quota_maund), "quota": quota, "has_season_quota": bool(r),
			"previous_quota": flt(r.previous_quota_maund) if r else None, "basis": r.basis if r else None,
			"remarks": r.remarks if r else None, "adjusted_by": frappe.utils.get_fullname(r.adjusted_by) if r and r.adjusted_by else None,
			"adjusted_on": r.adjusted_on if r else None,
			"last_season_quota": flt(before.quota_maund) if before else None,
			"fields": s["fields"] if s else 0, "growers": len(s["growers"]) if s else 0, "acres": round(s["acres"], 1) if s else 0,
			"expected": expected, "cover": _pct(expected, quota),
		})

	total_quota = sum(r["quota"] for r in out)
	total_expected = sum(r["expected"] for r in out)
	history = frappe.get_all("Comment", filters={"reference_doctype": "Crushing Season", "reference_name": season,
		"comment_type": "Info", "content": ["like", "Circle quotas adjusted%"]},
		fields=["content", "owner", "creation"], order_by="creation desc", limit=15)
	return {
		"season": season, "status": doc.status, "start_date": doc.start_date, "end_date": doc.end_date,
		"previous_season": previous, "crushing_target": flt(doc.crushing_target_maund),
		"seasons": frappe.get_list("Crushing Season", fields=["name", "status"], order_by="start_date desc"),
		"can_edit": bool(doc.has_permission("write")) and doc.status != "Closed",
		"rows": out,
		"totals": {"quota": total_quota, "expected": total_expected, "cover": _pct(total_expected, total_quota),
			"circles": len(out), "adjusted": sum(1 for r in out if r["has_season_quota"]),
			"target_gap": flt(doc.crushing_target_maund) - total_quota if doc.crushing_target_maund else None},
		"history": [{"text": h.content, "by": frappe.utils.get_fullname(h.owner), "on": h.creation} for h in history],
	}


@frappe.whitelist(methods=["POST"])
def save(season: str, changes: str | list, reason: str | None = None) -> dict:
	"""changes: [{circle, quota_maund, basis?, remarks?}]. Only circles whose quota actually changes are written."""
	doc = frappe.get_doc("Crushing Season", season)
	doc.check_permission("write")
	if doc.status == "Closed":
		frappe.throw(_("Season {0} is closed; its quotas can no longer be adjusted").format(season))
	changes = json.loads(changes) if isinstance(changes, str) else (changes or [])
	visible = set(frappe.get_list("Cane Circle", pluck="name", limit_page_length=0))
	defaults = dict(frappe.get_all("Cane Circle", fields=["name", "quota_maund"], as_list=True))
	rows = {r.circle: r for r in doc.get("circle_quotas")}
	reason = (reason or "").strip()
	stamp, changed, delta = now_datetime(), [], 0.0
	for ch in changes:
		circle = ch.get("circle")
		if circle not in visible:
			frappe.throw(_("Circle {0} is not one you can adjust").format(circle), frappe.PermissionError)
		quota = flt(ch.get("quota_maund"))
		if quota < 0:
			frappe.throw(_("The quota for {0} cannot be negative").format(circle))
		basis = ch.get("basis") if ch.get("basis") in BASES else "Manual"
		row = rows.get(circle)
		before = flt(row.quota_maund) if row else flt(defaults.get(circle))
		if round(before) == round(quota):
			continue
		if not row:
			row = doc.append("circle_quotas", {"circle": circle})
			rows[circle] = row
		row.update({"previous_quota_maund": before, "quota_maund": round(quota), "basis": basis,
			"remarks": (ch.get("remarks") or reason or "")[:140], "adjusted_by": frappe.session.user, "adjusted_on": stamp})
		changed.append(circle)
		delta += round(quota) - before
	if not changed:
		return {"changed": [], **view(season)}
	doc.save()
	md = lambda v: fmt_money(v, precision=0)  # noqa: E731
	summary = _("{0} circle(s), {1}{2} maund ({3})").format(len(changed), "+" if delta >= 0 else "−", md(abs(delta)),
		", ".join(changed[:8]) + ("…" if len(changed) > 8 else ""))
	doc.add_comment("Info", _("Circle quotas adjusted: {0}.{1}").format(summary,
		f" Reason: {frappe.utils.escape_html(reason)}" if reason else ""))
	from sugarcane.notify import quotas_adjusted

	quotas_adjusted(season, changed, summary + (f" — {reason}" if reason else ""))
	return {"changed": changed, **view(season)}


@frappe.whitelist(methods=["POST"])
def reset(season: str, circles: str | list) -> dict:
	"""Drop the season rows of these circles so they go back to the circle's own quota."""
	doc = frappe.get_doc("Crushing Season", season)
	doc.check_permission("write")
	if doc.status == "Closed":
		frappe.throw(_("Season {0} is closed; its quotas can no longer be adjusted").format(season))
	circles = set(json.loads(circles) if isinstance(circles, str) else circles)
	keep = [r for r in doc.get("circle_quotas") if r.circle not in circles]
	dropped = len(doc.get("circle_quotas")) - len(keep)
	if dropped:
		doc.set("circle_quotas", keep)
		doc.save()
		doc.add_comment("Info", _("Circle quotas adjusted: {0} circle(s) reset to the circle quota.").format(dropped))
	return view(season)
