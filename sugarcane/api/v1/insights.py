"""Insights for the React Survey and Field Force apps: KPIs with period comparisons, trends, breakdowns and
plain-language highlights. Everything goes through frappe.get_list, so the user's circle scope applies."""

from collections import Counter, defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, nowdate

from sugarcane.quota import season_quotas

SURVEY_FIELDS = ["name", "survey_date", "survey_for", "competitor_mill", "grower", "grower_category", "circle", "village",
	"variety", "crop_type", "crop_condition", "disease", "disease_pct", "calc_area_acres", "crop_land_acres",
	"expected_production_maund", "overlap_status", "surveyor"]


def _season(season=None):
	return season or frappe.db.get_single_value("Sugar Settings", "active_season")


def _pct(a, b):
	return round(100 * a / b, 1) if b else 0.0


def _delta(now, before):
	return round(100 * (now - before) / before, 1) if before else None


def _week(d):
	d = getdate(d)
	return add_days(d, -d.weekday())


# ---------------------------------------------------------------- survey
@frappe.whitelist(methods=["GET"])
def survey(season: str | None = None) -> dict:
	season = _season(season)
	rows = frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season}, fields=SURVEY_FIELDS, limit_page_length=0)
	company = [r for r in rows if r.survey_for != "Competitor"]
	competitor = [r for r in rows if r.survey_for == "Competitor"]
	today = getdate(nowdate())
	acres = sum(flt(r.calc_area_acres) for r in company)
	expected = sum(flt(r.expected_production_maund) for r in company)
	comp_acres = sum(flt(r.calc_area_acres) for r in competitor)

	def window(days_from, days_to):
		lo, hi = add_days(today, -days_from), add_days(today, -days_to)
		w = [r for r in company if lo < getdate(r.survey_date) <= hi]
		return len(w), sum(flt(r.calc_area_acres) for r in w), sum(flt(r.expected_production_maund) for r in w)

	now30, before30 = window(30, 0), window(60, 30)

	# weekly trend
	weeks = defaultdict(lambda: {"fields": 0, "acres": 0.0, "expected": 0.0, "competitor": 0.0, "diseased": 0.0})
	for r in rows:
		w = weeks[str(_week(r.survey_date))]
		if r.survey_for == "Competitor":
			w["competitor"] += flt(r.calc_area_acres)
			continue
		w["fields"] += 1
		w["acres"] += flt(r.calc_area_acres)
		w["expected"] += flt(r.expected_production_maund)
		if r.disease:
			w["diseased"] += flt(r.calc_area_acres)
	trend, cumulative = [], 0.0
	for k in sorted(weeks):
		cumulative += weeks[k]["acres"]
		trend.append({"week": k, **{m: round(v, 2) for m, v in weeks[k].items()}, "cumulative": round(cumulative, 1)})

	colours = dict(frappe.get_all("Cane Variety", fields=["name", "map_color"], as_list=True))
	yields = {v.name: flt(v.expected_yield) for v in frappe.get_all("Cane Variety", fields=["name", "expected_yield", "maturity"])}
	maturity = dict(frappe.get_all("Cane Variety", fields=["name", "maturity"], as_list=True))

	def group(items, key):
		g = defaultdict(lambda: {"fields": 0, "acres": 0.0, "expected": 0.0, "growers": set()})
		for r in items:
			x = g[r.get(key) or "—"]
			x["fields"] += 1
			x["acres"] += flt(r.calc_area_acres)
			x["expected"] += flt(r.expected_production_maund)
			if r.grower:
				x["growers"].add(r.grower)
		return {k: {**v, "growers": len(v["growers"])} for k, v in g.items()}

	by_variety = [{"name": k, **{m: round(v, 2) if isinstance(v, float) else v for m, v in d.items()},
		"color": colours.get(k), "maturity": maturity.get(k), "yield": yields.get(k, 0),
		"share": _pct(d["acres"], acres)} for k, d in sorted(group(company, "variety").items(), key=lambda kv: -kv[1]["acres"])]

	circles = {c.name: c for c in frappe.get_list("Cane Circle", fields=["name", "circle_code", "zone", "quota_maund",
		"affiliation", "area_acres"], limit_page_length=0)}
	quotas = season_quotas(season)
	comp_by_circle = defaultdict(float)
	for r in competitor:
		comp_by_circle[r.circle] += flt(r.calc_area_acres)
	by_circle = []
	for k, d in sorted(group(company, "circle").items(), key=lambda kv: circles.get(kv[0], {}).get("circle_code") or ""):
		c = circles.get(k) or frappe._dict()
		ours, theirs = d["acres"], comp_by_circle.get(k, 0.0)
		by_circle.append({"name": k, "code": c.circle_code, "zone": c.zone, "affiliation": c.affiliation, "fields": d["fields"],
			"growers": d["growers"], "acres": round(ours, 1), "expected": round(d["expected"]), "quota": quotas.get(k, 0.0),
			"quota_cover": _pct(d["expected"], quotas.get(k, 0.0)), "competitor_acres": round(theirs, 1),
			"competitor_share": _pct(theirs, ours + theirs)})

	diseases = defaultdict(lambda: {"fields": 0, "acres": 0.0, "pct": 0.0})
	for r in company:
		if r.disease:
			x = diseases[r.disease]
			x["fields"] += 1
			x["acres"] += flt(r.calc_area_acres)
			x["pct"] += flt(r.disease_pct)
	by_disease = [{"name": k, "fields": v["fields"], "acres": round(v["acres"], 1), "avg_pct": round(v["pct"] / v["fields"], 1)}
		for k, v in sorted(diseases.items(), key=lambda kv: -kv[1]["acres"])]

	def mix(key, items=company):
		c = Counter()
		for r in items:
			c[r.get(key) or "—"] += flt(r.calc_area_acres)
		return [{"name": k, "value": round(v, 1)} for k, v in c.most_common()]

	comp_mills = mix("competitor_mill", competitor)

	# declared vs measured accuracy
	buckets = Counter()
	for r in company:
		if not flt(r.crop_land_acres):
			continue
		var = 100 * (flt(r.calc_area_acres) - flt(r.crop_land_acres)) / flt(r.crop_land_acres)
		buckets["< −10%" if var < -10 else "−10…−5%" if var < -5 else "±5%" if var <= 5 else "5…10%" if var <= 10 else "> 10%"] += 1
	accuracy = [{"name": k, "value": buckets.get(k, 0)} for k in ("< −10%", "−10…−5%", "±5%", "5…10%", "> 10%")]

	growers_total = len(frappe.get_list("Grower", filters={"disabled": 0}, pluck="name", limit_page_length=0))
	growers_surveyed = len({r.grower for r in company if r.grower})
	by_grower = defaultdict(lambda: {"acres": 0.0, "fields": 0, "expected": 0.0, "circle": None, "village": None})
	for r in company:
		if r.grower:
			g = by_grower[r.grower]
			g["acres"] += flt(r.calc_area_acres)
			g["fields"] += 1
			g["expected"] += flt(r.expected_production_maund)
			g["circle"], g["village"] = r.circle, r.village
	names = dict(frappe.get_all("Grower", filters={"name": ["in", list(by_grower) or [""]]}, fields=["name", "grower_name"], as_list=True))
	top_growers = [{"grower": k, "grower_name": names.get(k, k), **{m: round(v, 1) if isinstance(v, float) else v for m, v in d.items()}}
		for k, d in sorted(by_grower.items(), key=lambda kv: -kv[1]["acres"])[:10]]

	overlaps = Counter(frappe.get_all("Survey Overlap Review", filters={"season": season}, pluck="status"))
	ratoon = sum(flt(r.calc_area_acres) for r in company if r.crop_type == "Ratoon")
	diseased = sum(flt(r.calc_area_acres) for r in company if r.disease)
	non_passbook = sum(1 for r in company if r.grower_category == "Non-Passbook Grower")
	quota_total = sum(c["quota"] for c in by_circle)

	highlights = []
	if by_variety:
		v = by_variety[0]
		highlights.append({"tone": "info", "text": _("{0} is the leading variety: {1}% of surveyed cane area ({2} acres).").format(
			v["name"], v["share"], round(v["acres"]))})
	low = [c for c in by_circle if c["quota"] and c["quota_cover"] < 60]
	if low:
		worst = min(low, key=lambda c: c["quota_cover"])
		highlights.append({"tone": "warn", "text": _("{0} circle(s) have expected cane below 60% of quota — lowest is {1} at {2}%.").format(
			len(low), worst["name"], worst["quota_cover"])})
	threat = max(by_circle, key=lambda c: c["competitor_share"], default=None)
	if threat and threat["competitor_share"] >= 10:
		highlights.append({"tone": "bad", "text": _("Competitor cane is {0}% of mapped cane in {1} — the most contested circle.").format(
			threat["competitor_share"], threat["name"])})
	if acres and _pct(diseased, acres) >= 8:
		top = by_disease[0]["name"] if by_disease else ""
		highlights.append({"tone": "warn", "text": _("{0}% of the area is diseased; {1} covers the most.").format(_pct(diseased, acres), top)})
	if overlaps.get("Open"):
		highlights.append({"tone": "warn", "text": _("{0} overlap review(s) are waiting for a decision.").format(overlaps["Open"])})
	if now30[1] and before30[1]:
		d = _delta(now30[1], before30[1])
		highlights.append({"tone": "good" if d >= 0 else "bad", "text": _("Survey pace: {0} acres in the last 30 days, {1}{2}% against the 30 before.").format(
			round(now30[1]), "+" if d >= 0 else "", d)})
	if growers_total:
		highlights.append({"tone": "info", "text": _("{0} of {1} registered growers surveyed ({2}%); {3} non-passbook growers surveyed by CNIC.").format(
			growers_surveyed, growers_total, _pct(growers_surveyed, growers_total), non_passbook)})

	return {
		"season": season,
		"kpis": {
			"fields": len(company), "acres": round(acres, 1), "expected": round(expected), "yield": round(expected / acres) if acres else 0,
			"growers_surveyed": growers_surveyed, "growers_total": growers_total, "ratoon_pct": _pct(ratoon, acres),
			"diseased_pct": _pct(diseased, acres), "competitor_acres": round(comp_acres, 1),
			"competitor_share": _pct(comp_acres, acres + comp_acres), "quota": quota_total, "quota_cover": _pct(expected, quota_total),
			"non_passbook": non_passbook, "open_overlaps": overlaps.get("Open", 0),
		},
		"compare": {"fields": [now30[0], before30[0]], "acres": [round(now30[1], 1), round(before30[1], 1)],
			"expected": [round(now30[2]), round(before30[2])]},
		"trend": trend, "by_variety": by_variety, "by_circle": by_circle, "by_disease": by_disease,
		"crop_type": mix("crop_type"), "condition": mix("crop_condition"), "grower_category": mix("grower_category"),
		"competitor_mills": comp_mills, "accuracy": accuracy, "top_growers": top_growers,
		"overlaps": {k: overlaps.get(k, 0) for k in ("Open", "Accepted", "Rejected Survey", "Rejected Other Survey")},
		"highlights": highlights,
	}


# ---------------------------------------------------------------- field force
@frappe.whitelist(methods=["GET"])
def field_force(days: int = 14) -> dict:
	days = min(max(cint(days) or 14, 7), 90)
	today = getdate(nowdate())
	start = add_days(today, -(days - 1))
	season = _season()
	att = frappe.get_list("Surveyor Attendance", filters={"docstatus": 1, "attendance_date": ["between", [start, today]]},
		fields=["surveyor", "surveyor_name", "attendance_date", "status", "time_in", "time_out", "working_hours", "distance_km",
			"inside_geofence_in", "circle"], limit_page_length=0)
	prev = frappe.get_list("Surveyor Attendance", filters={"docstatus": 1,
		"attendance_date": ["between", [add_days(start, -days), add_days(start, -1)]]},
		fields=["status", "working_hours", "distance_km"], limit_page_length=0)
	surveys = frappe.get_list("Cane Survey", filters={"docstatus": 1, "survey_date": ["between", [start, today]],
		"survey_for": "Company"}, fields=["surveyor", "survey_date", "calc_area_acres"], limit_page_length=0)
	surveyors = sorted({u for u in frappe.get_all("Has Role", filters={"role": "Surveyor", "parenttype": "User"}, pluck="parent")
		if u not in ("Administrator", "Guest")})

	daily = {str(add_days(start, i)): {"day": str(add_days(start, i)), "present": 0, "out_of_area": 0, "half_day": 0, "hours": 0.0,
		"km": 0.0, "fields": 0, "acres": 0.0} for i in range(days)}
	for a in att:
		d = daily.get(str(a.attendance_date))
		if not d:
			continue
		d["present"] += 1
		d["out_of_area"] += a.status == "Out of Area"
		d["half_day"] += a.status == "Half Day"
		d["hours"] += flt(a.working_hours)
		d["km"] += flt(a.distance_km)
	for s in surveys:
		d = daily.get(str(s.survey_date))
		if d:
			d["fields"] += 1
			d["acres"] += flt(s.calc_area_acres)
	trend = []
	for d in daily.values():
		trend.append({**d, "avg_hours": round(d["hours"] / d["present"], 2) if d["present"] else 0, "km": round(d["km"], 1),
			"acres": round(d["acres"], 1), "attendance_pct": _pct(d["present"], len(surveyors))})

	targets = defaultdict(lambda: [0.0, 0])
	for t in frappe.get_list("Surveyor Target", filters={"season": season}, fields=["surveyor", "target_acres", "target_surveys"],
			limit_page_length=0):
		targets[t.surveyor][0] += flt(t.target_acres)
		targets[t.surveyor][1] += cint(t.target_surveys)
	season_done = defaultdict(lambda: [0.0, 0])
	for s in frappe.get_list("Cane Survey", filters={"docstatus": 1, "season": season, "survey_for": "Company"},
			fields=["surveyor", "calc_area_acres"], limit_page_length=0):
		season_done[s.surveyor][0] += flt(s.calc_area_acres)
		season_done[s.surveyor][1] += 1

	per = defaultdict(lambda: {"days": 0, "hours": 0.0, "km": 0.0, "out_of_area": 0, "late": 0, "fields": 0, "acres": 0.0,
		"last_in": None, "name": None})
	for a in att:
		p = per[a.surveyor]
		p["name"] = a.surveyor_name
		p["days"] += 1
		p["hours"] += flt(a.working_hours)
		p["km"] += flt(a.distance_km)
		p["out_of_area"] += a.status == "Out of Area"
		t_in = get_datetime(a.time_in)
		p["late"] += (t_in.hour, t_in.minute) > (8, 30)
		p["last_in"] = max(filter(None, [p["last_in"], str(a.time_in)]))
	for s in surveys:
		per[s.surveyor]["fields"] += 1
		per[s.surveyor]["acres"] += flt(s.calc_area_acres)
	board = []
	for u in surveyors:
		p = per.get(u) or {"days": 0, "hours": 0.0, "km": 0.0, "out_of_area": 0, "late": 0, "fields": 0, "acres": 0.0, "last_in": None}
		tgt, done = targets.get(u, [0.0, 0]), season_done.get(u, [0.0, 0])
		board.append({"surveyor": u, "name": p.get("name") or frappe.utils.get_fullname(u), "days": p["days"],
			"attendance_pct": _pct(p["days"], days), "avg_hours": round(p["hours"] / p["days"], 1) if p["days"] else 0,
			"km": round(p["km"], 1), "km_per_day": round(p["km"] / p["days"], 1) if p["days"] else 0, "out_of_area": p["out_of_area"],
			"late": p["late"], "fields": p["fields"], "acres": round(p["acres"], 1), "target_acres": tgt[0],
			"season_acres": round(done[0], 1), "achievement": _pct(done[0], tgt[0]), "last_in": p["last_in"]})
	board.sort(key=lambda b: -b["achievement"])

	hours_hist = Counter()
	for a in att:
		hours_hist[get_datetime(a.time_in).strftime("%H:00")] += 1
	checkin = [{"name": k, "value": v} for k, v in sorted(hours_hist.items())]
	status_mix = [{"name": k, "value": v} for k, v in Counter(a.status for a in att).most_common()]
	devices = Counter(frappe.get_list("Survey Device", pluck="status", limit_page_length=0))
	stale = len(frappe.get_list("Survey Device", filters={"status": "Approved", "last_sync": ["<", add_days(today, -2)]},
		pluck="name", limit_page_length=0))
	present_today = sum(1 for a in att if getdate(a.attendance_date) == today)

	def avg(items, key):
		return round(sum(flt(i.get(key)) for i in items) / len(items), 2) if items else 0

	ooa_now = _pct(sum(1 for a in att if a.status == "Out of Area"), len(att))
	ooa_before = _pct(sum(1 for a in prev if a.status == "Out of Area"), len(prev))
	target_total = sum(b["target_acres"] for b in board)
	done_total = sum(b["season_acres"] for b in board)

	highlights = []
	if board and board[0]["target_acres"]:
		highlights.append({"tone": "good", "text": _("{0} leads the season: {1}% of target ({2} of {3} acres).").format(
			board[0]["name"], board[0]["achievement"], round(board[0]["season_acres"]), round(board[0]["target_acres"]))})
	behind = [b for b in board if b["target_acres"] and b["achievement"] < 50]
	if behind:
		highlights.append({"tone": "warn", "text": _("{0} surveyor(s) are below half of their season target.").format(len(behind))})
	if ooa_now:
		highlights.append({"tone": "bad" if ooa_now > 5 else "info", "text": _("{0}% of check-ins were outside the geofence in the last {1} days ({2}% before).").format(
			ooa_now, days, ooa_before)})
	late = sum(b["late"] for b in board)
	if late:
		highlights.append({"tone": "warn", "text": _("{0} check-in(s) after 08:30 in this period.").format(late)})
	if stale:
		highlights.append({"tone": "warn", "text": _("{0} approved phone(s) haven't synced for 2+ days.").format(stale)})
	if devices.get("Pending"):
		highlights.append({"tone": "info", "text": _("{0} new phone(s) waiting for approval.").format(devices["Pending"])})

	return {
		"days": days, "season": season,
		"kpis": {
			"surveyors": len(surveyors), "present_today": present_today, "attendance_pct": _pct(len(att), days * len(surveyors)),
			"avg_hours": avg(att, "working_hours"), "avg_hours_before": avg(prev, "working_hours"),
			"km": round(sum(flt(a.distance_km) for a in att), 1), "km_per_day": round(sum(flt(a.distance_km) for a in att) / len(att), 1) if att else 0,
			"out_of_area_pct": ooa_now, "out_of_area_before": ooa_before, "fields": len(surveys),
			"acres": round(sum(flt(s.calc_area_acres) for s in surveys), 1), "target_acres": target_total,
			"season_acres": round(done_total, 1), "achievement": _pct(done_total, target_total),
			"devices": {k: devices.get(k, 0) for k in ("Approved", "Pending", "Blocked")}, "stale_devices": stale,
		},
		"trend": trend, "board": board, "checkin": checkin, "status_mix": status_mix, "highlights": highlights,
	}
