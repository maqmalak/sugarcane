"""The React Desktop (home) for the sugar mill — replaces mm_core.home.get_home on this app's sites
(hooks.override_whitelisted_methods). Same shape as mm_core's, so the forked page renders it unchanged, but the content
is cane work:

* Needs attention: open overlap reviews, phones waiting for approval, surveys left in draft, surveyors not checked in
  today, check-ins outside the circle, circles far below their season quota, sources without a location, plus mm_core's
  workflow approvals.
* Recent activity: surveys, overlap reviews, attendance, devices, growers, passbooks, seasons, cane vouchers.
* Tiles: a live figure for each sugar app tile.

Everything goes through frappe.get_list / has_permission, so a circle officer sees only their circles."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

from mm_core import home as base

CACHE_SECONDS = 60

# doctype -> (category, date field, title field, link base in the React app)
FEED = {
	"Cane Survey": ("survey", "survey_date", "grower_name", "/survey/d/cane-survey"),
	"Survey Overlap Review": ("survey", None, "circle", "/survey/d/survey-overlap-review"),
	"Surveyor Attendance": ("field", "attendance_date", "surveyor", "/field-force/d/surveyor-attendance"),
	"Survey Device": ("field", None, "assigned_user", "/field-force/d/survey-device"),
	"Grower": ("masters", None, "grower_name", "/setup/d/grower"),
	"Grower Passbook": ("masters", None, "grower", "/setup/d/grower-passbook"),
	"Crushing Season": ("masters", None, "season_name", "/setup/d/crushing-season"),
	"Cane Source": ("masters", None, "source_name", "/setup/d/cane-source"),
	"Indent Batch": ("indent", "from_date", "circle", "/indenting/d/indent-batch"),
	"Journal Entry": ("finance", "posting_date", "title", None),
	"Payment Entry": ("finance", "posting_date", "party_name", None),
}
MODULES = {"survey": "Survey", "field": "Field Force", "indent": "Indenting", "masters": "Masters", "finance": "Accounts"}


def _can(dt):
	return frappe.db.exists("DocType", dt) and frappe.has_permission(dt, "read")


def _has(dt, field):
	return bool(field) and frappe.get_meta(dt).has_field(field)


def _surveyors():
	return set(frappe.get_all("Has Role", filters={"role": "Surveyor", "parenttype": "User", "parent": ["not in", ["Administrator", "Guest"]]},
		pluck="parent")) & set(frappe.get_all("User", filters={"enabled": 1}, pluck="name"))


def _alerts(approvals_total):
	today, out = nowdate(), []

	def add(key, n, label, meta, to, tone):
		if n:
			out.append({"key": key, "n": int(n), "label": label, "meta": meta, "to": to, "tone": tone, "amount": None})

	season = frappe.db.get_single_value("Sugar Settings", "active_season")
	if _can("Survey Overlap Review"):
		add("sc_overlaps", len(frappe.get_list("Survey Overlap Review", filters={"status": "Open"}, pluck="name", limit_page_length=0)),
			_("Overlapping fields to review"), _("Two surveys claim the same land — accept or reject one"),
			"/approvals/inbox", "rose")
	if _can("Survey Device"):
		add("sc_devices", len(frappe.get_list("Survey Device", filters={"status": "Pending"}, pluck="name", limit_page_length=0)),
			_("Phones waiting for approval"), _("Surveyors cannot sign in until a manager approves the phone"), "/field-force/users", "amber")
	if _can("Cane Survey"):
		add("sc_drafts", len(frappe.get_list("Cane Survey", filters={"docstatus": 0, "creation": ["<", add_days(today, -1)]},
			pluck="name", limit_page_length=0)), _("Surveys left in draft"), _("Saved over a day ago but never submitted"),
			"/survey/d/cane-survey?docstatus=0", "violet")
	if _can("Surveyor Attendance"):
		rows = frappe.get_list("Surveyor Attendance", filters={"attendance_date": today, "docstatus": ["<", 2]},
			fields=["surveyor", "status"], limit_page_length=0)
		checked = {r.surveyor for r in rows}
		if frappe.has_permission("User", "read") or "Cane Manager" in frappe.get_roles():
			add("sc_absent", len(_surveyors() - checked), _("Surveyors not checked in today"),
				_("No attendance recorded yet today"), "/field-force", "orange")
		add("sc_out_of_area", sum(1 for r in rows if r.status == "Out of Area"), _("Check-ins outside their circle"),
			_("Today's check-ins outside the geofence"), "/survey/map?layers=attendance", "red")
	if season and _can("Cane Survey") and _can("Cane Circle"):
		from sugarcane.quota import season_quotas

		quotas = season_quotas(season)
		expected = defaultdict(float)
		for r in frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season, "survey_for": ["!=", "Competitor"]},
				fields=["circle", "expected_production_maund"], limit_page_length=0):
			expected[r.circle] += flt(r.expected_production_maund)
		visible = frappe.get_list("Cane Circle", filters={"is_active": 1}, pluck="name", limit_page_length=0)
		low = [c for c in visible if quotas.get(c) and expected.get(c, 0) < 0.6 * quotas[c]]
		add("sc_quota", len(low), _("Circles below 60% of quota"), _("Expected cane from the survey against the season quota"),
			"/survey/quota", "yellow")
	for dt in ("Cane Source", "Cane Depot", "Loading Point"):
		if _can(dt):
			n = len(frappe.get_list(dt, filters={"is_active": 1, "latitude": ["in", [0, None]]}, pluck="name", limit_page_length=0))
			add(f"sc_nopin_{frappe.scrub(dt)}", n, _("{0} without a location").format(_(dt) + ("s" if not dt.endswith("s") else "")),
				_("No map pin — distance and journey time cannot be worked out"), f"/setup/d/{dt.lower().replace(' ', '-')}", "sky")
	if _can("Indent Batch"):
		add("sc_indent_draft", len(frappe.get_list("Indent Batch", filters={"docstatus": 0}, pluck="name", limit_page_length=0)),
			_("Indent batches to authorize"), _("Generated indents wait for a Cane Manager"), "/approvals/inbox", "violet")
	if _can("Cane Indent"):
		add("sc_indent_unprinted", len(frappe.get_list("Cane Indent", filters={"docstatus": 1, "status": "Authorized"},
			pluck="name", limit_page_length=0)), _("Authorized indents not printed"), _("Print them so growers get their permits"),
			"/indenting/d/indent-batch?status=Authorized", "sky")
	add("approvals", approvals_total, _("Approvals waiting"), _("Workflow and HR requests waiting for you"), "/approvals/inbox", "yellow")
	return out


def _feed(days=7, per_doctype=15, per_category=15):
	today, since = nowdate(), add_days(nowdate(), -(days - 1))
	feed = []
	for dt, (cat, dfield, title, _link) in FEED.items():
		if not _can(dt):
			continue
		dfield = dfield if _has(dt, dfield) else None
		fields = ["name", "docstatus", "owner", "modified", "creation"]
		if dfield:
			fields.append(f"{dfield} as doc_date")
		if _has(dt, title):
			fields.append(f"{title} as title")
		if _has(dt, "status"):
			fields.append("status")
		if dt in ("Journal Entry", "Payment Entry"):
			fields.append("total_debit as amount" if dt == "Journal Entry" else "base_paid_amount as amount")
		company = frappe.db.get_single_value("Sugar Settings", "company")
		filters = {"company": company} if company and _has(dt, "company") else {}
		for r in frappe.get_list(dt, filters=filters, or_filters=[["modified", ">=", since]] + ([[dfield, "between", [since, today]]] if dfield else []),
				fields=fields, order_by="modified desc", limit_page_length=per_doctype):
			status = r.get("status") or {0: "Draft", 1: "Submitted", 2: "Cancelled"}.get(r.docstatus, "")
			when = str(r.modified)[:19]
			t = r.get("title") or ""
			if dt == "Surveyor Attendance" and t:
				t = frappe.utils.get_fullname(t)
			feed.append({"doctype": dt, "name": r.name, "category": cat, "title": t, "amount": flt(r.get("amount")) or None,
				"status": status, "owner": r.owner, "owner_name": frappe.utils.get_fullname(r.owner), "at": when, "day": when[:10]})
	feed.sort(key=lambda x: x["at"], reverse=True)
	taken, out = defaultdict(int), []
	for f in feed:
		if taken[f["category"]] < per_category:
			taken[f["category"]] += 1
			out.append(f)
	hours, mix = [0] * 24, defaultdict(int)
	for f in out:
		if f["day"] == today:
			hours[cint(f["at"][11:13])] += 1
			mix[f["category"]] += 1
	return out[:60], hours, dict(mix)


def _counts():
	"""Documents per day over the last 7 days, and per module today / 7 days / 30 days (by creation)."""
	today = getdate(nowdate())
	start, week, month = add_days(today, -6), add_days(today, -6), add_days(today, -29)
	per_day = defaultdict(int)
	counts = {p: defaultdict(int) for p in ("today", "week", "month")}
	top = {p: defaultdict(list) for p in ("today", "week", "month")}
	for dt, (cat, *_rest) in FEED.items():
		if not _can(dt):
			continue
		cond = {"creation": [">=", month]}
		if frappe.get_meta(dt).is_submittable:
			cond["docstatus"] = ["<", 2]
		rows = frappe.get_list(dt, filters=cond, fields=["creation"], limit_page_length=0)
		module = MODULES[cat]
		t = w = m = 0
		for r in rows:
			d = getdate(r.creation)
			m += 1
			if d >= week:
				w += 1
			if d == today:
				t += 1
			if d >= start:
				per_day[str(d)] += 1
		for period, n in (("today", t), ("week", w), ("month", m)):
			if n:
				counts[period][module] += n
				top[period][module].append([dt, n])
	for period in top:
		for module in top[period]:
			top[period][module] = sorted(top[period][module], key=lambda x: -x[1])[:3]
	days = [{"date": str(add_days(start, i)), "count": per_day.get(str(add_days(start, i)), 0)} for i in range(7)]
	return days, {"counts": {p: dict(v) for p, v in counts.items()}, "top": {p: dict(v) for p, v in top.items()}}


def _tiles():
	t, today = {}, nowdate()
	season = frappe.db.get_single_value("Sugar Settings", "active_season")

	def put(key, value, label):
		if value is not None:
			t[key] = {"value": value, "label": label}

	if _can("Cane Survey"):
		put("survey", len(frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season}, pluck="name", limit_page_length=0)),
			_("fields surveyed"))
	if _can("Surveyor Attendance"):
		put("field-force", len(frappe.get_list("Surveyor Attendance", filters={"attendance_date": today, "docstatus": ["<", 2]},
			pluck="name", limit_page_length=0)), _("checked in today"))
	if _can("Grower"):
		put("growers", frappe.db.count("Grower") if frappe.has_permission("Grower", "read") else None, _("growers"))
	if _can("Cane Village"):
		put("geo", len(frappe.get_list("Cane Village", filters={"polygon": ["is", "set"]}, pluck="name", limit_page_length=0)),
			_("villages mapped"))
	if _can("Cane Indent"):
		put("indenting", len(frappe.get_list("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
			"valid_from": ["<=", today], "valid_to": [">=", today]}, pluck="name", limit_page_length=0)), _("indents valid today"))
	from sugarcane.exports import catalogue

	put("reports", len(catalogue()), _("reports"))
	if _can("Cane Source"):
		put("setup", frappe.db.count("Cane Source", {"is_active": 1}), _("active sources"))
	return t


def _approvals(limit=30, company=None):
	"""What waits for the user — the sugar inbox (open overlap reviews + mm_core's workflow / HR items). mm_core's own
	home imports mm_core.approvals directly, which the whitelisted-method override does not reach, so overlaps were 0."""
	from sugarcane.api.v1.approvals import ACCEPT, get_inbox

	pending = get_inbox(company, days=1)["pending"]
	items = [{"doctype": p["doctype"], "name": p["name"], "state": p["state"], "title": p.get("title") or "", "amount": p.get("amount"),
		"since": p["since"], "category": p["category"],
		# "Approve" on the home card: accept both fields for an overlap, the workflow's Approve otherwise
		"can_approve": bool({"Approve", "Authorize", ACCEPT} & set(p.get("actions") or []))} for p in pending[:limit]]
	return items, len(pending), sum(1 for p in pending if p["category"] in ("overlap", "indent"))


@frappe.whitelist()
def approve(doctype: str, name: str) -> dict:
	"""The home card's Approve button: Accept both for an overlap review, mm_core's workflow approve otherwise."""
	from sugarcane.api.v1.approvals import ACCEPT, DT, act

	if doctype == DT:
		return act(doctype, name, ACCEPT)
	if doctype == "Indent Batch":
		return act(doctype, name, "Authorize")
	return base.approve(doctype, name)


@frappe.whitelist()
def get_home(company: str | None = None, refresh: int = 0) -> dict:
	company = company or frappe.db.get_single_value("Sugar Settings", "company")
	key = f"sugarcane-home:{frappe.session.user}:{company}"
	if not cint(refresh):
		cached = frappe.cache.get_value(key)
		if cached:
			return cached
	out = _compute(company)
	frappe.cache.set_value(key, out, expires_in_sec=CACHE_SECONDS)
	return out


def _compute(company):
	approvals, approvals_total, overlap_total = base._block(_approvals, 30, company) or ([], 0, 0)
	feed, hours, mix = base._block(_feed) or ([], [0] * 24, {})
	days, module_mix = base._block(_counts) or ([], {"counts": {}, "top": {}})
	today = nowdate()
	return {
		"company": company, "kpis": [], "approvals": approvals, "approvals_total": approvals_total,
		"alerts": base._block(_alerts, approvals_total - overlap_total) or [],
		"activity": feed, "hours": hours, "days": days, "mix": mix, "module_mix": module_mix,
		"stats": {"entries_today": next((d["count"] for d in days if d["date"] == today), sum(hours)), "pending": approvals_total,
			"posted_today": sum(1 for f in feed if f["day"] == today and f["status"] not in ("Draft", "Cancelled"))},
		"tiles": base._block(_tiles) or {},
		"todos": base._block(base._todos) or {"open": 0, "overdue": 0},
	}
