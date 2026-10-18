"""Depot purchase (Phase 4).

Buying   A depot buys cane through the same path as the mill gate: token (purchase depot, the depot's rates) → gross / tare on
         the depot's own weighbridge terminal → CPR. The CPR's cane is in the depot's warehouse.
Dispatch The depot sends its cane to the mill in contractor trucks (Depot Dispatch):
           Depot Tare (empty truck, depot terminal) → Depot Gross (loaded; submitted, In Transit)
           → Mill Gross (mill terminal, At Mill) → Mill Tare (emptied, Received).
         dispatched = depot gross − depot tare · received = mill gross − mill tare · shortage = dispatched − received.
Posting  Stock and money move at the crushing day's close (Daily Cane Purchase), after the day's purchase invoice:
           - dispatched that day: Stock Entry depot → Cane In Transit (a depot with less stock on the books than it sent —
             binding and trash are weighed but not paid — first gets a zero-value receipt of the difference)
           - received that day: Stock Entry In Transit → Cane Yard (received kg), and a Material Issue of the shortage to
             Cane Transit Shortage; Journal Entry: Dr Cane Freight – Depots (received maund × freight rate),
             Cr Creditors (contractor) freight − recovery, Cr Cane Transit Shortage the recovery (shortage above the allowed
             % at its stock value)
           - commission: Dr Depot Commission, Cr Creditors (contractor) on the payable maund the depot bought that day
         Days close in order (a day can't close while an earlier day of the season has CPRs or dispatches not posted).
"""

import frappe
from frappe import _
from frappe.utils import add_to_date, cint, flt, get_datetime, getdate, now_datetime

from sugarcane.cane_procurement import procurement as p
from sugarcane.vehicle_tracking.elp import canon, normalize_vehicle

STEPS = {  # operation: (status before, weight kind for the vehicle limits, at the depot?)
	"Depot Tare": ("Loading", "Tare", True),
	"Depot Gross": ("Loading", "Gross", True),
	"Mill Gross": ("In Transit", "Gross", False),
	"Mill Tare": ("At Mill", "Tare", False),
}


def next_step(d) -> str | None:
	if d.docstatus == 2:
		return None
	if d.status == "Loading":
		return "Depot Gross" if cint(d.depot_tare_kg) else "Depot Tare"
	return {"In Transit": "Mill Gross", "At Mill": "Mill Tare"}.get(d.status)


def depot_balance(depot: str, at=None) -> dict:
	"""Physical cane at a depot: net weight bought (CPRs) minus what was dispatched (loaded trucks) — up to `at` when given."""
	at = get_datetime(at) if at else get_datetime("2999-12-31 00:00:00")
	bought = frappe.db.sql("""select ifnull(sum(net_kg), 0), ifnull(sum(payable_kg), 0) from `tabCane Purchase Receipt`
		where docstatus = 1 and purchase_depot = %s and posted_at <= %s""", (depot, at))[0]
	sent = frappe.db.sql("""select ifnull(sum(dispatched_kg), 0) from `tabDepot Dispatch` where docstatus = 1 and depot = %s
		and depot_gross_at <= %s""", (depot, at))[0][0]
	return {"bought_kg": cint(bought[0]), "payable_kg": cint(bought[1]), "dispatched_kg": cint(sent), "balance_kg": cint(bought[0]) - cint(sent)}


def _open_for_vehicle(vehicle_no: str, exclude: str | None = None) -> str | None:
	rows = frappe.db.sql("""select name from `tabDepot Dispatch` where docstatus < 2 and status in ('Loading', 'In Transit', 'At Mill')
		and name != %(x)s and replace(replace(upper(vehicle_no), '-', ''), ' ', '') = %(v)s limit 1""", {"v": canon(vehicle_no), "x": exclude or ""})
	return rows[0][0] if rows else p.open_token_for_vehicle(vehicle_no)


def create_dispatch(depot: str, vehicle_no: str, vehicle_type: str | None = None, driver_name=None, driver_cnic=None, driver_mobile=None,
		contractor=None, remarks=None, is_demo=0):
	p.check_place(depot, set(), _("dispatch cane"))
	vehicle_no = normalize_vehicle(vehicle_no)
	if not vehicle_no:
		frappe.throw(_("Enter the truck number"))
	other = _open_for_vehicle(vehicle_no)
	if other:
		frappe.throw(_("Vehicle {0} is already on {1}").format(vehicle_no, other), title=_("Duplicate vehicle"))
	master = frappe.db.sql("select name, vehicle_type, is_blacklisted, blacklist_reason, driver_name, driver_cnic from `tabSugar Vehicle` "
		"where replace(replace(upper(name), '-', ''), ' ', '') = %(v)s limit 1", {"v": canon(vehicle_no)}, as_dict=True)
	master = master[0] if master else frappe._dict()
	if cint(master.is_blacklisted):
		frappe.throw(_("Vehicle {0} is blacklisted: {1}").format(vehicle_no, master.blacklist_reason or ""), title=_("Blacklisted"))
	dep = frappe.db.get_value("Cane Depot", depot, ["source", "contractor", "freight_rate", "allowed_shortage_pct"], as_dict=True)
	d = frappe.get_doc({"doctype": "Depot Dispatch", "depot": depot, "source": dep.source, "company": p.settings().company,
		"season": frappe.db.get_single_value("Sugar Settings", "active_season"), "vehicle": master.name, "vehicle_no": vehicle_no,
		"vehicle_type": vehicle_type or master.vehicle_type, "driver_name": driver_name or master.driver_name,
		"driver_cnic": driver_cnic or master.driver_cnic, "driver_mobile": driver_mobile, "contractor": contractor or dep.contractor,
		"freight_rate": dep.freight_rate, "allowed_shortage_pct": dep.allowed_shortage_pct, "remarks": remarks, "is_demo": cint(is_demo)})
	if not d.vehicle_type:
		frappe.throw(_("Choose the vehicle type"))
	d.insert(ignore_permissions=True)
	return d


def capture_dispatch(name: str, operation: str | None = None, manual_kg=None, note=None, terminal=None, at=None) -> dict:
	"""Take the next weight of a dispatch truck on the terminal the request comes from."""
	from sugarcane.weighbridge.doctype.weighbridge_terminal.weighbridge_terminal import terminal_for_request

	d = frappe.get_doc("Depot Dispatch", name)
	step = next_step(d)
	if not step:
		frappe.throw(_("Dispatch {0} is {1}: nothing left to weigh").format(name, _(d.status)))
	if operation and operation != step:
		frappe.throw(_("Dispatch {0} needs its {1} weight next, not {2}").format(name, _(step), _(operation)))
	before, kind, at_depot = STEPS[step]
	t = terminal or terminal_for_request(kind).name
	if at_depot:
		p.check_place(d.depot, set(), _("weigh dispatch trucks"))
		if p.terminal_depot(t) != d.depot:
			frappe.throw(_("Weigh this truck on depot {0}'s weighbridge (terminal {1} is at {2})").format(d.depot, t,
				p.terminal_depot(t) or _("the mill")), title=_("Wrong weighbridge"))
	else:
		p.need(p.WEIGH_ROLES - {p.DEPOT_ROLE}, _("weigh dispatch trucks at the mill"))
		if p.terminal_depot(t):
			frappe.throw(_("Terminal {0} is at depot {1}; the truck is weighed in at the mill").format(t, p.terminal_depot(t)),
				title=_("Wrong weighbridge"))
	kg, reading, note = p.take_weight(t, step, manual_kg, note, at, d.vehicle_type, kind)
	when = get_datetime(at) if at else now_datetime()
	log = p.reading_log(t, kg, reading, step, note, dispatch=d.name)
	if note:
		d.weight_notes = "\n".join(x for x in (d.weight_notes, f"{step}: {note}") if x)
	if reading["source"] == "Manual":
		d.weight_notes = "\n".join(x for x in (d.weight_notes, f"{step}: typed in") if x)

	if step == "Depot Tare":
		d.update({"depot_tare_kg": kg, "depot_tare_at": when, "depot_terminal": t, "depot_by": frappe.session.user})
		d.save(ignore_permissions=True)
	elif step == "Depot Gross":
		if kg <= cint(d.depot_tare_kg):
			frappe.throw(_("Loaded {0} kg is not more than empty {1} kg").format(f"{kg:,}", f"{cint(d.depot_tare_kg):,}"))
		sent = kg - cint(d.depot_tare_kg)
		bal = depot_balance(d.depot, when)["balance_kg"]
		if sent > bal * 1.02 + 200 and not (p.MANUAL_ROLES & set(frappe.get_roles()) and note):
			frappe.throw(_("The truck carries {0} kg but depot {1} has only {2} kg of cane bought and not yet sent. A Cane Admin can "
				"accept it with a note.").format(f"{sent:,}", d.depot, f"{max(bal, 0):,}"), title=_("More than the depot holds"))
		journey = cint(frappe.db.get_value("Cane Depot", d.depot, "journey_to_mill_min"))
		d.update({"depot_gross_kg": kg, "depot_gross_at": when, "dispatched_kg": sent, "dispatch_day": p.crushing_day(when),
			"season": p.season_for(p.crushing_day(when)),
			"expected_at": add_to_date(when, minutes=journey) if journey else None, "status": "In Transit"})
		d.flags.ignore_permissions = True
		d.submit()
	elif step == "Mill Gross":
		d.db_set({"mill_gross_kg": kg, "mill_gross_at": when, "mill_terminal": t, "mill_by": frappe.session.user, "status": "At Mill",
			"journey_minutes": int((when - get_datetime(d.depot_gross_at)).total_seconds() // 60), "weight_notes": d.weight_notes})
	else:
		if kg >= cint(d.mill_gross_kg):
			frappe.throw(_("Empty {0} kg is not less than loaded {1} kg").format(f"{kg:,}", f"{cint(d.mill_gross_kg):,}"))
		received = cint(d.mill_gross_kg) - kg
		shortage = cint(d.dispatched_kg) - received
		pct = flt(shortage * 100 / cint(d.dispatched_kg), 3) if cint(d.dispatched_kg) else 0
		allowed_kg = int(cint(d.dispatched_kg) * flt(d.allowed_shortage_pct) / 100)
		maund_kg = p.settings().maund_kg
		d.db_set({"mill_tare_kg": kg, "mill_tare_at": when, "received_kg": received, "received_day": p.crushing_day(when),
			"shortage_kg": shortage, "shortage_pct": pct, "excess_shortage_kg": max(0, shortage - allowed_kg),
			"freight_amount": flt(received / maund_kg * flt(d.freight_rate), 2), "status": "Received", "weight_notes": d.weight_notes})
	d.reload()
	return {"dispatch": d.name, "operation": step, "weight_kg": kg, "status": d.status, "next": next_step(d), "log": log,
		"dispatched_kg": d.dispatched_kg, "received_kg": d.received_kg, "shortage_kg": d.shortage_kg, "note": note or None}


def cancel_dispatch(name: str, reason: str):
	p.need({"System Manager", "Cane Admin"}, _("cancel dispatches"))
	if not (reason or "").strip():
		frappe.throw(_("Give the reason"))
	d = frappe.get_doc("Depot Dispatch", name)
	if cint(d.posted_out) or cint(d.posted_in):
		frappe.throw(_("Dispatch {0} is already posted with a closed day; cancel that Daily Cane Purchase first").format(name))
	d.db_set("remarks", "\n".join(x for x in (d.remarks, f"Cancelled: {reason}") if x))
	if d.docstatus == 1:
		d.flags.ignore_permissions = True
		d.cancel()
	else:
		d.db_set("status", "Cancelled")
	return d


# ---------------------------------------------------------------- day close
def pending_before(day, season) -> list[str]:
	"""Earlier crushing days of the season that still have CPRs or dispatch movements to post."""
	day = getdate(day)
	days = set(frappe.db.sql_list("""select distinct posting_date from `tabCane Purchase Receipt` where docstatus = 1 and season = %s
		and posting_date < %s and ifnull(daily_purchase, '') = ''""", (season, day)))
	days |= set(frappe.db.sql_list("""select distinct dispatch_day from `tabDepot Dispatch` where docstatus = 1 and season = %s
		and dispatch_day < %s and posted_out = 0""", (season, day)))
	days |= set(frappe.db.sql_list("""select distinct received_day from `tabDepot Dispatch` where docstatus = 1 and season = %s
		and status = 'Received' and received_day < %s and posted_in = 0""", (season, day)))
	return sorted(str(d) for d in days if d)


def day_movements(day) -> dict:
	day = getdate(day)
	return {
		"out": frappe.get_all("Depot Dispatch", filters={"docstatus": 1, "dispatch_day": day, "posted_out": 0}, pluck="name"),
		"in": frappe.get_all("Depot Dispatch", filters={"docstatus": 1, "status": "Received", "received_day": day, "posted_in": 0},
			pluck="name"),
	}


class _Clock:
	"""Posting times for the day's depot entries: after the purchase invoice (23:30) and one second apart, in the order they
	are made, so no stock entry is ever back-dated (a back-dated entry would need a valuation repost by the worker)."""

	def __init__(self):
		self.n = 0

	def __call__(self) -> str:
		self.n += 1
		m, sec = divmod(40 * 60 + self.n, 60)
		return f"23:{m:02d}:{sec:02d}"


def _stock_entry(purpose, day, time_, rows, remarks, company) -> frappe.model.document.Document:
	cfg = p.settings()
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": purpose, "purpose": purpose, "company": company,
		"posting_date": day, "posting_time": time_, "set_posting_time": 1, "remarks": remarks,
		"items": [{"item_code": cfg.item, "uom": "Kg", "stock_uom": "Kg", "conversion_factor": 1, "cost_center": cfg.cost_center, **r}
			for r in rows]})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	return se


def _stock(warehouse, day) -> float:
	from erpnext.stock.utils import get_stock_balance

	return flt(get_stock_balance(p.settings().item, warehouse, getdate(day), "23:59:59"))



def _journal(day, company, rows, remark) -> str:
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": company, "posting_date": day,
		"user_remark": remark, "accounts": rows})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name


def _creditors(company):
	return frappe.get_cached_value("Company", company, "default_payable_account")


def post_day(dcp) -> list[dict]:
	"""Depot postings for the crushing day of a Daily Cane Purchase (run after its purchase invoice). Returns posting rows."""
	cfg = p.settings()
	day, company, out, clock = getdate(dcp.crushing_day), dcp.company, [], _Clock()
	need = [("transit", "Cane In Transit Warehouse"), ("freight_account", "Depot Freight Account"),
		("shortage_account", "Transit Shortage Account"), ("commission_account", "Depot Commission Account")]
	mv = day_movements(day)
	if mv["out"] or mv["in"]:
		for f, label in need:
			if not cfg.get(f):
				frappe.throw(_("Set {0} in Sugar Settings").format(label))

	def add(kind, voucher, description, amount=0, depot=None, dispatch=None):
		out.append({"kind": kind, "voucher": voucher, "description": description, "amount": flt(amount, 2), "depot": depot, "dispatch": dispatch})

	for name in mv["out"]:
		d = frappe.get_doc("Depot Dispatch", name)
		wh = frappe.db.get_value("Cane Depot", d.depot, "warehouse")
		gap = cint(d.dispatched_kg) - _stock(wh, day)
		if gap > 0:  # weighed out more than was paid for: binding / trash, or cane bought later than the truck left
			se = _stock_entry("Material Receipt", day, clock(), [{"t_warehouse": wh, "qty": gap, "basic_rate": 0,
				"allow_zero_valuation_rate": 1}], _("{0}: weighed out {1} kg more than the depot holds on the books").format(d.name, gap), company)
			d.db_set("gain_entry", se.name)
			add("Stock Entry", se.name, _("{0} depot gain {1} kg").format(d.name, gap), 0, d.depot, d.name)
		se = _stock_entry("Material Transfer", day, clock(), [{"s_warehouse": wh, "t_warehouse": cfg.transit, "qty": cint(d.dispatched_kg)}],
			_("{0}: {1} kg sent from {2}, truck {3}").format(d.name, d.dispatched_kg, d.depot, d.vehicle_no), company)
		d.db_set({"out_entry": se.name, "posted_out": 1})
		add("Stock Entry", se.name, _("{0} sent {1} kg").format(d.name, d.dispatched_kg), se.total_outgoing_value, d.depot, d.name)

	for name in mv["in"]:
		d = frappe.get_doc("Depot Dispatch", name)
		shortage, received = cint(d.shortage_kg), cint(d.received_kg)
		if shortage < 0:  # more arrived than left: bring the difference into transit at zero value
			se = _stock_entry("Material Receipt", day, clock(), [{"t_warehouse": cfg.transit, "qty": -shortage, "basic_rate": 0,
				"allow_zero_valuation_rate": 1}], _("{0}: {1} kg more at the mill than at the depot").format(d.name, -shortage), company)
			add("Stock Entry", se.name, _("{0} transit gain {1} kg").format(d.name, -shortage), 0, d.depot, d.name)
		se_in = _stock_entry("Material Transfer", day, clock(), [{"s_warehouse": cfg.transit, "t_warehouse": cfg.warehouse, "qty": received}],
			_("{0}: {1} kg received at the mill from {2}").format(d.name, received, d.depot), company)
		add("Stock Entry", se_in.name, _("{0} received {1} kg").format(d.name, received), se_in.total_outgoing_value, d.depot, d.name)
		value, short_entry = 0.0, None
		if shortage > 0:
			se = _stock_entry("Material Issue", day, clock(), [{"s_warehouse": cfg.transit, "qty": shortage,
				"expense_account": cfg.shortage_account}], _("{0}: transit shortage {1} kg ({2}%)").format(d.name, shortage, d.shortage_pct), company)
			value, short_entry = flt(se.total_outgoing_value, 2), se.name
			add("Stock Entry", se.name, _("{0} shortage {1} kg").format(d.name, shortage), value, d.depot, d.name)
		recovery = flt(value * cint(d.excess_shortage_kg) / shortage, 2) if shortage > 0 else 0
		freight = flt(d.freight_amount, 2)
		je = None
		if d.contractor and (freight or recovery):
			rows = []
			if freight:
				rows.append({"account": cfg.freight_account, "debit_in_account_currency": freight, "cost_center": cfg.cost_center})
			net = flt(freight - recovery, 2)
			if net:
				rows.append({"account": _creditors(company), "party_type": "Supplier", "party": d.contractor,
					**({"credit_in_account_currency": net} if net > 0 else {"debit_in_account_currency": -net}), "cost_center": cfg.cost_center})
			if recovery:
				rows.append({"account": cfg.shortage_account, "credit_in_account_currency": recovery, "cost_center": cfg.cost_center})
			je = _journal(day, company, rows, _("{0}: freight {1} for {2} kg received from {3}; shortage recovered {4}").format(
				d.name, freight, received, d.depot, recovery))
			add("Journal Entry", je, _("{0} freight {1} − recovery {2}").format(d.name, freight, recovery), freight - recovery, d.depot, d.name)
		d.db_set({"in_entry": se_in.name, "shortage_entry": short_entry, "shortage_value": value, "recovery_amount": recovery,
			"freight_journal": je, "posted_in": 1})

	maund_kg = cfg.maund_kg
	by_depot = {}
	for it in dcp.items:
		dep = frappe.db.get_value("Cane Purchase Receipt", it.cpr, "purchase_depot")
		if dep:
			by_depot[dep] = by_depot.get(dep, 0) + cint(it.payable_kg)
	for dep, kg in sorted(by_depot.items()):
		rate, contractor = frappe.db.get_value("Cane Depot", dep, ["depot_rate", "contractor"])
		amount = flt(kg / maund_kg * flt(rate), 2)
		if amount and contractor and cfg.commission_account:
			je = _journal(day, company, [
				{"account": cfg.commission_account, "debit_in_account_currency": amount, "cost_center": cfg.cost_center},
				{"account": _creditors(company), "party_type": "Supplier", "party": contractor, "credit_in_account_currency": amount,
					"cost_center": cfg.cost_center}],
				_("Depot commission {0}: {1} maund × {2}").format(dep, flt(kg / maund_kg, 3), rate))
			add("Journal Entry", je, _("Commission {0}: {1} md × {2}").format(dep, f"{kg / maund_kg:,.1f}", rate), amount, dep)
	return out


def unpost_day(dcp):
	"""Cancel the day's depot postings in reverse order and mark the dispatches unposted."""
	for row in reversed(dcp.get("postings") or []):
		if row.kind == "Purchase Invoice" or not row.voucher:
			continue
		if frappe.db.get_value(row.kind, row.voucher, "docstatus") == 1:
			v = frappe.get_doc(row.kind, row.voucher)
			v.flags.ignore_permissions = True
			v.flags.ignore_links = True
			v.cancel()
	day = getdate(dcp.crushing_day)
	for name in frappe.get_all("Depot Dispatch", filters={"dispatch_day": day, "posted_out": 1}, pluck="name"):
		frappe.db.set_value("Depot Dispatch", name, {"posted_out": 0, "out_entry": None, "gain_entry": None}, update_modified=False)
	for name in frappe.get_all("Depot Dispatch", filters={"received_day": day, "posted_in": 1}, pluck="name"):
		frappe.db.set_value("Depot Dispatch", name, {"posted_in": 0, "in_entry": None, "shortage_entry": None, "freight_journal": None,
			"shortage_value": 0, "recovery_amount": 0}, update_modified=False)
