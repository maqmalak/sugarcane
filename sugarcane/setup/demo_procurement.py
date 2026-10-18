"""Phase 3 demo: gate tokens, weighments, CPRs, bilties and closed crushing days on top of the indent and ELP demo.

- every ELP load the audit team accepted gets an ELP-verified token (its loading point's TPT); rejected ones come in at the
  gate rates with a reason
- about 50 more vehicles come straight to the gate on their indents, 2–6 Nov
- 2–5 Nov are closed (daily purchase invoice, reconciled); 6 Nov is open with a few vehicles still in the yard
- most bilties of 2–4 Nov are paid at the counter
- Phase 4: indents for a depot are bought at that depot (its weighbridge, the depot user); every evening each depot sends its
  cane to the mill in contractor trucks, weighed out at the depot and in at the mill, with a small transit shortage (some above
  the allowance); on 6 Nov two trucks are still on the road
Everything runs through the same code as the screens, as the demo users (token clerk, weighmen, cashier, accountant).
"""

import json
import random
from datetime import timedelta

import frappe
from frappe.utils import add_to_date, cint, get_datetime, getdate

from sugarcane.cane_procurement import procurement as p
from sugarcane.depot_purchase.depot import day_movements

SEED = 33
DAYS = [getdate(f"2026-11-0{d}") for d in (2, 3, 4, 5, 6)]
CLOSED = DAYS[:4]
PAID_UNTIL = DAYS[2]
TERMINAL = "WB-1 Gross"
DEPOT_TERMINALS = {"Depot Kot Momin": ("DP-1 Kot Momin", "192.168.30.11"), "Depot Quaidabad": ("DP-2 Quaidabad", "192.168.30.12"),
	"Depot Ahmedpur Sial": ("DP-3 Ahmedpur Sial", "192.168.30.13")}
DEPOT_TERMS = {"Depot Kot Momin": (12, 1.0), "Depot Quaidabad": (14, 1.0), "Depot Ahmedpur Sial": (18, 1.5)}  # freight / md, allowed %
DRIVERS = ["Muhammad Akram", "Ghulam Rasool", "Allah Ditta", "Muhammad Iqbal", "Nazir Ahmad", "Bashir Ahmad", "Muhammad Aslam",
	"Abdul Sattar", "Sher Muhammad", "Manzoor Hussain", "Khadim Hussain", "Liaqat Ali"]


def _as(user_prefix: str):
	frappe.set_user(f"{user_prefix}@micromaxsugar.example")


def _reading(kg: int, at, terminal=TERMINAL):
	p._cache_reading(terminal, {"weight_kg": int(kg), "stable": 1, "raw": f"SIM {int(kg):>7}kg ST", "source": "Simulator", "at": str(at)})


def _weights(rnd, vehicle_type):
	vt = frappe.db.get_value("Vehicle Type", vehicle_type, ["min_gross_kg", "max_gross_kg", "min_tare_kg", "max_tare_kg"], as_dict=True)
	tare = rnd.randint(vt.min_tare_kg + (vt.max_tare_kg - vt.min_tare_kg) // 5, vt.max_tare_kg - (vt.max_tare_kg - vt.min_tare_kg) // 5)
	load = rnd.randint(int((vt.max_gross_kg - vt.max_tare_kg) * 0.45), int((vt.max_gross_kg - vt.max_tare_kg) * 0.85))
	return round(tare + load, -1), round(tare, -1)


def _terminal():
	"""On one development PC the same terminal takes both weights (a mill has separate gross and tare bridges)."""
	if frappe.db.exists("Weighbridge Terminal", TERMINAL):
		frappe.db.set_value("Weighbridge Terminal", TERMINAL, "allowed_operations", "Gross and Tare")


def _vehicle(rnd, used: set):
	rows = frappe.get_all("Sugar Vehicle", filters={"is_demo": 1, "is_blacklisted": 0}, fields=["name", "vehicle_type", "driver_name", "driver_cnic"])
	rows = [r for r in rows if r.name not in used]
	return rnd.choice(rows) if rows else None


def _weigh(tok, rnd, gross_at, tare_at):
	gross, tare = _weights(rnd, tok.vehicle_type)
	t = DEPOT_TERMINALS[tok.purchase_depot][0] if tok.purchase_depot else TERMINAL
	_as("depot.user" if tok.purchase_depot else "gross.weighman")
	_reading(gross, gross_at, t)
	p.capture(tok.name, "Gross", terminal=t, at=gross_at, is_demo=1)
	if tare_at:
		_as("depot.user" if tok.purchase_depot else "tare.weighman")
		_reading(tare, tare_at, t)
		p.capture(tok.name, "Tare", terminal=t, at=tare_at, is_demo=1)


def _depots():
	"""Depot terminals (simulator), the depot user at every depot, freight rates and allowances."""
	user = "depot.user@micromaxsugar.example"
	for depot, (term, ip) in DEPOT_TERMINALS.items():
		if not frappe.db.exists("Cane Depot", depot):
			continue
		if not frappe.db.exists("Weighbridge Terminal", term):
			frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": term, "weighbridge_no": term.split()[0], "depot": depot,
				"allowed_operations": "All", "ip_address": ip, "indicator_protocol": "Simulator", "is_active": 1}).insert(ignore_permissions=True)
		doc = frappe.get_doc("Cane Depot", depot)
		if frappe.db.exists("User", user) and not any(r.user == user for r in doc.depot_users):
			doc.append("depot_users", {"user": user, "depot_role": "Operator"})
		doc.freight_rate, doc.allowed_shortage_pct = DEPOT_TERMS[depot]
		doc.save(ignore_permissions=True)
	return {frappe.db.get_value("Cane Depot", d, "source"): d for d in DEPOT_TERMINALS if frappe.db.exists("Cane Depot", d)}


def loads(rnd) -> int:
	made, in_yard = 0, 0
	plan = []
	for r in frappe.get_all("LP Vehicle Registration", filters={"is_demo": 1, "status": ["in", ["Accepted", "Rejected"]], "token": ["is", "not set"]},
			fields=["name", "status", "arrived_at", "decided_at"], order_by="arrived_at"):
		if not r.decided_at or get_datetime(r.decided_at) < get_datetime(r.arrived_at):
			# the ELP demo decides "now"; in the story the audit team decides soon after the gate photos
			r.decided_at = add_to_date(r.arrived_at, minutes=rnd.randint(10, 40))
			frappe.db.set_value("LP Vehicle Registration", r.name, "decided_at", r.decided_at, update_modified=False)
		at = add_to_date(get_datetime(r.decided_at), minutes=rnd.randint(5, 25))
		plan.append(("elp", r, at))
	used_indents = set(frappe.get_all("LP Vehicle Registration", filters={"indent": ["is", "set"]}, pluck="indent"))
	gate = frappe.get_all("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]], "valid_from": ["<=", DAYS[-1]],
		"valid_to": [">=", DAYS[0]]}, fields=["name", "valid_from", "valid_to", "source"], order_by="name")
	gate = [i for i in gate if i.name not in used_indents]
	rnd.shuffle(gate)
	depot_of = _depots()
	n_gate = n_depot = 0
	for i in gate:
		depot = depot_of.get(i.source)
		if (depot and n_depot >= 60) or (not depot and n_gate >= 45):
			continue
		days = [d for d in DAYS if getdate(i.valid_from) <= d <= getdate(i.valid_to)]
		if not days:
			continue
		d = rnd.choice(days)
		i.depot = depot
		n_depot, n_gate = n_depot + bool(depot), n_gate + (not depot)
		# depots buy in daylight (07:30 – 16:30) so the evening trucks carry the day's cane
		span = 9 * 60 if depot else 15 * 60
		plan.append(("depot" if depot else "gate", i, get_datetime(f"{d} 07:30:00") + timedelta(minutes=rnd.randint(0, span))))
	plan.sort(key=lambda x: x[2])
	inside = set()
	for kind, row, at in plan:
		day = p.crushing_day(at)
		if day not in DAYS:
			continue
		_as("depot.user" if kind == "depot" else "token.clerk")
		try:
			if kind == "elp":
				tok = p.issue_token(elp_registration=row.name, issued_at=at, is_demo=1,
					gate_reason=None if row.status == "Accepted" else "Audit team rejected the loading point; grower agreed to the gate rates")
			else:
				v = _vehicle(rnd, inside)
				if not v:
					continue
				tok = p.issue_token(indent=row.name, vehicle_no=v.name, vehicle_type=v.vehicle_type,
					driver_name=v.driver_name or rnd.choice(DRIVERS), driver_cnic=v.driver_cnic, issued_at=at, is_demo=1,
					purchase_depot=row.depot if kind == "depot" else None)
		except frappe.ValidationError as e:
			frappe.clear_last_message()
			print("demo token skipped:", row.name, str(e)[:120])
			continue
		gross_at = add_to_date(at, minutes=rnd.randint(8, 45))
		tare_at = add_to_date(gross_at, minutes=rnd.randint(50, 260))
		last_day = day == DAYS[-1]
		if kind == "depot":
			tare_at = add_to_date(gross_at, minutes=rnd.randint(20, 60))  # a depot unloads at once
		elif last_day and in_yard < 5 and get_datetime(at).hour >= 16:
			in_yard += 1
			if in_yard <= 2:
				made += 1
				continue  # waiting for the gross weight
			tare_at = None  # unloading, waiting for the tare
		elif p.crushing_day(tare_at) != day and day in CLOSED:
			tare_at = add_to_date(gross_at, minutes=40)
		_weigh(tok, rnd, gross_at, tare_at)
		made += 1
	return made


def dispatches(rnd) -> int:
	"""Each evening every depot sends the cane it holds (≥ 12 t) in trucks of 16–24 t."""
	from sugarcane.depot_purchase import depot as dp

	trucks = [v for v in frappe.get_all("Sugar Vehicle", filters={"is_demo": 1, "is_blacklisted": 0, "vehicle_type": "Truck"},
		fields=["name", "driver_name", "driver_cnic"])]
	made = 0
	for day in DAYS:
		for k, depot in enumerate(DEPOT_TERMINALS):
			if not frappe.db.exists("Cane Depot", depot):
				continue
			term, _ip = DEPOT_TERMINALS[depot]
			journey = cint(frappe.db.get_value("Cane Depot", depot, "journey_to_mill_min")) or 120
			allowed = DEPOT_TERMS[depot][1]
			at = get_datetime(f"{day} 17:30:00") + timedelta(minutes=k * 25)
			n = 0
			while True:
				carry = dp.depot_balance(depot, at)["balance_kg"]
				if carry < 12000 or not trucks:
					break
				load = min(carry, rnd.randint(16000, 24000))
				v = trucks[(made + n) % len(trucks)]
				if dp._open_for_vehicle(v.name):
					v = next((t for t in trucks if not dp._open_for_vehicle(t.name)), None)
					if not v:
						break
				_as("depot.user")
				d = dp.create_dispatch(depot, v.name, "Truck", v.driver_name or rnd.choice(DRIVERS), v.driver_cnic, is_demo=1)
				tare = rnd.randint(85, 110) * 100
				_reading(tare, at, term)
				dp.capture_dispatch(d.name, "Depot Tare", terminal=term, at=at)
				_reading(tare + load, at, term)
				loaded_at = add_to_date(at, minutes=rnd.randint(25, 45))
				dp.capture_dispatch(d.name, "Depot Gross", terminal=term, at=loaded_at)
				n += 1
				at = add_to_date(at, minutes=50)
				still_on_road = day == DAYS[-1] and n == 2  # two trucks of the last evening stay on the road
				if still_on_road and k < 2:
					continue
				# most trucks lose 0.2 – 1.0 %; one in six loses more than the allowance (drying, pilferage)
				pct = rnd.uniform(allowed + 0.3, allowed + 1.5) if rnd.random() < 0.17 else rnd.uniform(0.2, allowed * 0.95)
				received = int(round(load * (1 - pct / 100), -1))
				mill_tare = tare + rnd.choice((-20, 0, 10, 20))
				arrive = add_to_date(loaded_at, minutes=journey + rnd.randint(-10, 60))
				_as("gross.weighman")
				_reading(mill_tare + received, arrive)
				dp.capture_dispatch(d.name, "Mill Gross", terminal=TERMINAL, at=arrive)
				_as("tare.weighman")
				_reading(mill_tare, arrive)
				dp.capture_dispatch(d.name, "Mill Tare", terminal=TERMINAL, at=add_to_date(arrive, minutes=rnd.randint(35, 80)))
			made += n
	return made


def pay_and_close(rnd):
	_as("cane.cashier")
	for b in frappe.get_all("TPT Bilty", filters={"is_demo": 1, "status": "Unpaid", "crushing_day": ["<=", PAID_UNTIL]},
			fields=["name", "crushing_day", "driver_name", "driver_cnic"], order_by="name"):
		if rnd.random() < 0.85:
			paid = get_datetime(f"{b.crushing_day} 07:00:00") + timedelta(hours=rnd.randint(4, 30))
			p.pay_bilty(b.name, b.driver_name, b.driver_cnic, paid_at=paid)
	_as("cane.accountant")
	for d in CLOSED:
		if p.day_cprs(d) or any(day_movements(d).values()):
			dcp = frappe.new_doc("Daily Cane Purchase")
			dcp.update({"crushing_day": d, "is_demo": 1})
			dcp.flags.ignore_permissions = True
			dcp.insert()
			dcp.submit()


def run():
	if frappe.db.exists("Cane Token", {"is_demo": 1}):
		return 0
	frappe.flags.mute_emails = True
	rnd = random.Random(SEED)
	_terminal()
	try:
		n = loads(rnd)
		dispatches(rnd)
		pay_and_close(rnd)
	finally:
		frappe.set_user("Administrator")
		frappe.cache.delete_value(p.READING_KEY.format(TERMINAL))  # the last simulated reading is dated in the demo days
	frappe.db.commit()
	return n


def reset():
	"""Cancel through the documents (payments → day invoices → CPRs → tokens), so every ledger is reversed, then delete
	the demo procurement records. The cancelled vouchers stay, as cancelled."""
	from sugarcane.setup.demo import _purge

	frappe.set_user("Administrator")
	for b in frappe.get_all("TPT Bilty", filters={"is_demo": 1, "status": "Paid"}, pluck="name"):
		p.reverse_bilty_payment(b, "Demo reset")
	for name in frappe.get_all("Daily Cane Purchase", filters={"is_demo": 1, "docstatus": 1}, pluck="name", order_by="crushing_day desc"):
		d = frappe.get_doc("Daily Cane Purchase", name)
		d.flags.ignore_permissions = True
		d.cancel()
	for name in frappe.get_all("Depot Dispatch", filters={"is_demo": 1, "docstatus": 1}, pluck="name"):
		d = frappe.get_doc("Depot Dispatch", name)
		d.flags.ignore_permissions = True
		d.cancel()
	for name in frappe.get_all("Cane Purchase Receipt", filters={"is_demo": 1, "docstatus": 1}, pluck="name"):
		d = frappe.get_doc("Cane Purchase Receipt", name)
		d.flags.ignore_permissions = True
		d.cancel()
	for name in frappe.get_all("Cane Token", filters={"is_demo": 1, "docstatus": 1}, pluck="name"):
		d = frappe.get_doc("Cane Token", name)
		d.flags.ignore_permissions = True
		d.cancel()
	weigh = frappe.get_all("Cane Weighment", filters={"is_demo": 1}, pluck="name")
	frappe.db.delete("Weighment Reading Log", {"weighment": ["in", weigh or [""]]})
	dsp = frappe.get_all("Depot Dispatch", filters={"is_demo": 1}, pluck="name")
	frappe.db.delete("Weighment Reading Log", {"dispatch": ["in", dsp or [""]]})
	for dt in ("Depot Dispatch", "Daily Cane Purchase", "TPT Bilty", "Cane Purchase Receipt", "Cane Weighment", "Cane Token"):
		_purge(dt, frappe.get_all(dt, filters={"is_demo": 1}, pluck="name"))
	frappe.db.commit()
