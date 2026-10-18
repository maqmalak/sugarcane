"""Depot purchase and dispatch (Phase 4).

GET  masters                          → the user's depots (stock, contractor, freight, allowance), vehicle types
GET  board?depot=&status=&days=       → dispatches with their weights, shortage and journey
GET  dispatch?name=                   → one dispatch, its next weight and the depot's numbers
POST create {depot, vehicle_no, vehicle_type, driver_*, contractor}
POST capture {name, operation, manual_kg, note}     (the terminal comes from the request's IP)
POST cancel {name, reason}
GET  insights?days=                   → per depot: bought, stock, in transit, received, shortage, trend
Buying at a depot uses the gate and weighbridge APIs (sugarcane.api.v1.procurement) with purchase_depot.
"""

from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, add_to_date, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.cane_procurement import procurement as p
from sugarcane.depot_purchase import depot as dp

FIELDS = ["name", "status", "docstatus", "depot", "dispatch_day", "received_day", "vehicle_no", "vehicle_type", "driver_name", "contractor",
	"depot_tare_kg", "depot_gross_kg", "depot_gross_at", "dispatched_kg", "mill_gross_kg", "mill_gross_at", "mill_tare_kg", "received_kg",
	"shortage_kg", "shortage_pct", "allowed_shortage_pct", "excess_shortage_kg", "journey_minutes", "expected_at", "freight_amount",
	"recovery_amount", "posted_out", "posted_in", "weight_notes"]
VIEW_ROLES = p.MANAGERS | {p.DEPOT_ROLE, "Gross Weighman", "Tare Weighman", "Yard Supervisor", "Token Clerk", "Cane Accountant", "MIS Viewer"}


def _restricted() -> bool:
	"""A depot user with no mill-wide role sees only their own depots."""
	roles = set(frappe.get_roles())
	return p.DEPOT_ROLE in roles and not (VIEW_ROLES - {p.DEPOT_ROLE}) & roles


def _depot_filter(depot=None):
	"""None = every depot; otherwise the list of depots the user may see (narrowed to `depot` when given)."""
	if not _restricted():
		return [depot] if depot else None
	mine = p.user_depots()
	return ([depot] if depot in mine else []) if depot else mine


def _decorate(r, now=None):
	now = now or now_datetime()
	r.next = dp.next_step(r)
	r.overdue = bool(r.status == "In Transit" and r.expected_at and now > get_datetime(r.expected_at))
	return r


@frappe.whitelist(methods=["GET"])
def masters() -> dict:
	p.need(VIEW_ROLES, _("see depots"))
	depots = []
	allowed = _depot_filter()
	for name in allowed if allowed is not None else frappe.get_all("Cane Depot", filters={"is_active": 1}, pluck="name", order_by="name"):
		d = frappe.db.get_value("Cane Depot", name, ["name", "source", "contractor", "depot_rate", "freight_rate", "allowed_shortage_pct",
			"warehouse", "journey_to_mill_min", "latitude", "longitude"], as_dict=True)
		d.update(dp.depot_balance(name))
		depots.append(d)
	return {"depots": depots, "vehicle_types": frappe.get_all("Vehicle Type", filters={"is_active": 1}, fields=["name", "min_gross_kg",
		"max_gross_kg", "min_tare_kg", "max_tare_kg"], order_by="name"), "can_dispatch": bool(p.user_depots()),
		"contractors": frappe.get_all("Supplier", filters={"supplier_group": frappe.db.get_single_value("Sugar Settings", "contractor_supplier_group")},
			pluck="name", order_by="name")}


@frappe.whitelist(methods=["GET"])
def board(depot: str | None = None, status: str | None = None, days: int = 7) -> dict:
	p.need(VIEW_ROLES, _("see depot dispatches"))
	allowed = _depot_filter(depot)
	f = {"docstatus": ["<", 2], "creation": [">=", add_days(now_datetime(), -cint(days or 7))]}
	if allowed is not None:
		f["depot"] = ["in", allowed or [""]]
	if status:
		f["status"] = status
	if status in (None, "", "Loading", "In Transit", "At Mill"):
		f.pop("creation")  # open trucks show whenever they were loaded
		if not status:
			f["creation"] = [">=", add_days(now_datetime(), -cint(days or 7))]
	rows = [_decorate(r) for r in frappe.get_all("Depot Dispatch", filters=f, fields=FIELDS, order_by="creation desc", limit=300)]
	counts = defaultdict(int)
	for r in rows:
		counts[r.status] += 1
		counts["Overdue"] += 1 if r.overdue else 0
	return {"rows": rows, "counts": counts}


@frappe.whitelist(methods=["GET"])
def dispatch(name: str) -> dict:
	frappe.has_permission("Depot Dispatch", "read", name, throw=True)
	r = frappe.db.get_value("Depot Dispatch", name, FIELDS + ["driver_cnic", "driver_mobile", "freight_rate", "shortage_value", "remarks",
		"depot_tare_at", "depot_terminal", "mill_tare_at", "mill_terminal", "out_entry", "in_entry", "shortage_entry", "freight_journal"], as_dict=True)
	if not r:
		frappe.throw(_("Dispatch {0} not found").format(name))
	r = _decorate(r)
	r.limits = frappe.db.get_value("Vehicle Type", r.vehicle_type, ["min_gross_kg", "max_gross_kg", "min_tare_kg", "max_tare_kg"], as_dict=True)
	r.depot_stock = dp.depot_balance(r.depot)
	return r


@frappe.whitelist(methods=["POST"])
def create(depot: str, vehicle_no: str, vehicle_type: str | None = None, driver_name=None, driver_cnic=None, driver_mobile=None,
		contractor=None, remarks=None) -> dict:
	d = dp.create_dispatch(depot, vehicle_no, vehicle_type, driver_name, driver_cnic, driver_mobile, contractor or None, remarks)
	return dispatch(d.name)


@frappe.whitelist(methods=["POST"])
def capture(name: str, operation: str | None = None, manual_kg=None, note=None) -> dict:
	out = dp.capture_dispatch(name, operation or None, manual_kg, note)
	out["doc"] = dispatch(name)
	return out


@frappe.whitelist(methods=["POST"])
def cancel(name: str, reason: str) -> dict:
	dp.cancel_dispatch(name, reason)
	return dispatch(name)


@frappe.whitelist(methods=["GET"])
def insights(days: int = 14, day: str | None = None) -> dict:
	p.need(VIEW_ROLES, _("see depots"))
	allowed = _depot_filter()
	last = frappe.db.sql("select max(posting_date) from `tabCane Purchase Receipt` where docstatus = 1 and ifnull(purchase_depot, '') != ''")[0][0]
	d = getdate(day) if day else (last or p.crushing_day())
	start = add_days(d, -(cint(days) - 1))
	depots = allowed if allowed is not None else frappe.get_all("Cane Depot", filters={"is_active": 1}, pluck="name", order_by="name")
	cond = {"d": depots or [""], "s": start, "e": d}
	bought = frappe.db.sql("""select purchase_depot depot, posting_date day, count(*) loads, sum(net_kg) net_kg, sum(payable_maund) maund,
		sum(payable_cpr) payable from `tabCane Purchase Receipt` where docstatus = 1 and purchase_depot in %(d)s
		and posting_date between %(s)s and %(e)s group by purchase_depot, posting_date""", cond, as_dict=True)
	sent = frappe.db.sql("""select depot, dispatch_day day, count(*) trucks, sum(dispatched_kg) kg from `tabDepot Dispatch`
		where docstatus = 1 and depot in %(d)s and dispatch_day between %(s)s and %(e)s group by depot, dispatch_day""", cond, as_dict=True)
	got = frappe.db.sql("""select depot, received_day day, count(*) trucks, sum(dispatched_kg) sent_kg, sum(received_kg) kg, sum(shortage_kg) shortage,
		sum(excess_shortage_kg) excess, sum(freight_amount) freight, sum(recovery_amount) recovery from `tabDepot Dispatch`
		where docstatus = 1 and status = 'Received' and depot in %(d)s and received_day between %(s)s and %(e)s
		group by depot, received_day""", cond, as_dict=True)
	open_ = frappe.get_all("Depot Dispatch", filters={"docstatus": ["<", 2], "status": ["in", ["Loading", "In Transit", "At Mill"]],
		"depot": ["in", depots or [""]]}, fields=FIELDS, order_by="depot_gross_at asc")
	now = now_datetime()
	open_ = [_decorate(r, now) for r in open_]
	per = {}
	for name in depots:
		dep = frappe.db.get_value("Cane Depot", name, ["latitude", "longitude", "target_maund", "allowed_shortage_pct", "contractor",
			"journey_to_mill_min"], as_dict=True)
		b = [r for r in bought if r.depot == name]
		g = [r for r in got if r.depot == name]
		sent_kg = sum(flt(r.sent_kg) for r in g)
		per[name] = {"name": name, **dep, **dp.depot_balance(name),
			"loads": sum(r.loads for r in b), "maund": round(sum(flt(r.maund) for r in b), 1), "payable": round(sum(flt(r.payable) for r in b), 2),
			"trucks_sent": sum(r.trucks for r in sent if r.depot == name), "sent_kg": sum(cint(r.kg) for r in sent if r.depot == name),
			"trucks_received": sum(r.trucks for r in g), "received_kg": sum(cint(r.kg) for r in g), "shortage_kg": sum(cint(r.shortage) for r in g),
			"shortage_pct": round(sum(cint(r.shortage) for r in g) * 100 / sent_kg, 2) if sent_kg else 0,
			"excess_kg": sum(cint(r.excess) for r in g), "freight": round(sum(flt(r.freight) for r in g), 2),
			"recovery": round(sum(flt(r.recovery) for r in g), 2),
			"in_transit": sum(1 for r in open_ if r.depot == name and r.status in ("In Transit", "At Mill")),
			"overdue": sum(1 for r in open_ if r.depot == name and r.overdue)}
	trend = []
	day_ = start
	while day_ <= d:
		row = {"day": str(day_)}
		row["bought_md"] = round(sum(flt(r.maund) for r in bought if r.day == day_), 1)
		row["sent_md"] = round(sum(cint(r.kg) for r in sent if r.day == day_) / 40, 1)
		row["received_md"] = round(sum(cint(r.kg) for r in got if r.day == day_) / 40, 1)
		sk = sum(flt(r.sent_kg) for r in got if r.day == day_)
		row["shortage_pct"] = round(sum(cint(r.shortage) for r in got if r.day == day_) * 100 / sk, 2) if sk else None
		trend.append(row)
		day_ = add_days(day_, 1)
	tot = lambda k: round(sum(flt(v[k]) for v in per.values()), 2)  # noqa: E731
	mill = frappe.db.get_single_value("Sugar Settings", "mill_latitude"), frappe.db.get_single_value("Sugar Settings", "mill_longitude")
	return {"day": str(d), "from": str(start), "depots": list(per.values()), "open": open_, "trend": trend, "mill": {"lat": mill[0], "lng": mill[1]},
		"kpi": {k: tot(k) for k in ("loads", "maund", "payable", "balance_kg", "trucks_sent", "sent_kg", "trucks_received", "received_kg",
			"shortage_kg", "excess_kg", "freight", "recovery", "in_transit", "overdue")}}
