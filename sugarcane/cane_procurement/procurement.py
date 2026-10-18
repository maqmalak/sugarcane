"""Gate → weighbridge → CPR → TPT bilty → day close (Phase 3).

Token      issued at the gate from the grower's indent, or from an ELP registration the audit team accepted. The rates are
           resolved then (Vehicle Type → Loading Point → Source → Circle → Season, see calc/rates.py) and copied onto the
           token, so a rate change during the day never touches a vehicle already inside.
           A load whose loading point was not verified is paid at the mill-gate rates (Sugar Settings → tpt_requires_elp).
Weighment  gross on arrival, tare after unloading. The weight is never typed in: it is the latest stable reading the
           terminal's indicator agent sent (Weighment Reading Log), checked against the vehicle type's limits. A supervisor
           can type a weight when the indicator is offline, with a note; it is flagged on the weighment.
CPR        created and submitted on tare. Its Journal Entry follows calc/cpr.journal_lines (balanced by construction);
           a TPT Bilty is created for the driver when TPT > 0.
Bilty      paid at the cash counter: Journal Entry Dr TPT-Bilty Payable / Cr Cash Counter - Cane.
Day close  one Purchase Invoice (update_stock) per crushing day (07:00 → 07:00) for the day's payable kg at Σ govt value,
           credit Cane Purchase Clearing; the day's CPR journal rows are then reconciled against it, so clearing = 0.
"""

import json
import random
from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import cint, flt, get_datetime, getdate, now_datetime

from sugarcane.calc import rates as rate_calc
from sugarcane.vehicle_tracking.elp import canon, normalize_vehicle

MANAGERS = {"System Manager", "Cane Manager", "Cane Admin"}
GATE_ROLES = MANAGERS | {"Token Clerk", "Depot User"}
WEIGH_ROLES = {"System Manager", "Cane Admin", "Gross Weighman", "Tare Weighman", "Depot User"}
DEPOT_ROLE = "Depot User"
MANUAL_ROLES = {"System Manager", "Cane Admin", "Cane Manager"}
CASH_ROLES = {"System Manager", "Cane Admin", "Cane Cashier"}
CLOSE_ROLES = {"System Manager", "Cane Admin", "Cane Accountant"}
OPEN_TOKEN = ("Issued", "Gross")
READING_KEY = "sugarcane:wb:{0}"


def need(roles: set, what: str):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to {0}").format(what), frappe.PermissionError)


def user_depots(user=None) -> list[str]:
	"""Depots a user works at: every active depot for managers, otherwise the depots that list the user."""
	user = user or frappe.session.user
	if MANAGERS & set(frappe.get_roles(user)):
		return frappe.get_all("Cane Depot", filters={"is_active": 1}, pluck="name", order_by="name")
	return sorted(set(frappe.get_all("Cane Depot User", filters={"parenttype": "Cane Depot", "user": user}, pluck="parent")))


def check_place(depot: str | None, roles_at_mill: set, what: str):
	"""A depot operation needs a manager or a user of that depot; a mill operation needs one of the mill roles."""
	roles = set(frappe.get_roles())
	if depot:
		if not (MANAGERS & roles) and not (DEPOT_ROLE in roles and depot in user_depots()):
			frappe.throw(_("You are not a user of depot {0}, so you can't {1} there").format(depot, what), frappe.PermissionError)
	elif not roles_at_mill & roles:
		frappe.throw(_("You are not allowed to {0} at the mill").format(what), frappe.PermissionError)


def settings() -> frappe._dict:
	s = frappe.get_cached_doc("Sugar Settings")
	return frappe._dict(
		company=s.company, season=s.active_season, maund_kg=flt(s.maund_kg) or 40, day_start=cint(s.crushing_day_start_hour),
		tpt_requires_elp=cint(s.get("tpt_requires_elp")), fresh_s=cint(s.get("weight_fresh_seconds")) or 10,
		min_kg=cint(s.get("min_weight_kg")) or 200, max_yard_hours=cint(s.get("max_yard_hours")) or 12,
		supplier=s.daily_purchase_supplier, item=s.cane_item, warehouse=s.cane_yard_warehouse, cost_center=s.cost_center,
		clearing=s.cane_purchase_clearing_account, tpt_account=s.tpt_payable_account, cash_account=s.cash_counter_account,
		transit=s.get("transit_warehouse"), freight_account=s.get("freight_account"), commission_account=s.get("depot_commission_account"),
		shortage_account=s.get("transit_shortage_account"),
		accounts={k: s.get(k) for k in ("cane_purchase_clearing_account", "subsidy_purchase_account", "additional_subsidy_account",
			"road_cess_expense_account", "road_cess_payable_account", "tpt_payable_account", "grower_loan_account",
			"grower_payable_account")},
	)


# ---------------------------------------------------------------- crushing day
def crushing_day(dt=None, cfg=None):
	"""The crushing day a moment belongs to: 06:59 on 2 Nov is still the 1 Nov day (day starts 07:00)."""
	cfg = cfg or settings()
	return (get_datetime(dt or now_datetime()) - timedelta(hours=cfg.day_start)).date()


def day_window(day, cfg=None) -> tuple[datetime, datetime]:
	cfg = cfg or settings()
	start = datetime.combine(getdate(day), time(hour=cfg.day_start))
	return start, start + timedelta(days=1)


def season_for(day) -> str:
	s = frappe.db.get_value("Crushing Season", {"start_date": ["<=", day], "end_date": [">=", day], "status": ["!=", "Planned"]},
		"name") or frappe.db.get_value("Crushing Season", {"start_date": ["<=", day], "end_date": [">=", day]}, "name")
	if not s:
		frappe.throw(_("No crushing season covers {0}").format(frappe.utils.formatdate(day)))
	return s


# ---------------------------------------------------------------- rates
def gate_source() -> str:
	s = frappe.db.get_value("Cane Source", {"source_type": "Factory Gate", "is_active": 1}, "name", order_by="creation asc")
	if not s:
		frappe.throw(_("Add the mill gate as a Cane Source of type Factory Gate"))
	return s


def _unset_zero(values: dict) -> dict:
	"""A 0 on a circle / source / vehicle type is an unfilled Frappe number, so the season value applies. (TPT rows by
	vehicle type are explicit, so a 0 TPT row is a real 0.)"""
	return {k: (v if flt(v) else None) for k, v in values.items()}


def resolve_rates(season: str, circle: str | None, source: str | None, vehicle_type: str | None) -> dict:
	s = frappe.db.get_value("Crushing Season", season, ["govt_rate", "road_cess_pct", "grower_cess_share_pct", "subsidy_rate",
		"additional_subsidy_rate", "tpt_rate", "binding_kg_per_quintal", "garbage_pct"], as_dict=True) or {}
	c = _unset_zero(frappe.db.get_value("Cane Circle", circle, ["subsidy_rate"], as_dict=True) or {}) if circle else {}
	src = {}
	if source:
		src = _unset_zero(frappe.db.get_value("Cane Source", source, ["road_cess_pct"], as_dict=True) or {})
		if vehicle_type:
			row = frappe.db.get_value("Cane Source TPT Rate", {"parent": source, "parenttype": "Cane Source",
				"vehicle_type": vehicle_type}, "tpt_rate")
			if row is not None:
				src["tpt_rate"] = flt(row)
	vt = _unset_zero(frappe.db.get_value("Vehicle Type", vehicle_type, ["binding_kg_per_quintal", "garbage_pct", "garbage_fixed_kg"],
		as_dict=True) or {}) if vehicle_type else {}
	r = rate_calc.resolve(s, circle=c, source=src, vehicle_type=vt)
	if not flt(r["govt_rate"]):
		frappe.throw(_("Set the govt rate on season {0}").format(season))
	values = {f: flt(r[f]) for f in rate_calc.RATE_FIELDS}
	values["garbage_fixed_kg"] = cint(values["garbage_fixed_kg"])
	values["rate_levels"] = json.dumps({f: r[f"{f}_level"] for f in rate_calc.RATE_FIELDS if r[f"{f}_level"]})
	return values


# ---------------------------------------------------------------- gate: find what was scanned
def _registration_for(indent: str | None = None, name: str | None = None):
	if name:
		return frappe.get_doc("LP Vehicle Registration", name)
	n = frappe.db.get_value("LP Vehicle Registration", {"indent": indent, "status": ["!=", "Cancelled"]}, "name",
		order_by="registered_at desc") if indent else None
	return frappe.get_doc("LP Vehicle Registration", n) if n else None


def open_token_for_vehicle(vehicle_no: str) -> str | None:
	rows = frappe.db.sql("""select name from `tabCane Token` where docstatus = 1 and status in ('Issued', 'Gross')
		and replace(replace(upper(vehicle_no), '-', ''), ' ', '') = %(v)s limit 1""", {"v": canon(vehicle_no)})
	return rows[0][0] if rows else None


def token_for_indent(indent: str) -> str | None:
	return frappe.db.get_value("Cane Token", {"indent": indent, "docstatus": 1, "status": ["!=", "Cancelled"]}, "name")


def offer(indent: str | None = None, elp_registration: str | None = None, day=None, purchase_depot: str | None = None) -> dict:
	"""What a token for this indent / ELP load would be: entry type, source for rates, problems that block it, and the
	rates. Shown on the gate screen before issuing, and re-checked by issue_token. With a purchase depot the cane is
	bought at that depot, at the depot's rates (no ELP involved)."""
	cfg = settings()
	day = getdate(day) if day else crushing_day(cfg=cfg)
	reg = None if purchase_depot else _registration_for(indent, elp_registration)
	if reg and not indent:
		indent = reg.indent
	ind = frappe.get_doc("Cane Indent", indent) if indent and frappe.db.exists("Cane Indent", indent) else None
	if indent and not ind:
		frappe.throw(_("Indent {0} not found").format(indent))
	if not ind and not reg:
		frappe.throw(_("Scan the indent or the ELP slip"))

	blocks, notes = [], []
	entry, needs_reason = ("Depot" if purchase_depot else "Gate"), False
	if reg:
		if reg.token:
			blocks.append(_("ELP load {0} already has token {1}").format(reg.name, reg.token))
		if reg.status == "Accepted":
			entry = "ELP Verified"
		else:
			needs_reason = True
			notes.append({
				"In Transit": _("ELP load {0} has no gate arrival yet — take the arrival photos on the ELP gate page first, or issue at the gate rates"),
				"Arrived": _("ELP load {0} is waiting for the audit team — wait for the verdict, or issue at the gate rates"),
				"Rejected": _("The audit team rejected ELP load {0}: {1} — only the gate rates apply"),
				"Cancelled": _("ELP load {0} was cancelled — only the gate rates apply"),
			}[reg.status].format(reg.name, reg.reject_reason or ""))
	if ind:
		if ind.docstatus != 1:
			blocks.append(_("Indent {0} is not authorized").format(ind.name))
		elif ind.status not in ("Authorized", "Printed") and not (ind.status == "Used" and reg and ind.token == reg.name):
			blocks.append(_("Indent {0} is {1}").format(ind.name, _(ind.status)))
		other = token_for_indent(ind.name)
		if other:
			blocks.append(_("Indent {0} was already used by token {1}").format(ind.name, other))
		if entry in ("Gate", "Depot") and not reg and ind.valid_from and ind.valid_to and not (getdate(ind.valid_from) <= day <= getdate(ind.valid_to)):
			blocks.append(_("Indent {0} is valid {1} – {2}, not on {3}").format(ind.name, frappe.utils.formatdate(ind.valid_from),
				frappe.utils.formatdate(ind.valid_to), frappe.utils.formatdate(day)))

	src_doc = ind or reg
	claimed = (reg.source if reg else None) or (ind.source if ind else None)
	if purchase_depot:
		source = frappe.db.get_value("Cane Depot", purchase_depot, "source") or gate_source()
		if claimed and claimed != source:
			notes.append(_("The indent is for {0}; bought at {1}, so {1}'s rates apply").format(claimed, purchase_depot))
	elif entry == "ELP Verified" or not cfg.tpt_requires_elp:
		source = claimed or gate_source()
	else:
		source = gate_source()
		if claimed and claimed != source:
			notes.append(_("Not verified by ELP: TPT and source rates of {0} apply instead of {1}").format(source, claimed))

	grower = (ind.grower if ind else None) or (reg.grower if reg else None)
	if not grower:
		blocks.append(_("No grower on the indent / ELP load"))
	g = frappe.db.get_value("Grower", grower, ["grower_name", "father_name", "cnic", "passbook_no", "circle", "village",
		"village_name", "disabled"], as_dict=True) if grower else frappe._dict()
	if g.disabled:
		blocks.append(_("Grower {0} is disabled").format(grower))
	vehicle = frappe._dict(vehicle_no=reg.vehicle_no if reg else None, vehicle_type=reg.vehicle_type if reg else None,
		driver_name=reg.driver_name if reg else None, driver_cnic=reg.driver_cnic if reg else None,
		driver_mobile=reg.driver_mobile if reg else None)
	return frappe._dict(
		indent=ind.name if ind else None, elp_registration=reg.name if reg else None, elp_status=reg.status if reg else None,
		entry_type=entry, needs_reason=needs_reason, blocks=blocks, notes=notes, day=str(day),
		season=(ind.season if ind else reg.season) or season_for(day), grower=grower, circle=(ind.circle if ind else None) or g.circle,
		village=(ind.village if ind else None) or g.village, claimed_source=claimed, source=source,
		loading_point=reg.loading_point if reg else None, depot=reg.depot if reg else None, point_name=reg.point_name if reg else None,
		load_maund=ind.load_maund if ind else None, valid_to=str(ind.valid_to) if ind and ind.valid_to else None,
		lp_verified=cint(reg.lp_verified) if reg else 0, vehicle=vehicle, grower_info=g, src_doc=src_doc.doctype,
		purchase_depot=purchase_depot,
	)


def find(q: str, purchase_depot: str | None = None) -> list[dict]:
	"""Gate search: an ELP registration no., indent no., token no. or vehicle no. → loads that can get a token. At a depot
	only indents are looked up."""
	q = (q or "").strip()
	if not q:
		return []
	out, seen = [], set()

	def add(**kw):
		key = kw.get("elp_registration") or kw.get("indent")
		if key and key not in seen:
			seen.add(key)
			try:
				o = offer(kw.get("indent"), kw.get("elp_registration"), purchase_depot=purchase_depot)
			except frappe.ValidationError as e:
				o = frappe._dict(indent=kw.get("indent"), elp_registration=kw.get("elp_registration"), blocks=[str(e)], notes=[])
			o.pop("src_doc", None)
			out.append(o)

	if frappe.db.exists("Cane Token", q):
		t = frappe.db.get_value("Cane Token", q, ["name", "status", "vehicle_no", "grower_name"], as_dict=True)
		return [{"token": t.name, "token_status": t.status, "blocks": [_("Token {0} is {1}").format(t.name, _(t.status))], "notes": []}]
	if purchase_depot:
		if frappe.db.exists("Cane Indent", q):
			add(indent=q)
		return out
	if frappe.db.exists("LP Vehicle Registration", q):
		add(elp_registration=q)
	if frappe.db.exists("Cane Indent", q):
		reg = _registration_for(q)
		add(indent=q, elp_registration=reg.name if reg else None)
	v = canon(q)
	if len(v) >= 3:
		for r in frappe.db.sql(f"""select name, indent from `tabLP Vehicle Registration` where status in ('In Transit', 'Arrived',
				'Accepted', 'Rejected') and ifnull(token, '') = '' and {_same_vehicle()} order by registered_at desc limit 5""",
				{"v": v}, as_dict=True):
			add(elp_registration=r.name, indent=r.indent)
	return out


def _same_vehicle(column="vehicle_no"):
	return f"replace(replace(upper({column}), '-', ''), ' ', '') = %(v)s"


# ---------------------------------------------------------------- gate: issue
def issue_token(indent=None, elp_registration=None, vehicle_no=None, vehicle_type=None, driver_name=None, driver_cnic=None,
		driver_mobile=None, gate_reason=None, issued_at=None, is_demo=0, purchase_depot=None):
	need(GATE_ROLES, _("issue cane tokens"))
	check_place(purchase_depot, GATE_ROLES - {DEPOT_ROLE}, _("issue cane tokens"))
	cfg = settings()
	at = get_datetime(issued_at) if issued_at else now_datetime()
	day = crushing_day(at, cfg)
	o = offer(indent, elp_registration, day, purchase_depot or None)
	if o.blocks:
		frappe.throw("<br>".join(o.blocks), title=_("Token not issued"))
	if o.needs_reason and not (gate_reason or "").strip():
		frappe.throw(_("This load was registered at a loading point but is not verified. Give the reason for taking it at the gate rates."),
			title=_("Reason needed"))

	vehicle_no = normalize_vehicle(vehicle_no or o.vehicle.vehicle_no)
	if not vehicle_no:
		frappe.throw(_("Enter the vehicle number"))
	if o.vehicle.vehicle_no and canon(o.vehicle.vehicle_no) != canon(vehicle_no):
		frappe.throw(_("Vehicle {0} is not the one registered at the loading point ({1})").format(vehicle_no, o.vehicle.vehicle_no),
			title=_("Different vehicle"))
	master = frappe.db.sql(f"select name, vehicle_type, is_blacklisted, blacklist_reason, driver_name, driver_cnic, driver_mobile "
		f"from `tabSugar Vehicle` where {_same_vehicle('name')} limit 1", {"v": canon(vehicle_no)}, as_dict=True)
	master = master[0] if master else frappe._dict()
	if cint(master.is_blacklisted):
		frappe.throw(_("Vehicle {0} is blacklisted: {1}").format(vehicle_no, master.blacklist_reason or ""), title=_("Blacklisted"))
	other = open_token_for_vehicle(vehicle_no)
	if other:
		frappe.throw(_("Vehicle {0} is already inside on token {1}").format(vehicle_no, other), title=_("Duplicate vehicle"))
	vehicle_type = vehicle_type or o.vehicle.vehicle_type or master.vehicle_type
	if not vehicle_type:
		frappe.throw(_("Choose the vehicle type"))

	g = o.grower_info
	tok = frappe.get_doc({
		"doctype": "Cane Token", "entry_type": o.entry_type, "purchase_depot": purchase_depot or None, "season": o.season, "company": cfg.company, "crushing_day": day,
		"issued_at": at, "issued_by": frappe.session.user, "elp_registration": o.elp_registration, "lp_verified": o.lp_verified,
		"gate_reason": (gate_reason or "").strip() or None if o.needs_reason else None,
		"indent": o.indent, "grower": o.grower, "grower_name": g.grower_name, "father_name": g.father_name, "cnic": g.cnic,
		"passbook_no": g.passbook_no, "circle": o.circle, "village": o.village,
		"village_name": g.village_name or frappe.db.get_value("Cane Village", o.village, "village_name"),
		"source": o.source, "claimed_source": o.claimed_source, "loading_point": o.loading_point, "depot": o.depot,
		"point_name": o.point_name, "vehicle": master.name, "vehicle_no": vehicle_no, "vehicle_type": vehicle_type,
		"lane": frappe.db.get_value("Vehicle Type", vehicle_type, "default_lane"),
		"driver_name": driver_name or o.vehicle.driver_name or master.driver_name,
		"driver_cnic": driver_cnic or o.vehicle.driver_cnic or master.driver_cnic,
		"driver_mobile": driver_mobile or o.vehicle.driver_mobile or master.driver_mobile,
		"is_demo": cint(is_demo),
		**resolve_rates(o.season, o.circle, o.source, vehicle_type),
	})
	tok.flags.ignore_permissions = True
	tok.insert()
	tok.submit()
	if o.indent:
		frappe.db.set_value("Cane Indent", o.indent, {"status": "Used", "token": tok.name, "used_on": at}, update_modified=False)
	if o.elp_registration:
		frappe.db.set_value("LP Vehicle Registration", o.elp_registration, "token", tok.name, update_modified=False)
	return tok


def cancel_token(name: str, reason: str):
	need(MANAGERS, _("cancel tokens"))
	if not (reason or "").strip():
		frappe.throw(_("Give the reason for cancelling the token"))
	tok = frappe.get_doc("Cane Token", name)
	tok.db_set("cancel_reason", reason)
	tok.flags.ignore_permissions = True
	tok.cancel()
	return tok


def on_token_cancel(tok):
	tok.db_set("status", "Cancelled")
	if tok.weighment:
		w = frappe.get_doc("Cane Weighment", tok.weighment)
		if w.docstatus == 1:
			w.flags.ignore_permissions = True
			w.cancel()
		elif w.docstatus == 0:
			w.db_set("status", "Cancelled")
	if tok.indent and frappe.db.get_value("Cane Indent", tok.indent, "token") == tok.name:
		# give the indent back: Used by the ELP verdict if that is where it came from, otherwise as it was before the gate
		frappe.db.set_value("Cane Indent", tok.indent, {"status": "Used" if tok.lp_verified else "Printed",
			"token": tok.elp_registration if tok.lp_verified else None, **({} if tok.lp_verified else {"used_on": None})},
			update_modified=False)
	if tok.elp_registration:
		frappe.db.set_value("LP Vehicle Registration", tok.elp_registration, "token", None, update_modified=False)


# ---------------------------------------------------------------- weighbridge readings
def _cache_reading(terminal: str, reading: dict):
	frappe.cache.set_value(READING_KEY.format(terminal), json.dumps(reading), expires_in_sec=3600)


def latest_reading(terminal: str) -> dict | None:
	v = frappe.cache.get_value(READING_KEY.format(terminal))
	if not v:
		return None
	r = json.loads(v) if isinstance(v, (str, bytes)) else v
	r["age_s"] = round((now_datetime() - get_datetime(r["at"])).total_seconds(), 1)
	return r


def post_reading(weight_kg, stable=1, raw=None, source="Indicator", terminal=None) -> dict:
	"""From the terminal's indicator agent (or the simulator), several times a second. Kept in the cache; a reading is
	written to the Weighment Reading Log when a weighment uses it."""
	from sugarcane.weighbridge.doctype.weighbridge_terminal.weighbridge_terminal import terminal_for_request

	t = terminal or terminal_for_request().name
	reading = {"weight_kg": cint(weight_kg), "stable": cint(stable), "raw": (raw or "")[:140], "source": source,
		"at": str(now_datetime()), "ip": getattr(frappe.local, "request_ip", None), "user": frappe.session.user}
	_cache_reading(t, reading)
	frappe.publish_realtime("sugarcane_weight", {"terminal": t, **reading}, after_commit=False)
	return reading


def simulate(terminal: str, token: str | None = None, operation: str | None = None, weight_kg=None, stable=1, vehicle_type=None) -> dict:
	"""Simulator terminals only: put a weight on the bridge. Without a weight, a plausible one for the token's (or the given)
	vehicle type; `operation` is Gross / Tare or a dispatch step (Depot Tare, Mill Gross, …)."""
	if frappe.db.get_value("Weighbridge Terminal", terminal, "indicator_protocol") != "Simulator":
		frappe.throw(_("{0} is not a simulator terminal").format(terminal))
	vehicle_type = vehicle_type or (frappe.db.get_value("Cane Token", token, "vehicle_type") if token else None)
	if weight_kg in (None, "") and vehicle_type:
		vt = frappe.db.get_value("Vehicle Type", vehicle_type, ["min_gross_kg", "max_gross_kg", "min_tare_kg", "max_tare_kg"], as_dict=True) or {}
		if (operation or "Gross").endswith("Tare"):
			lo, hi = cint(vt.get("min_tare_kg")) or 2500, cint(vt.get("max_tare_kg")) or 5000
		else:
			lo, hi = cint(vt.get("min_gross_kg")) or 6000, cint(vt.get("max_gross_kg")) or 20000
			lo, hi = lo + (hi - lo) // 4, hi - (hi - lo) // 5
		weight_kg = round(random.randint(lo, hi), -1)
	return post_reading(cint(weight_kg), stable, f"SIM {cint(weight_kg):>7}kg {'ST' if cint(stable) else 'US'}", "Simulator", terminal)


def _limits(vehicle_type, operation, kg) -> str | None:
	vt = frappe.db.get_value("Vehicle Type", vehicle_type, ["min_gross_kg", "max_gross_kg", "min_tare_kg", "max_tare_kg"], as_dict=True)
	if not vt:
		return None
	lo, hi = (vt.min_gross_kg, vt.max_gross_kg) if operation == "Gross" else (vt.min_tare_kg, vt.max_tare_kg)
	if (cint(lo) and kg < cint(lo)) or (cint(hi) and kg > cint(hi)):
		return _("{0} weight {1} kg is outside the {2} limits ({3}–{4} kg)").format(_(operation), f"{kg:,}", vehicle_type,
			f"{cint(lo):,}", f"{cint(hi):,}")
	return None


def take_weight(t: str, label: str, manual_kg=None, note=None, at=None, vehicle_type=None, kind=None) -> tuple[int, dict, str]:
	"""The weight to record on terminal `t`: the latest stable, fresh reading — or a typed-in weight from a Cane Admin with a
	note. Checks the lowest weight and the vehicle type's gross / tare limits (`kind`); returns (kg, reading, note)."""
	cfg = settings()
	roles = set(frappe.get_roles())
	note = (note or "").strip()
	if manual_kg not in (None, ""):
		if not MANUAL_ROLES & roles:
			frappe.throw(_("Only a Cane Admin can type in a weight"), frappe.PermissionError)
		if not note:
			frappe.throw(_("Say why the weight is typed in (for example: indicator offline)"))
		reading = {"weight_kg": cint(manual_kg), "stable": 1, "raw": "", "source": "Manual", "at": str(at or now_datetime())}
	else:
		reading = latest_reading(t)
		if not reading:
			frappe.throw(_("No reading from {0}. Is the indicator agent running?").format(t), title=_("No weight"))
		if not cint(reading["stable"]):
			frappe.throw(_("The weight is not stable yet"), title=_("Not stable"))
		if reading["age_s"] > cfg.fresh_s and not at:
			frappe.throw(_("The last reading from {0} is {1} s old. Is the indicator agent running?").format(t, int(reading["age_s"])),
				title=_("Old reading"))
	kg = cint(reading["weight_kg"])
	if kg < cfg.min_kg:
		frappe.throw(_("{0} kg is below the lowest weight accepted ({1} kg) — is the vehicle on the bridge?").format(kg, cfg.min_kg))
	problem = _limits(vehicle_type, kind, kg) if vehicle_type and kind else None
	if problem:
		if not (MANUAL_ROLES & roles and note):
			frappe.throw(problem + "<br>" + _("A Cane Admin can accept it with a note."), title=_("Outside the vehicle limits"))
		note = f"{problem}. {note}"
	return kg, reading, note


def reading_log(t: str, kg: int, reading: dict, label: str, note: str | None, **links) -> str:
	log = frappe.get_doc({"doctype": "Weighment Reading Log", "terminal": t, "read_at": get_datetime(reading["at"]), "weight_kg": kg,
		"stable": cint(reading["stable"]), "source": reading["source"], "raw": reading.get("raw"), "used_for": label,
		"ip_address": getattr(frappe.local, "request_ip", None), "user": frappe.session.user, "remarks": note or None, **links})
	log.insert(ignore_permissions=True)
	return log.name


def terminal_depot(t: str) -> str | None:
	return frappe.db.get_value("Weighbridge Terminal", t, "depot") or None


def capture(token: str, operation: str, manual_kg=None, note=None, terminal=None, at=None, is_demo=0) -> dict:
	"""Take the gross or tare weight for a token from the terminal the request comes from."""
	from sugarcane.weighbridge.doctype.weighbridge_terminal.weighbridge_terminal import terminal_for_request

	if operation not in ("Gross", "Tare"):
		frappe.throw(_("Operation must be Gross or Tare"))
	need(WEIGH_ROLES, _("record weights"))
	t = terminal or terminal_for_request(operation).name
	tok = frappe.get_doc("Cane Token", token)
	if tok.docstatus != 1:
		frappe.throw(_("Token {0} is not valid").format(token))
	check_place(tok.purchase_depot, WEIGH_ROLES - {DEPOT_ROLE}, _("record weights"))
	if terminal_depot(t) != (tok.purchase_depot or None):
		frappe.throw(_("Terminal {0} is at {1}, but token {2} was issued {3}").format(t, terminal_depot(t) or _("the mill"), token,
			_("at depot {0}").format(tok.purchase_depot) if tok.purchase_depot else _("at the mill gate")), title=_("Wrong weighbridge"))
	want = {"Gross": "Issued", "Tare": "Gross"}[operation]
	if tok.status != want:
		frappe.throw(_("Token {0} is {1}: the {2} weight was already taken or isn't due").format(token, _(tok.status), _(operation)))
	kg, reading, note = take_weight(t, operation, manual_kg, note, at, tok.vehicle_type, operation)
	if operation == "Tare":
		gross = cint(frappe.db.get_value("Cane Weighment", tok.weighment, "gross_kg"))
		if kg >= gross:
			frappe.throw(_("Tare {0} kg is not less than gross {1} kg").format(f"{kg:,}", f"{gross:,}"))

	when = get_datetime(at) if at else now_datetime()
	log = frappe._dict(name=reading_log(t, kg, reading, operation, note))

	if operation == "Gross":
		w = frappe.get_doc({"doctype": "Cane Weighment", "token": tok.name, "season": tok.season, "crushing_day": tok.crushing_day,
			"vehicle_no": tok.vehicle_no, "vehicle_type": tok.vehicle_type, "grower": tok.grower, "grower_name": tok.grower_name,
			"gross_kg": kg, "gross_at": when, "gross_by": frappe.session.user, "gross_terminal": t, "gross_reading": log.name,
			"gross_note": note or None, "manual_entry": 1 if reading["source"] == "Manual" else 0, "is_demo": cint(is_demo)})
		w.insert(ignore_permissions=True)
		tok.db_set({"status": "Gross", "weighment": w.name, "gross_at": when})
	else:
		w = frappe.get_doc("Cane Weighment", tok.weighment)
		w.update({"tare_kg": kg, "tare_at": when, "tare_by": frappe.session.user, "tare_terminal": t, "tare_reading": log.name,
			"tare_note": note or None})
		if reading["source"] == "Manual":
			w.manual_entry = 1
		w.flags.ignore_permissions = True
		w.submit()  # → CPR (Cane Weighment.on_submit)
	frappe.db.set_value("Weighment Reading Log", log.name, "weighment", w.name, update_modified=False)
	w.reload()
	return {"token": tok.name, "weighment": w.name, "operation": operation, "weight_kg": kg, "net_kg": w.net_kg, "cpr": w.cpr,
		"note": note or None}


# ---------------------------------------------------------------- CPR
TOKEN_TO_CPR = ("season", "company", "entry_type", "purchase_depot", "elp_registration", "lp_verified", "indent", "grower", "grower_name", "father_name",
	"cnic", "passbook_no", "circle", "village", "village_name", "source", "claimed_source", "loading_point", "depot", "point_name",
	"vehicle", "vehicle_no", "vehicle_type", "driver_name", "driver_cnic", "driver_mobile", *rate_calc.RATE_FIELDS, "rate_levels",
	"is_demo")


def make_cpr(weighment) -> str:
	tok = frappe.get_doc("Cane Token", weighment.token)
	cpr = frappe.get_doc({"doctype": "Cane Purchase Receipt", **{f: tok.get(f) for f in TOKEN_TO_CPR}, "token": tok.name,
		"weighment": weighment.name, "gross_kg": weighment.gross_kg, "tare_kg": weighment.tare_kg,
		"posted_at": weighment.tare_at, "posting_date": crushing_day(weighment.tare_at),
		"warehouse": (frappe.db.get_value("Cane Depot", tok.purchase_depot, "warehouse") if tok.purchase_depot else None)
			or settings().warehouse})
	cpr.flags.ignore_permissions = True
	cpr.insert()
	cpr.submit()
	return cpr.name


def cpr_journal_entry(cpr) -> str:
	from sugarcane.calc.cpr import journal_lines

	cfg = settings()
	rows = []
	for line in journal_lines(cpr.result):
		account = cfg.accounts.get(line["account_key"])
		if not account:
			frappe.throw(_("Set {0} in Sugar Settings").format(line["account_key"].replace("_", " ")))
		row = {"account": account, "debit_in_account_currency": flt(line["debit"]), "credit_in_account_currency": flt(line["credit"]),
			"cost_center": cfg.cost_center, "user_remark": line["source"].replace("_", " ")}
		if line["account_key"] == "cane_purchase_clearing_account":
			row.update(party_type="Supplier", party=cfg.supplier)
		elif line["account_key"] in ("grower_payable_account", "grower_loan_account"):
			row.update(party_type="Grower", party=cpr.grower)
		rows.append(row)
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": cpr.company,
		"posting_date": cpr.posting_date, "title": f"CPR {cpr.name}", "cheque_no": cpr.name, "cheque_date": cpr.posting_date,
		"user_remark": _("Cane purchase {0}: {1}, {2} md, vehicle {3}").format(cpr.name, cpr.grower_name,
			f"{flt(cpr.payable_maund):,.3f}", cpr.vehicle_no), "accounts": rows})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def make_bilty(cpr) -> str | None:
	if flt(cpr.tpt_amount) <= 0:
		return None
	b = frappe.get_doc({"doctype": "TPT Bilty", "cpr": cpr.name, "token": cpr.token, "crushing_day": cpr.posting_date,
		"season": cpr.season, "company": cpr.company, "grower": cpr.grower, "grower_name": cpr.grower_name, "source": cpr.source,
		"point_name": cpr.point_name, "vehicle_no": cpr.vehicle_no, "vehicle_type": cpr.vehicle_type, "driver_name": cpr.driver_name,
		"driver_cnic": cpr.driver_cnic, "driver_mobile": cpr.driver_mobile, "payable_maund": cpr.payable_maund,
		"tpt_rate": cpr.tpt_rate, "amount": cpr.tpt_amount, "is_demo": cpr.is_demo})
	b.flags.ignore_permissions = True
	b.insert()
	b.submit()
	return b.name


# ---------------------------------------------------------------- bilty at the cash counter
def pay_bilty(name: str, received_by: str | None = None, received_by_cnic: str | None = None, paid_at=None):
	need(CASH_ROLES, _("pay TPT bilties"))
	cfg = settings()
	b = frappe.get_doc("TPT Bilty", name)
	if b.docstatus != 1 or b.status != "Unpaid":
		frappe.throw(_("Bilty {0} is {1}").format(name, _(b.status if b.docstatus == 1 else "not submitted")))
	if not cfg.cash_account or not cfg.tpt_account:
		frappe.throw(_("Set the TPT-Bilty Payable and Cash Counter accounts in Sugar Settings"))
	at = get_datetime(paid_at) if paid_at else now_datetime()
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Cash Entry", "company": b.company, "posting_date": at.date(),
		"title": f"Bilty {b.name}", "cheque_no": b.name, "cheque_date": at.date(),
		"user_remark": _("TPT bilty {0} (CPR {1}) paid to {2}, vehicle {3}").format(b.name, b.cpr, received_by or b.driver_name, b.vehicle_no),
		"accounts": [
			{"account": cfg.tpt_account, "debit_in_account_currency": flt(b.amount), "cost_center": cfg.cost_center},
			{"account": cfg.cash_account, "credit_in_account_currency": flt(b.amount), "cost_center": cfg.cost_center},
		]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	b.db_set({"status": "Paid", "paid_at": at, "paid_by": frappe.session.user, "payment_journal_entry": je.name,
		"received_by": received_by or b.driver_name, "received_by_cnic": received_by_cnic or b.driver_cnic})
	return b


def reverse_bilty_payment(name: str, reason: str):
	need({"System Manager", "Cane Admin"}, _("reverse bilty payments"))
	if not (reason or "").strip():
		frappe.throw(_("Give the reason"))
	b = frappe.get_doc("TPT Bilty", name)
	if b.status != "Paid":
		frappe.throw(_("Bilty {0} is not paid").format(name))
	je = frappe.get_doc("Journal Entry", b.payment_journal_entry)
	b.db_set("payment_journal_entry", None)
	je.flags.ignore_permissions = True
	je.cancel()
	b.db_set({"status": "Unpaid", "paid_at": None, "paid_by": None, "payment_journal_entry": None, "received_by": None,
		"received_by_cnic": None})
	b.add_comment("Info", _("Payment reversed ({0}): {1}").format(je.name, frappe.utils.escape_html(reason)))
	return b


# ---------------------------------------------------------------- day close
def day_cprs(day, exclude_dcp: str | None = None) -> list:
	return frappe.db.sql("""select name, grower, grower_name, payable_kg, govt_value, tpt_amount, payable_cpr, journal_entry,
		warehouse, purchase_depot, payable_maund from `tabCane Purchase Receipt` where docstatus = 1 and posting_date = %(d)s
		and (ifnull(daily_purchase, '') = '' or daily_purchase = %(x)s) order by posted_at, name""",
		{"d": getdate(day), "x": exclude_dcp or ""}, as_dict=True)


def close_day(day, submit=True, force=False):
	"""Create (and submit) the Daily Cane Purchase for a crushing day."""
	need(CLOSE_ROLES, _("close the crushing day"))
	day = getdate(day)
	name = frappe.db.get_value("Daily Cane Purchase", {"crushing_day": day, "docstatus": ["<", 2]}, "name")
	dcp = frappe.get_doc("Daily Cane Purchase", name) if name else frappe.new_doc("Daily Cane Purchase")
	if dcp.docstatus == 1:
		frappe.throw(_("Crushing day {0} is already closed ({1})").format(frappe.utils.formatdate(day), dcp.name))
	dcp.crushing_day = day
	dcp.flags.ignore_permissions = True
	dcp.flags.force_close = force
	dcp.save()
	if submit:
		dcp.submit()
	return dcp


def make_purchase_invoice(dcp) -> str:
	cfg = settings()
	for f, label in (("supplier", "Daily Purchase Supplier"), ("item", "Cane Item"), ("warehouse", "Cane Yard Warehouse"),
			("clearing", "Cane Purchase Clearing")):
		if not cfg.get(f):
			frappe.throw(_("Set {0} in Sugar Settings").format(label))
	total = flt(dcp.total_govt_value, 2)
	by_wh = {}  # one line per warehouse: the mill yard and each depot that bought cane that day
	for it in dcp.items:
		w = by_wh.setdefault(it.warehouse or cfg.warehouse, [0, 0.0])
		w[0] += cint(it.payable_kg)
		w[1] = flt(w[1] + flt(it.govt_value), 2)
	stock_uom = frappe.db.get_value("Item", cfg.item, "stock_uom")
	start, end = day_window(dcp.crushing_day, cfg)
	pi = frappe.get_doc({
		"doctype": "Purchase Invoice", "company": dcp.company, "supplier": cfg.supplier, "posting_date": dcp.crushing_day,
		"set_posting_time": 1, "posting_time": "23:30:00", "bill_no": dcp.name, "bill_date": dcp.crushing_day, "due_date": dcp.crushing_day,
		"update_stock": 1, "disable_rounded_total": 1, "credit_to": cfg.clearing, "cost_center": cfg.cost_center,
		"remarks": _("Cane bought on crushing day {0} ({1} – {2}): {3} CPRs, {4} maund").format(frappe.utils.formatdate(dcp.crushing_day),
			start.strftime("%d %b %H:%M"), end.strftime("%d %b %H:%M"), dcp.cpr_count, f"{flt(dcp.total_payable_maund):,.3f}"),
		"items": [{"item_code": cfg.item, "qty": w_kg, "uom": stock_uom, "stock_uom": stock_uom, "conversion_factor": 1,
			"rate": flt(w_value / w_kg, 9), "warehouse": wh, "cost_center": cfg.cost_center,
			"description": _("Sugarcane, crushing day {0} — {1}").format(frappe.utils.formatdate(dcp.crushing_day), wh)}
			for wh, (w_kg, w_value) in by_wh.items() if w_kg],
	})
	pi.flags.ignore_permissions = True
	pi.set_missing_values()
	pi.taxes_and_charges, pi.taxes = None, []
	pi.insert()
	if abs(flt(pi.grand_total) - total) >= 0.005 or abs(flt(pi.outstanding_amount) - total) >= 0.005:
		frappe.throw(_("The invoice total {0} does not match the CPRs' govt value {1}").format(pi.grand_total, total))
	pi.submit()
	return pi.name


def reconcile_day(dcp, pi_name: str) -> bool:
	"""Reconcile each CPR journal row on the clearing account (party: the daily supplier) against the day's invoice."""
	from erpnext.accounts.utils import reconcile_against_document

	cfg = settings()
	entries = []
	for it in dcp.items:
		row = frappe.db.get_value("Journal Entry Account", {"parent": it.journal_entry, "account": cfg.clearing, "party_type": "Supplier",
			"party": cfg.supplier, "debit_in_account_currency": [">", 0]}, ["name", "debit_in_account_currency"], as_dict=True)
		if not row:
			continue
		amount = flt(row.debit_in_account_currency)
		entries.append(frappe._dict(voucher_type="Journal Entry", voucher_no=it.journal_entry, voucher_detail_no=row.name,
			against_voucher_type="Purchase Invoice", against_voucher=pi_name, account=cfg.clearing, exchange_rate=1,
			party_type="Supplier", party=cfg.supplier, is_advance="No", dr_or_cr="debit_in_account_currency",
			unreconciled_amount=amount, unadjusted_amount=amount, allocated_amount=amount, difference_amount=0,
			difference_account=None, difference_posting_date=None, cost_center=cfg.cost_center))
	if entries:
		reconcile_against_document(entries)
	outstanding = flt(frappe.db.get_value("Purchase Invoice", pi_name, "outstanding_amount"))
	return abs(outstanding) < 0.005


def clearing_balance(company=None, on=None) -> float:
	from erpnext.accounts.utils import get_balance_on

	cfg = settings()
	return flt(get_balance_on(cfg.clearing, date=on, company=company or cfg.company))


def auto_close_previous_day():
	"""Scheduler (07:15): close yesterday's crushing day when Sugar Settings → auto_close_day is on."""
	if not cint(frappe.db.get_single_value("Sugar Settings", "auto_close_day")):
		return
	day = crushing_day() - timedelta(days=1)
	if day_cprs(day) and not frappe.db.exists("Daily Cane Purchase", {"crushing_day": day, "docstatus": 1}):
		frappe.set_user("Administrator")
		close_day(day)
