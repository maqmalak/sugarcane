"""Indent generation: surveyed cane × quota rules → each grower's loads → supply dates fitted into the mill's daily intake.

The whole season is planned every time, the same way, so a run for next week and a later run for the week after agree:
loads already issued keep their place (and use up their day's capacity), loads not issued yet are placed again. Only
the loads that land inside the requested dates (and circle) are created — as Draft indents in one Indent Batch per circle.

Held back: surveys whose field is still under overlap review. Left out: rejected overlaps, competitor fields, disabled
growers, cancelled surveys.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, now_datetime, nowdate

from sugarcane.calc import indent as calc
from sugarcane.quota import season_quotas

ROLES = {"System Manager", "Cane Manager", "Cane Admin", "Indent Clerk"}
MAX_PER_RUN = 3000


def check_role():
	if not ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only an Indent Clerk or Cane Manager can generate indents"), frappe.PermissionError)


# ---------------------------------------------------------------- inputs
def standards(season: str) -> frappe._dict:
	s = frappe.get_doc("Crushing Season", season)
	start, end = getdate(s.start_date), getdate(s.end_date)
	load = flt(s.indent_load_maund) or 500
	intake = flt(s.daily_intake_maund) or calc.derive_capacity(flt(s.crushing_target_maund), start, end)
	return frappe._dict(season=season, start=start, end=end, first=max(getdate(s.indent_start_date or start), start),
		load=load, validity=max(cint(s.indent_validity_days) or 3, 1), partial=flt(s.indent_partial_load_pct or 50),
		intake=intake, per_day=calc.daily_capacity_loads(intake, load), intake_derived=not flt(s.daily_intake_maund),
		status=s.status)


def rules(season: str) -> list[calc.Rule]:
	return [calc.Rule(name=r.name, quota_pct=flt(r.quota_pct), circle=r.circle, grower_category=r.grower_category,
		crop_type=r.crop_type, maturity=r.maturity, from_date=getdate(r.from_date) if r.from_date else None,
		to_date=getdate(r.to_date) if r.to_date else None, priority=cint(r.priority))
		for r in frappe.get_all("Indent Quota Rule", filters={"season": season, "enabled": 1}, fields=["*"])]


def survey_lines(season: str) -> tuple[list[dict], list[dict]]:
	"""(lines to indent, lines held back for an open overlap review)."""
	maturity = dict(frappe.get_all("Cane Variety", fields=["name", "maturity"], as_list=True))
	disabled = set(frappe.get_all("Grower", filters={"disabled": 1}, pluck="name"))
	rows = frappe.get_all("Cane Survey", filters={"docstatus": 1, "season": season, "survey_for": ["!=", "Competitor"],
		"grower": ["is", "set"]}, fields=["name", "grower", "grower_name", "circle", "village", "variety", "crop_type",
		"grower_category", "expected_production_maund", "overlap_status", "is_demo"], order_by="name asc")
	lines, held = [], []
	for r in rows:
		if r.grower in disabled or r.overlap_status == "Rejected" or flt(r.expected_production_maund) <= 0:
			continue
		line = dict(r, maturity=maturity.get(r.variety), expected=flt(r.expected_production_maund))
		(held if r.overlap_status == "Under Review" else lines).append(line)
	return lines, held


# ---------------------------------------------------------------- entitlement
def entitlements(season: str, std=None) -> list[dict]:
	"""One bucket per grower and supply window: entitled maund (after the circle's quota cap) and loads."""
	std = std or standards(season)
	rs = rules(season)
	lines, _held = survey_lines(season)
	default = calc.Rule(name="", quota_pct=100.0)
	for line in lines:
		rule = calc.match_rule(rs, line) or default
		line["rule"] = rule
		line["entitled"] = line["expected"] * rule.quota_pct / 100
	quotas = season_quotas(season)
	by_circle = defaultdict(float)
	for line in lines:
		by_circle[line["circle"]] += line["entitled"]
	factors = {c: calc.circle_factor(v, quotas.get(c, 0)) for c, v in by_circle.items()}
	buckets: dict[tuple, dict] = {}
	for line in lines:
		rule = line["rule"]
		start = max(rule.from_date or std.first, std.first)
		end = min(rule.to_date or std.end, std.end)
		if start > end:
			continue
		key = (line["grower"], start, end)
		b = buckets.setdefault(key, {"grower": line["grower"], "grower_name": line["grower_name"], "circle": line["circle"],
			"start": start, "end": end, "expected": 0.0, "entitled": 0.0, "lines": [], "is_demo": 1})
		b["expected"] += line["expected"]
		b["entitled"] += line["entitled"] * factors.get(line["circle"], 1)
		b["lines"].append(line)
		b["is_demo"] = b["is_demo"] and cint(line.get("is_demo"))
	for b in buckets.values():
		main = max(b["lines"], key=lambda x: x["expected"])  # the biggest field speaks for the bucket
		b.update(survey=main["name"], village=main["village"], variety=main["variety"], crop_type=main["crop_type"],
			maturity=main["maturity"], rule=main["rule"].name or None, priority=main["rule"].priority,
			loads=calc.loads_for(b["entitled"], std.load, std.partial), circle_factor=factors.get(b["circle"], 1))
	return sorted(buckets.values(), key=lambda b: (b["circle"] or "", b["grower"], b["start"]))


def plan_key(season, grower, start, i) -> str:
	return f"{season}|{grower}|{start}|{i}"


# ---------------------------------------------------------------- plan
def plan(season: str, today: date | None = None) -> frappe._dict:
	std = standards(season)
	today = getdate(today or nowdate())
	buckets = entitlements(season, std)
	existing = frappe.get_all("Cane Indent", filters={"season": season}, fields=["plan_key", "indent_date", "docstatus", "circle"])
	issued = {e.plan_key for e in existing if e.plan_key}
	used_per_day = defaultdict(int)
	for e in existing:
		if e.docstatus < 2:
			used_per_day[getdate(e.indent_date)] += 1
	capacity = {d: std.per_day - n for d, n in used_per_day.items()}

	demands = []
	for b in buckets:
		for i, ideal in enumerate(calc.ideal_dates(b["loads"], b["start"], b["end"]), start=1):
			key = plan_key(season, b["grower"], b["start"], i)
			if key in issued:
				continue
			start = max(b["start"], today)
			if start > b["end"]:
				continue  # its window has passed
			demands.append(calc.Demand(key=key, ideal=max(ideal, start), start=start, end=b["end"],
				priority=b["priority"], meta=b))
	placed, unplaced = calc.place(demands, capacity, std.per_day) if std.per_day else ({}, [d.key for d in demands])
	by_key = {d.key: d for d in demands}
	loads = [frappe._dict(key=k, date=day, bucket=by_key[k].meta) for k, day in placed.items()]
	return frappe._dict(std=std, buckets=buckets, loads=loads, unplaced=[by_key[k].meta for k in unplaced],
		existing=existing, used_per_day=used_per_day, today=today)


def nearest_sources() -> callable:
	"""village -> nearest active cane source by straight line (cached for one run)."""
	from sugarcane.calc import geo

	sources = [s for s in frappe.get_all("Cane Source", filters={"is_active": 1}, fields=["name", "latitude", "longitude"])
		if s.latitude and s.longitude]
	pins = {v.name: (v.latitude, v.longitude) for v in frappe.get_all("Cane Village", fields=["name", "latitude", "longitude"])
		if v.latitude and v.longitude}
	cache = {}

	def find(village):
		if village not in cache:
			pin = pins.get(village)
			cache[village] = min(sources, key=lambda s: geo.distance_m(pin[0], pin[1], s.latitude, s.longitude)).name \
				if pin and sources else None
		return cache[village]

	return find


def preview(season: str, from_date, to_date, circle: str | None = None, today=None) -> dict:
	from sugarcane.cane_indenting.numbering import numbers_left

	p = plan(season, today)
	std = p.std
	f, t = getdate(from_date), getdate(to_date)
	if t < f:
		frappe.throw(_("To date is before From date"))
	if (t - f).days > 61:
		frappe.throw(_("Generate at most 62 days at a time"))
	chosen = [x for x in p.loads if f <= x.date <= t and (not circle or x.bucket["circle"] == circle)]

	days = {}
	d = f
	while d <= t:
		days[d] = {"date": str(d), "new": 0, "existing": p.used_per_day.get(d, 0), "capacity": std.per_day, "maund": 0.0}
		d = add_days(d, 1)
	circles = defaultdict(lambda: {"new": 0, "maund": 0.0, "growers": set()})
	for x in chosen:
		days[x.date]["new"] += 1
		days[x.date]["maund"] += std.load
		c = circles[x.bucket["circle"]]
		c["new"] += 1
		c["maund"] += std.load
		c["growers"].add(x.bucket["grower"])
	by_circle = []
	for name, c in sorted(circles.items()):
		left = numbers_left(season, name)
		by_circle.append({"circle": name, "new": c["new"], "maund": c["maund"], "growers": len(c["growers"]),
			"numbers_left": left, "short": max(c["new"] - left, 0)})
	_lines, held = survey_lines(season)
	if circle:
		held = [h for h in held if h["circle"] == circle]
	warnings = []
	if std.per_day <= 0:
		warnings.append(_("Daily intake is 0 — set the crushing target or daily intake on season {0}").format(season))
	if std.status == "Closed":
		warnings.append(_("Season {0} is closed").format(season))
	for c in by_circle:
		if c["short"]:
			warnings.append(_("{0} needs {1} more indent numbers — add an Indent Range").format(c["circle"], c["short"]))
	if not rules(season):
		warnings.append(_("No quota rules for {0}: every grower gets 100 % of the surveyed cane over the whole season").format(season))
	ent = [b for b in p.buckets if not circle or b["circle"] == circle]
	return {
		"season": season, "from_date": str(f), "to_date": str(t), "circle": circle,
		"standards": {"load_maund": std.load, "validity_days": std.validity, "per_day": std.per_day, "intake_maund": std.intake,
			"intake_derived": std.intake_derived, "first": str(std.first), "end": str(std.end), "partial_pct": std.partial},
		"new": len(chosen), "new_maund": len(chosen) * std.load,
		"days": list(days.values()), "by_circle": by_circle,
		"held": [{"survey": h["name"], "grower": h["grower"], "grower_name": h["grower_name"], "circle": h["circle"],
			"expected": h["expected"]} for h in held][:200], "held_count": len(held),
		"unplaced": len([u for u in p.unplaced if not circle or u["circle"] == circle]),
		"season_totals": {"growers": len({b["grower"] for b in ent}), "expected": sum(b["expected"] for b in ent),
			"entitled": sum(b["entitled"] for b in ent), "loads": sum(b["loads"] for b in ent),
			"issued": len([e for e in p.existing if e.docstatus < 2 and (not circle or e.circle == circle)])},
		"warnings": warnings, "can_generate": bool(chosen) and not any(c["short"] for c in by_circle) and std.status != "Closed",
		"_chosen": chosen,
	}


def generate(season: str, from_date, to_date, circle: str | None = None, today=None, remarks: str | None = None) -> dict:
	check_role()
	pre = preview(season, from_date, to_date, circle, today)
	chosen = pre.pop("_chosen")
	if not pre["can_generate"]:
		frappe.throw("<br>".join(pre["warnings"]) or _("Nothing to generate for these dates"), title=_("Can't generate"))
	if len(chosen) > MAX_PER_RUN:
		frappe.throw(_("{0} indents in one run is too many — choose fewer days (at most {1})").format(len(chosen), MAX_PER_RUN))
	std = standards(season)
	source_of = nearest_sources()
	by_circle = defaultdict(list)
	for x in chosen:
		by_circle[x.bucket["circle"]].append(x)
	batches = []
	for c, items in sorted(by_circle.items()):
		items.sort(key=lambda x: (x.date, x.bucket["village"] or "", x.bucket["grower"], x.key))
		batch = frappe.get_doc({"doctype": "Indent Batch", "season": season, "circle": c, "from_date": pre["from_date"],
			"to_date": pre["to_date"], "generated_by": frappe.session.user, "generated_on": now_datetime(), "remarks": remarks,
			"is_demo": 1 if all(x.bucket["is_demo"] for x in items) else 0})
		batch.insert(ignore_permissions=True)
		days = defaultdict(lambda: {"indents": 0, "growers": set()})
		for i, x in enumerate(items):
			b = x.bucket
			frappe.get_doc({"doctype": "Cane Indent", "season": season, "batch": batch.name, "indent_date": x.date,
				"load_maund": std.load, "grower": b["grower"], "circle": b["circle"], "village": b["village"],
				"source": source_of(b["village"]), "survey": b["survey"], "variety": b["variety"], "crop_type": b["crop_type"],
				"maturity": b["maturity"], "quota_rule": b["rule"], "plan_key": x.key, "is_demo": b["is_demo"]}).insert(ignore_permissions=True)
			days[x.date]["indents"] += 1
			days[x.date]["growers"].add(b["grower"])
			if i % 100 == 0:
				frappe.publish_progress(100 * (i + 1) / len(items), title=_("Generating indents"), description=f"{c}: {i + 1} / {len(items)}")
		for d in sorted(days):
			batch.append("days", {"indent_date": d, "indents": days[d]["indents"], "total_maund": days[d]["indents"] * std.load,
				"growers": len(days[d]["growers"])})
		batch.indent_count = len(items)
		batch.total_maund = len(items) * std.load
		batch.grower_count = len({x.bucket["grower"] for x in items})
		batch.save(ignore_permissions=True)
		batches.append({"name": batch.name, "circle": c, "indents": len(items), "maund": batch.total_maund})
	from sugarcane.notify import indent_batches_generated

	indent_batches_generated(season, batches)
	return {"batches": batches, "indents": sum(b["indents"] for b in batches)}


def expire_due(today=None) -> int:
	"""Authorized / printed indents past their last valid day become Expired (daily scheduler job)."""
	day = getdate(today or nowdate())
	names = frappe.get_all("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
		"valid_to": ["<", day]}, pluck="name")
	for i in range(0, len(names), 500):
		frappe.db.sql("update `tabCane Indent` set status='Expired' where name in %(n)s", {"n": names[i:i + 500]})
	return len(names)
