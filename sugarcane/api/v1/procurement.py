"""Gate, weighbridge, yard, cash counter and day close (Phase 3).

Gate        GET find?q=  ·  GET offer?indent=&elp_registration=&vehicle_type=  ·  POST issue {...}  ·  POST cancel_token {name, reason}
Weighbridge GET terminal (which terminal this PC is, and its live reading)  ·  POST reading {weight_kg, stable, raw} (indicator agent)
            POST simulate {token, operation, weight_kg}  ·  POST capture {token, operation, manual_kg, note}
Yard        GET yard
Counter     GET bilties?q=&status=&day=  ·  POST pay {name, received_by, received_by_cnic}  ·  POST reverse {name, reason}
Day close   GET days  ·  GET day_checks?day=  ·  POST close_day {day, force}
Print       GET slip?kind=token|cpr|bilty&name=
Dashboard   GET insights?day=&days=
"""

from collections import Counter, defaultdict
from datetime import timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.cane_procurement import procurement as p

TOKEN_FIELDS = ["name", "status", "entry_type", "purchase_depot", "crushing_day", "issued_at", "issued_by", "indent", "elp_registration", "lp_verified",
	"grower", "grower_name", "father_name", "circle", "village_name", "source", "claimed_source", "point_name", "vehicle_no",
	"vehicle_type", "lane", "driver_name", "driver_cnic", "weighment", "gross_at", "cpr", "completed_at", "gate_reason",
	"govt_rate", "tpt_rate", "subsidy_rate", "additional_subsidy_rate", "road_cess_pct", "binding_kg_per_quintal", "print_count"]


def _clean(o):
	o = dict(o)
	o.pop("src_doc", None)
	return o


# ---------------------------------------------------------------- gate
@frappe.whitelist(methods=["GET"])
def masters() -> dict:
	return {
		"vehicle_types": frappe.get_all("Vehicle Type", filters={"is_active": 1}, fields=["name", "default_lane", "min_gross_kg",
			"max_gross_kg", "min_tare_kg", "max_tare_kg"], order_by="name"),
		"day": str(p.crushing_day()), "gate_source": frappe.db.get_value("Cane Source", {"source_type": "Factory Gate"}, "name"),
		"roles": sorted(set(frappe.get_roles()) & (p.GATE_ROLES | p.WEIGH_ROLES | p.CASH_ROLES | p.CLOSE_ROLES)),
		"depots": p.user_depots(),
		"at_mill": bool((p.GATE_ROLES - {p.DEPOT_ROLE}) & set(frappe.get_roles())),
	}


@frappe.whitelist(methods=["GET"])
def find(q: str, purchase_depot: str | None = None) -> list:
	p.need(p.GATE_ROLES | {"Yard Supervisor"}, _("use the gate"))
	return [_clean(o) for o in p.find(q, purchase_depot or None)]


@frappe.whitelist(methods=["GET"])
def offer(indent: str | None = None, elp_registration: str | None = None, vehicle_type: str | None = None,
		purchase_depot: str | None = None) -> dict:
	p.need(p.GATE_ROLES | {"Yard Supervisor"}, _("use the gate"))
	o = _clean(p.offer(indent or None, elp_registration or None, purchase_depot=purchase_depot or None))
	vt = vehicle_type or o["vehicle"].get("vehicle_type")
	if vt and not o["blocks"]:
		o["rates"] = p.resolve_rates(o["season"], o["circle"], o["source"], vt)
	return o


@frappe.whitelist(methods=["POST"])
def issue(indent=None, elp_registration=None, vehicle_no=None, vehicle_type=None, driver_name=None, driver_cnic=None,
		driver_mobile=None, gate_reason=None, purchase_depot=None) -> dict:
	tok = p.issue_token(indent or None, elp_registration or None, vehicle_no, vehicle_type, driver_name, driver_cnic, driver_mobile,
		gate_reason, purchase_depot=purchase_depot or None)
	return token(tok.name)


@frappe.whitelist(methods=["POST"])
def cancel_token(name: str, reason: str) -> dict:
	p.cancel_token(name, reason)
	return token(name)


@frappe.whitelist(methods=["GET"])
def token(name: str) -> dict:
	frappe.has_permission("Cane Token", "read", name, throw=True)
	t = frappe.db.get_value("Cane Token", name, TOKEN_FIELDS + ["docstatus", "cancel_reason"], as_dict=True)
	if not t:
		frappe.throw(_("Token {0} not found").format(name))
	t.weighment_doc = frappe.db.get_value("Cane Weighment", t.weighment, ["name", "gross_kg", "gross_at", "gross_terminal", "tare_kg",
		"tare_at", "tare_terminal", "net_kg", "manual_entry", "gross_note", "tare_note"], as_dict=True) if t.weighment else None
	t.cpr_doc = frappe.db.get_value("Cane Purchase Receipt", t.cpr, ["name", "payable_kg", "payable_maund", "govt_value", "tpt_amount",
		"payable_cpr", "bilty", "journal_entry", "docstatus"], as_dict=True) if t.cpr else None
	t.vehicle_limits = frappe.db.get_value("Vehicle Type", t.vehicle_type, ["min_gross_kg", "max_gross_kg", "min_tare_kg",
		"max_tare_kg"], as_dict=True)
	return t


@frappe.whitelist(methods=["GET"])
def tokens(day: str | None = None, status: str | None = None, limit: int = 100, purchase_depot: str | None = None) -> list:
	filters = {"docstatus": ["<", 2] if status == "Cancelled" else 1, "crushing_day": getdate(day) if day else p.crushing_day(),
		"purchase_depot": purchase_depot or ["is", "not set"]}
	if status:
		filters["status"] = status
	return frappe.get_list("Cane Token", filters=filters, fields=TOKEN_FIELDS, order_by="issued_at desc", limit_page_length=cint(limit))


# ---------------------------------------------------------------- weighbridge
@frappe.whitelist(methods=["GET"])
def terminal() -> dict:
	"""The terminal this PC is registered as (by IP), with the latest reading from its indicator."""
	from sugarcane.weighbridge.doctype.weighbridge_terminal.weighbridge_terminal import terminal_for_request

	try:
		t = terminal_for_request()
	except frappe.PermissionError as e:
		frappe.clear_last_message()
		return {"terminal": None, "error": str(e), "ip": getattr(frappe.local, "request_ip", None)}
	info = frappe.db.get_value("Weighbridge Terminal", t.name, ["name", "terminal_name", "weighbridge_no", "allowed_operations",
		"indicator_protocol", "lane", "camera_front_url", "depot"], as_dict=True)
	cfg = p.settings()
	return {"terminal": info, "reading": p.latest_reading(t.name), "fresh_s": cfg.fresh_s, "min_kg": cfg.min_kg,
		"ip": getattr(frappe.local, "request_ip", None), "can_manual": bool(p.MANUAL_ROLES & set(frappe.get_roles())),
		"recent": frappe.get_all("Cane Weighment", filters={"modified": [">", add_days(now_datetime(), -1)],
			"docstatus": ["<", 2]}, or_filters={"gross_terminal": t.name, "tare_terminal": t.name},
			fields=["name", "token", "status", "vehicle_no", "vehicle_type", "grower_name", "gross_kg", "tare_kg", "net_kg", "gross_at",
				"tare_at", "cpr", "manual_entry"], order_by="modified desc", limit=15)}


@frappe.whitelist(methods=["POST"])
def reading(weight_kg, stable=1, raw=None) -> dict:
	"""Indicator agent → server, several times a second."""
	return p.post_reading(weight_kg, stable, raw)


@frappe.whitelist(methods=["POST"])
def simulate(token=None, operation=None, weight_kg=None, stable=1, dispatch=None) -> dict:
	from sugarcane.weighbridge.doctype.weighbridge_terminal.weighbridge_terminal import terminal_for_request

	p.need(p.WEIGH_ROLES, _("use the weighbridge"))
	vt = frappe.db.get_value("Depot Dispatch", dispatch, "vehicle_type") if dispatch else None
	return p.simulate(terminal_for_request().name, token or None, operation, weight_kg, stable, vehicle_type=vt)


@frappe.whitelist(methods=["POST"])
def capture(token: str, operation: str, manual_kg=None, note=None) -> dict:
	out = p.capture(token, operation, manual_kg, note)
	out["token_doc"] = globals()["token"](token)
	return out


# ---------------------------------------------------------------- yard
@frappe.whitelist(methods=["GET"])
def yard(depot: str | None = None) -> dict:
	p.need(p.GATE_ROLES | p.WEIGH_ROLES | {"Yard Supervisor", "MIS Viewer"}, _("see the yard"))
	cfg = p.settings()
	now = now_datetime()
	rows = frappe.get_all("Cane Token", filters={"docstatus": 1, "status": ["in", list(p.OPEN_TOKEN)], "purchase_depot": depot or ["is", "not set"]},
		fields=["name", "status", "entry_type", "issued_at", "gross_at", "vehicle_no", "vehicle_type", "lane", "grower_name", "circle",
			"point_name", "source", "weighment"], order_by="issued_at asc", limit=0)
	gross = {w.name: w.gross_kg for w in frappe.get_all("Cane Weighment", filters={"name": ["in", [r.weighment for r in rows if r.weighment]]},
		fields=["name", "gross_kg"])} if rows else {}
	for r in rows:
		since = get_datetime(r.gross_at or r.issued_at)
		r.minutes = max(0, int((now - since).total_seconds() // 60))
		r.total_minutes = max(0, int((now - get_datetime(r.issued_at)).total_seconds() // 60))
		r.late = r.total_minutes > cfg.max_yard_hours * 60
		r.gross_kg = gross.get(r.weighment)
	waiting = [r for r in rows if r.status == "Issued"]
	inside = [r for r in rows if r.status == "Gross"]
	lanes = Counter(r.lane or "—" for r in rows)
	day = p.crushing_day(cfg=cfg)
	done = frappe.db.sql("""select count(*) n, avg(yard_minutes) yard from `tabCane Weighment` where docstatus = 1 and crushing_day = %s""",
		day, as_dict=True)[0]
	return {"waiting_gross": waiting, "waiting_tare": inside, "lanes": [{"lane": k, "count": v} for k, v in lanes.most_common()],
		"cane_in_yard_kg": sum(cint(r.gross_kg) for r in inside), "done_today": cint(done.n), "avg_yard_min": cint(done.yard),
		"max_yard_hours": cfg.max_yard_hours, "late": sum(1 for r in rows if r.late)}


# ---------------------------------------------------------------- cash counter
BILTY_FIELDS = ["name", "status", "cpr", "token", "crushing_day", "grower_name", "source", "point_name", "vehicle_no", "vehicle_type",
	"driver_name", "driver_cnic", "driver_mobile", "payable_maund", "tpt_rate", "amount", "paid_at", "paid_by", "received_by",
	"received_by_cnic", "payment_journal_entry", "print_count"]


@frappe.whitelist(methods=["GET"])
def bilties(q: str | None = None, status: str | None = "Unpaid", day: str | None = None, limit: int = 100) -> dict:
	p.need(p.CASH_ROLES | {"Cane Accountant", "Cane Manager", "MIS Viewer"}, _("see bilties"))
	cond, vals = ["docstatus = 1"], {}
	if status:
		cond.append("status = %(status)s")
		vals["status"] = status
	if day:
		cond.append("crushing_day = %(day)s")
		vals["day"] = getdate(day)
	if q:
		vals["q"], vals["v"] = f"%{q.strip()}%", "".join(ch for ch in q.upper() if ch.isalnum())
		cond.append("""(name like %(q)s or cpr like %(q)s or token like %(q)s or driver_name like %(q)s or driver_cnic like %(q)s
			or replace(driver_cnic, '-', '') like concat('%%', %(v)s, '%%')
			or replace(replace(upper(vehicle_no), '-', ''), ' ', '') like concat('%%', %(v)s, '%%'))""")
	rows = frappe.db.sql(f"select {', '.join(BILTY_FIELDS)} from `tabTPT Bilty` where {' and '.join(cond)} order by crushing_day desc, name desc "
		f"limit {cint(limit) or 100}", vals, as_dict=True)
	today = getdate()
	paid_today = frappe.db.sql("""select count(*) n, ifnull(sum(amount), 0) amt from `tabTPT Bilty` where status = 'Paid'
		and date(paid_at) = %s""", today, as_dict=True)[0]
	mine = frappe.db.sql("""select count(*) n, ifnull(sum(amount), 0) amt from `tabTPT Bilty` where status = 'Paid'
		and date(paid_at) = %s and paid_by = %s""", (today, frappe.session.user), as_dict=True)[0]
	unpaid = frappe.db.sql("select count(*) n, ifnull(sum(amount), 0) amt from `tabTPT Bilty` where docstatus = 1 and status = 'Unpaid'",
		as_dict=True)[0]
	return {"rows": rows, "paid_today": paid_today, "paid_by_me": mine, "unpaid": unpaid,
		"can_pay": bool(p.CASH_ROLES & set(frappe.get_roles())), "can_reverse": bool({"System Manager", "Cane Admin"} & set(frappe.get_roles()))}


@frappe.whitelist(methods=["POST"])
def pay(name: str, received_by: str | None = None, received_by_cnic: str | None = None) -> dict:
	b = p.pay_bilty(name, received_by, received_by_cnic)
	return frappe.db.get_value("TPT Bilty", b.name, BILTY_FIELDS, as_dict=True)


@frappe.whitelist(methods=["POST"])
def reverse(name: str, reason: str) -> dict:
	b = p.reverse_bilty_payment(name, reason)
	return frappe.db.get_value("TPT Bilty", b.name, BILTY_FIELDS, as_dict=True)


# ---------------------------------------------------------------- day close
@frappe.whitelist(methods=["GET"])
def days(limit: int = 30) -> dict:
	p.need(p.CLOSE_ROLES | {"Cane Manager", "MIS Viewer"}, _("see crushing days"))
	rows = frappe.db.sql("""select posting_date day, count(*) cprs, sum(payable_kg) kg, sum(payable_maund) maund, sum(govt_value) govt_value,
		sum(tpt_amount) tpt, sum(payable_cpr) payable, sum(case when ifnull(daily_purchase, '') = '' then 1 else 0 end) open_cprs
		from `tabCane Purchase Receipt` where docstatus = 1 group by posting_date order by posting_date desc limit %s""", cint(limit), as_dict=True)
	have = {getdate(r.day) for r in rows}
	moves = frappe.db.sql("""select dispatch_day day from `tabDepot Dispatch` where docstatus = 1 and posted_out = 0
		union select received_day from `tabDepot Dispatch` where docstatus = 1 and status = 'Received' and posted_in = 0""")
	for (d,) in moves:  # days with only depot trucks to post
		if d and getdate(d) not in have:
			rows.append(frappe._dict(day=d, cprs=0, kg=0, maund=0, govt_value=0, tpt=0, payable=0, open_cprs=0))
	trucks = dict(frappe.db.sql("""select day, count(*) from (select dispatch_day day from `tabDepot Dispatch` where docstatus = 1 and posted_out = 0
		union all select received_day from `tabDepot Dispatch` where docstatus = 1 and status = 'Received' and posted_in = 0) x group by day"""))
	rows.sort(key=lambda r: getdate(r.day), reverse=True)
	dcps = {getdate(d.crushing_day): d for d in frappe.get_all("Daily Cane Purchase", filters={"docstatus": ["<", 2]},
		fields=["name", "crushing_day", "docstatus", "status", "purchase_invoice", "reconciled", "total_govt_value", "remarks"])}
	cur = p.crushing_day()
	open_tokens = dict(frappe.db.sql("""select crushing_day, count(*) from `tabCane Token` where docstatus = 1 and status in ('Issued', 'Gross')
		group by crushing_day"""))
	for r in rows:
		r.dcp = dcps.get(getdate(r.day))
		r.current = getdate(r.day) >= cur
		r.open_tokens = cint(open_tokens.get(getdate(r.day)))
		r.depot_moves = cint(trucks.get(getdate(r.day)))
	return {"rows": rows, "current_day": str(cur), "can_close": bool(p.CLOSE_ROLES & set(frappe.get_roles()))}


@frappe.whitelist(methods=["GET"])
def day_checks(day: str | None = None) -> dict:
	"""Cane Day Close checks: each control account against its sub-ledger."""
	from erpnext.accounts.utils import get_balance_on

	p.need(p.CLOSE_ROLES | {"Cane Manager", "MIS Viewer"}, _("see the day checks"))
	cfg = p.settings()
	s = frappe.get_cached_doc("Sugar Settings")
	on = getdate(day) if day else None

	def bal(acc):
		return -flt(get_balance_on(acc, date=on, company=cfg.company)) if acc else 0

	date_cond = "and posting_date <= %(on)s" if on else ""
	vals = {"on": on}
	unpaid_bilty = flt(frappe.db.sql(f"select ifnull(sum(amount), 0) from `tabTPT Bilty` where docstatus = 1 and status = 'Unpaid' "
		f"{date_cond.replace('posting_date', 'crushing_day')}", vals)[0][0])
	cess = flt(frappe.db.sql(f"select ifnull(sum(road_cess_total), 0) from `tabCane Purchase Receipt` where docstatus = 1 and cess_deposited = 0 "
		f"{date_cond}", vals)[0][0])
	grower = flt(frappe.db.sql(f"select ifnull(sum(payable_cpr), 0) from `tabCane Purchase Receipt` where docstatus = 1 and payment_status = 'Unpaid' "
		f"{date_cond}", vals)[0][0])
	open_days = frappe.db.sql(f"""select count(distinct posting_date) from `tabCane Purchase Receipt` where docstatus = 1
		and ifnull(daily_purchase, '') = '' {date_cond}""", vals)[0][0]
	checks = [
		{"key": "clearing", "label": _("Cane Purchase Clearing"), "ledger": -bal(s.cane_purchase_clearing_account), "expected": 0,
			"hint": _("Back to 0 when every day with CPRs is closed ({0} day(s) open)").format(open_days), "open_days": open_days},
		{"key": "tpt", "label": _("TPT-Bilty Payable"), "ledger": bal(s.tpt_payable_account), "expected": unpaid_bilty,
			"hint": _("= unpaid bilties")},
		{"key": "cess", "label": _("Road Cess Payable - Govt"), "ledger": bal(s.road_cess_payable_account), "expected": cess,
			"hint": _("= cess on CPRs not yet deposited")},
		{"key": "grower", "label": _("Grower Payable"), "ledger": bal(s.grower_payable_account), "expected": grower,
			"hint": _("= payable on unpaid CPRs")},
	]
	if s.grower_loan_account and frappe.db.count("Grower Loan", {"docstatus": 1}):
		loans = flt(frappe.db.sql("""select ifnull(sum(outstanding), 0) from `tabGrower Loan` where docstatus = 1
			and status in ('Disbursed', 'Recovered')""")[0][0]) if not on else None
		checks.append({"key": "loans", "label": _("Grower Loan Receivable"), "ledger": -bal(s.grower_loan_account),
			"expected": loans if loans is not None else -bal(s.grower_loan_account), "hint": _("= outstanding loans (with markup)")})
	for c in checks:
		c["ledger"], c["expected"] = flt(c["ledger"], 2), flt(c["expected"], 2)
		c["ok"] = abs(c["ledger"] - c["expected"]) < 0.01 or (c["key"] == "clearing" and open_days)
		c["difference"] = flt(c["ledger"] - c["expected"], 2)
	return {"day": str(on) if on else None, "checks": checks}


@frappe.whitelist(methods=["POST"])
def close_day(day: str, force: int = 0) -> dict:
	force = cint(force)
	if force:
		p.need({"System Manager", "Cane Admin"}, _("close a day before it ends"))
	dcp = p.close_day(day, force=bool(force))
	return dcp.as_dict()


@frappe.whitelist()
def slip(kind: str, name: str):
	from sugarcane.cane_procurement.printing import KINDS, render

	if kind not in KINDS:
		frappe.throw(_("Unknown slip"))
	frappe.local.response.filename = f"{KINDS[kind][0]} {name}.pdf"
	frappe.local.response.filecontent = render(kind, [name])
	frappe.local.response.type = "download"


# ---------------------------------------------------------------- dashboard
@frappe.whitelist(methods=["GET"])
def insights(day: str | None = None, days: int = 14) -> dict:
	p.need(p.GATE_ROLES | p.WEIGH_ROLES | p.CASH_ROLES | p.CLOSE_ROLES | {"MIS Viewer", "Yard Supervisor"}, _("see procurement"))
	cfg = p.settings()
	cur = p.crushing_day(cfg=cfg)
	d = getdate(day) if day else (frappe.db.sql("select max(posting_date) from `tabCane Purchase Receipt` where docstatus = 1")[0][0] or cur)
	if not day and d < cur and frappe.db.exists("Cane Token", {"crushing_day": cur, "docstatus": 1}):
		d = cur
	start, end = p.day_window(d, cfg)
	cprs = frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": d}, fields=["name", "posted_at", "grower_name",
		"circle", "source", "point_name", "entry_type", "vehicle_type", "payable_kg", "payable_maund", "net_kg", "binding_kg", "govt_value",
		"subsidy", "additional_subsidy", "road_cess_total", "tpt_amount", "payable_cpr"], limit=0)
	for c in cprs:
		c.from_name = c.point_name or c.source
	toks = frappe.get_all("Cane Token", filters={"docstatus": 1, "crushing_day": d}, fields=["status", "entry_type", "issued_at"], limit=0)
	hours = defaultdict(float)
	for c in cprs:
		h = int((get_datetime(c.posted_at) - start).total_seconds() // 3600)
		hours[max(0, min(h, 23))] += flt(c.payable_maund)

	def group(key):
		g = defaultdict(lambda: {"loads": 0, "maund": 0.0, "value": 0.0, "tpt": 0.0})
		for c in cprs:
			r = g[c.get(key) or "—"]
			r["loads"] += 1
			r["maund"] += flt(c.payable_maund)
			r["value"] += flt(c.payable_cpr)
			r["tpt"] += flt(c.tpt_amount)
		return sorted(({"name": k, **{x: round(y, 3) for x, y in v.items()}} for k, v in g.items()), key=lambda r: -r["maund"])

	trend = frappe.db.sql("""select posting_date day, count(*) loads, sum(payable_maund) maund, sum(govt_value) govt_value,
		sum(payable_cpr) payable, sum(tpt_amount) tpt from `tabCane Purchase Receipt` where docstatus = 1 and posting_date between %s and %s
		group by posting_date order by posting_date""", (add_days(d, -(cint(days) - 1)), d), as_dict=True)
	season = frappe.db.get_value("Crushing Season", cfg.season, ["name", "crushing_target_maund", "daily_intake_maund", "start_date"],
		as_dict=True) or {}
	season_maund = flt(frappe.db.sql("select ifnull(sum(payable_maund), 0) from `tabCane Purchase Receipt` where docstatus = 1 and season = %s",
		cfg.season)[0][0])
	st = Counter(t.status for t in toks)
	unpaid = frappe.db.sql("select count(*) n, ifnull(sum(amount), 0) amt from `tabTPT Bilty` where docstatus = 1 and status = 'Unpaid'",
		as_dict=True)[0]
	dcp = frappe.db.get_value("Daily Cane Purchase", {"crushing_day": d, "docstatus": 1}, ["name", "purchase_invoice", "reconciled"], as_dict=True)
	tot = lambda f: round(sum(flt(c.get(f)) for c in cprs), 2)  # noqa: E731
	return {
		"day": str(d), "current_day": str(cur), "window": [str(start), str(end)], "closed": dcp,
		"kpi": {"tokens": len(toks), "waiting_gross": st.get("Issued", 0), "waiting_tare": st.get("Gross", 0), "cprs": len(cprs),
			"maund": round(tot("payable_maund"), 3), "net_kg": tot("net_kg"), "binding_kg": tot("binding_kg"), "govt_value": tot("govt_value"),
			"subsidy": tot("subsidy") + tot("additional_subsidy"), "cess": tot("road_cess_total"), "tpt": tot("tpt_amount"),
			"payable": tot("payable_cpr"), "elp_loads": sum(1 for c in cprs if c.entry_type == "ELP Verified"),
			"avg_load_maund": round(tot("payable_maund") / len(cprs), 1) if cprs else 0},
		"season": {**season, "maund": round(season_maund, 1)},
		"hours": [{"hour": f"{(start + timedelta(hours=h)).strftime('%H')}:00", "maund": round(hours.get(h, 0), 1)} for h in range(24)],
		"by_circle": group("circle"), "by_source": group("from_name"),
		"by_source_type": group("source"), "by_vehicle": group("vehicle_type"), "by_entry": group("entry_type"),
		"trend": [{**r, "day": str(r.day)} for r in trend], "unpaid_bilties": unpaid,
		"latest": sorted(cprs, key=lambda c: get_datetime(c.posted_at), reverse=True)[:12],
	}
