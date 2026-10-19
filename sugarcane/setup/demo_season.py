# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 9 demo: one full, closed crushing season — 2025-26, 1 Nov 2025 to 20 Mar 2026 — behind the live 2026-27 demo.

Every document goes through the same code as the screens, as the demo users:
- the 2026-27 demo surveys are re-surveyed for 2025-26 (same fields, yield ±12 %); indent ranges and rules shifted a year;
  indents generated for the whole season and authorised
- each crushing day: gate tokens on that day's indents (the season curve: slow start, peak in Dec–Jan, tail in March),
  gross and tare on the weighbridge, CPRs, the bilties mostly paid next morning, the day closed (purchase invoice)
- lab samples every 6 hours, 0–2 stoppages, the DMR approved and production posted
- every Monday a bank payment scroll (cheque for growers without an IBAN); road cess deposited each month
- sugar sold every week to the demo dealers (Delivery Note + GST invoice), molasses every month; bagasse burnt in the boilers
Run with `bench --site … sc-season-demo` (it takes a while: about 0.4 s a load). Messages are off while it runs.
"""
import random
from datetime import datetime, timedelta

import frappe
from frappe.utils import add_days, add_to_date, cint, flt, getdate

SEASON = "2025-26"
LIVE = "2026-27"
START, END = getdate("2025-11-01"), getdate("2026-03-20")
SEED = 2526
TERMINAL = "WB-1 Gross"
TAG = "DEMO-SEASON"


def _as(prefix):
	frappe.set_user(f"{prefix}@micromaxsugar.example")


def curve(day) -> float:
	"""Share of the peak intake on a day: ramps up over two weeks, peaks Dec–Jan, tails off in March."""
	n = (getdate(day) - START).days
	total = (END - START).days
	if n < 14:
		return 0.35 + 0.65 * n / 14
	if n > total - 25:
		return max(0.3, (total - n) / 25)
	return 1.0


# ---------------------------------------------------------------- masters
def fiscal_year(company):
	if not frappe.db.exists("Fiscal Year", "2025-2026"):
		frappe.get_doc({"doctype": "Fiscal Year", "year": "2025-2026", "year_start_date": "2025-07-01", "year_end_date": "2026-06-30",
			"companies": [{"company": company}]}).insert(ignore_permissions=True)


def season(company, loads_per_day):
	if frappe.db.exists("Crushing Season", SEASON):
		return
	live = frappe.get_doc("Crushing Season", LIVE)
	doc = frappe.copy_doc(live)
	doc.update({"season_name": SEASON, "status": "Closed", "start_date": START, "end_date": END, "govt_rate": 400, "subsidy_rate": 8,
		"additional_subsidy_rate": 4, "tpt_rate": 28, "crushing_target_maund": 1_200_000, "is_demo": 1, "indent_start_date": None,
		"daily_intake_maund": loads_per_day * cint(live.indent_load_maund or 200), "bag_bom": None, "budget_processing_per_ton": 3600})
	doc.set("circle_quotas", [])
	doc.flags.ignore_permissions = True
	doc.insert()
	# one season is Open per company (checked on save): this past season is open in the database only while it is
	# generated (indenting and the gate refuse a closed one) and closed at the end of run()
	frappe.db.set_value("Crushing Season", SEASON, "status", "Open", update_modified=False)


def surveys(rnd):
	if frappe.db.exists("Cane Survey", {"season": SEASON}):
		return 0
	n = 0  # as Administrator: the demo surveyors are scoped to their circles
	skip = {"name", "creation", "modified", "owner", "modified_by", "docstatus", "amended_from", "photos", "survey_uuid", "synced_at",
		"overlap_status", "overlap_acres", "grower_photo"}
	for name in frappe.get_all("Cane Survey", filters={"season": LIVE, "docstatus": 1, "survey_for": "Company", "is_demo": 1}, pluck="name"):
		src = frappe.get_doc("Cane Survey", name)
		d = {k: v for k, v in src.as_dict().items() if k not in skip and not isinstance(v, list)}
		day = add_days(getdate(src.survey_date), -365)
		d.update({"doctype": "Cane Survey", "season": SEASON, "survey_date": day, "captured_at": f"{day} 11:00:00",
			"survey_uuid": frappe.generate_hash(length=24), "is_demo": 1,
			"expected_yield": round(flt(src.expected_yield) * rnd.uniform(0.88, 1.12), 1) if src.expected_yield else None,
			"remarks": f"Re-surveyed for {SEASON} ({TAG})"})
		doc = frappe.get_doc(d)
		doc.flags.ignore_permissions = True
		try:
			doc.insert()
			doc.submit()
			n += 1
		except frappe.ValidationError:
			frappe.clear_last_message()
	frappe.set_user("Administrator")
	return n


def indents():
	from sugarcane.cane_indenting import generator
	from sugarcane.setup.demo_indent import RULES

	for c in frappe.get_all("Cane Circle", fields=["name", "circle_code"]):
		if not frappe.db.exists("Indent Range", {"season": SEASON, "circle": c.name}):
			frappe.get_doc({"doctype": "Indent Range", "season": SEASON, "circle": c.name, "prefix": f"25-{c.circle_code}-", "digits": 6,
				"from_no": 100001, "to_no": 109999, "is_demo": 1}).insert(ignore_permissions=True)
	for name, pct, start, end, priority, cond in RULES:
		if "circle" in cond and not frappe.db.exists("Cane Circle", cond["circle"]):
			continue
		if not frappe.db.exists("Indent Quota Rule", {"season": SEASON, "rule_name": name}):
			shift = lambda s: str(min(max(add_days(getdate(s), -365), START), END)) if s else None  # noqa: E731
			frappe.get_doc({"doctype": "Indent Quota Rule", "season": SEASON, "rule_name": name, "quota_pct": pct, "from_date": shift(start),
				"to_date": shift(end), "priority": priority, "enabled": 1, "is_demo": 1, **cond}).insert(ignore_permissions=True)
	if frappe.db.exists("Indent Batch", {"season": SEASON}):
		return
	_as("indent.clerk")
	d = START
	while d <= END:
		upto = min(add_days(d, 13), END)
		out = generator.generate(SEASON, d, upto, today=d, remarks=f"Season {SEASON} ({TAG})")
		_as("cane.manager")
		for b in out["batches"]:
			frappe.db.set_value("Indent Batch", b["name"], "is_demo", 1)
			frappe.db.set_value("Cane Indent", {"batch": b["name"]}, "is_demo", 1)
			doc = frappe.get_doc("Indent Batch", b["name"])
			doc.flags.ignore_permissions = True
			doc.submit()
		_as("indent.clerk")
		frappe.db.commit()
		d = add_days(upto, 1)
	frappe.set_user("Administrator")


# ---------------------------------------------------------------- a crushing day
def _reading(kg, at):
	from sugarcane.cane_procurement import procurement as p

	p._cache_reading(TERMINAL, {"weight_kg": int(kg), "stable": 1, "raw": f"SIM {int(kg)}kg", "source": "Simulator", "at": str(at)})


def crush_day(rnd, day, loads_per_day, vehicles):
	from sugarcane.cane_procurement import procurement as p
	from sugarcane.setup.demo_procurement import DRIVERS, _weights

	want = max(4, int(loads_per_day * curve(day) * rnd.uniform(0.85, 1.1)))
	rows = frappe.get_all("Cane Indent", filters={"season": SEASON, "docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
		"valid_from": ["<=", day], "valid_to": [">=", day]}, fields=["name"], order_by="valid_to asc, name asc", limit=want)
	start = datetime.combine(getdate(day), datetime.min.time()) + timedelta(hours=7, minutes=30)
	made = 0
	for k, r in enumerate(rows):
		at = start + timedelta(minutes=int(k * (15 * 60) / max(len(rows), 1)) + rnd.randint(0, 10))
		v = vehicles[k % len(vehicles)]
		_as("token.clerk")
		try:
			tok = p.issue_token(indent=r.name, vehicle_no=v.name, vehicle_type=v.vehicle_type, driver_name=v.driver_name or rnd.choice(DRIVERS),
				driver_cnic=v.driver_cnic, issued_at=at, is_demo=1)
		except frappe.ValidationError:
			frappe.clear_last_message()
			continue
		gross, tare = _weights(rnd, tok.vehicle_type)
		g_at = add_to_date(at, minutes=rnd.randint(8, 30))
		_as("gross.weighman")
		_reading(gross, g_at)
		p.capture(tok.name, "Gross", terminal=TERMINAL, at=g_at, is_demo=1)
		t_at = add_to_date(g_at, minutes=rnd.randint(40, 120))
		_as("tare.weighman")
		_reading(tare, t_at)
		p.capture(tok.name, "Tare", terminal=TERMINAL, at=t_at, is_demo=1)
		made += 1
	_as("cane.cashier")
	for b in frappe.get_all("TPT Bilty", filters={"season": SEASON, "status": "Unpaid", "crushing_day": day}, fields=["name", "driver_name",
			"driver_cnic"]):
		if rnd.random() < 0.9:
			p.pay_bilty(b.name, b.driver_name, b.driver_cnic, paid_at=datetime.combine(add_days(day, 1), datetime.min.time()) + timedelta(hours=9))
	_as("cane.accountant")
	if p.day_cprs(day):
		dcp = frappe.new_doc("Daily Cane Purchase")
		dcp.update({"crushing_day": day, "is_demo": 1})
		dcp.flags.ignore_permissions = True
		dcp.insert()
		dcp.submit()
	return made


def plant_day(rnd, day):
	from sugarcane.cane_laboratory.lab import prepare_dmr, record_samples
	from sugarcane.setup.demo_lab import _val

	_as("lab.chemist")
	start = datetime.combine(getdate(day), datetime.min.time()) + timedelta(hours=7)
	rows = []
	for t in frappe.get_all("Lab Sample Type", filters={"is_active": 1}, pluck="name"):
		lim = {l.parameter: l for l in frappe.get_cached_doc("Lab Sample Type", t).limits}
		for h in range(0, 24, 6):
			r = {"sample_type": t, "sample_time": str(start + timedelta(hours=h, minutes=rnd.randint(0, 20)))}
			for p_, l in lim.items():
				if p_ != "purity":
					r[p_] = round(max(_val(rnd, flt(l.min_value), flt(l.max_value), flt(l.target)), 0), 3)
			if "purity" in lim and "brix" in lim:
				r["pol"] = round(r["brix"] * _val(rnd, flt(lim["purity"].min_value), flt(lim["purity"].max_value), flt(lim["purity"].target)) / 100, 3)
			if t == "Sugar":
				r.pop("brix", None)
			rows.append(r)
	record_samples(rows, is_demo=1)
	for _k in range(rnd.choice((0, 1, 1, 2))):
		s = start + timedelta(hours=rnd.randint(1, 20), minutes=rnd.randint(0, 50))
		cat, sec, why = rnd.choice((("Mechanical", "Mill Tandem", "Carrier chain link broke"), ("Electrical", "Power House", "Feeder tripped"),
			("No Cane", "Yard", "Yard empty — waiting for trucks"), ("Process", "Boiling House", "Juice heater cleaning")))
		frappe.get_doc({"doctype": "Mill Stoppage", "start": s, "end": s + timedelta(minutes=rnd.randint(12, 90)), "category": cat, "section": sec,
			"reason": why, "is_demo": 1}).insert(ignore_permissions=True)
	d = frappe.get_doc({"doctype": "Daily Manufacturing Report", "crushing_day": day, "is_demo": 1})
	d.insert(ignore_permissions=True)
	available = cint(d.yard_opening_kg) + cint(d.cane_received_kg)
	if not available:
		frappe.delete_doc("Daily Manufacturing Report", d.name, force=True, ignore_permissions=True)
		return 0
	d.yard_closing_kg = int(available * rnd.uniform(0.02, 0.06))
	d.save(ignore_permissions=True)
	rec = rnd.uniform(9.4, 10.9)
	crushed = cint(d.cane_crushed_kg)
	bags = int(crushed * rec / 100 / 50)
	bagasse = int(crushed * rnd.uniform(0.29, 0.32))
	d.update({"sugar_bags": bags, "molasses_kg": int(crushed * rnd.uniform(0.042, 0.047)), "bagasse_kg": bagasse,
		"bagasse_burnt_kg": int(bagasse * rnd.uniform(0.86, 0.93)), "press_mud_kg": int(crushed * rnd.uniform(0.032, 0.038)),
		"mixed_juice_kg": int(crushed * rnd.uniform(1.0, 1.06))})
	grades = frappe.get_all("Sugar Grade", filters={"is_active": 1}, fields=["name"], order_by="sequence asc")
	if len(grades) >= 3:  # mostly grade A, some B, a little refined
		b_, ref = int(bags * rnd.uniform(0.1, 0.16)), int(bags * rnd.uniform(0.03, 0.06))
		d.set("grades", [{"grade": grades[0].name, "bags": bags - b_ - ref}, {"grade": grades[1].name, "bags": b_}, {"grade": grades[2].name, "bags": ref}])
	d.save(ignore_permissions=True)
	prepare_dmr(d.name)
	_as("production")
	d.reload()
	d.flags.ignore_permissions = True
	d.submit()
	pe = frappe.get_doc({"doctype": "Daily Production Entry", "crushing_day": day, "is_demo": 1})
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return cint(d.sugar_bags)


# ---------------------------------------------------------------- money and sales
def pay_week(day):
	from sugarcane.cane_accounting.accounting import unpaid_cprs

	_as("cane.accountant")
	rows = [r for r in unpaid_cprs(to_date=add_days(day, -2), limit=5000) if frappe.db.get_value("Cane Purchase Receipt", r.name, "season") == SEASON]
	for cprs, mode in (([r.name for r in rows if r.iban], "Bank Transfer"), ([r.name for r in rows if not r.iban], "Cheque")):
		for i in range(0, len(cprs), 400):
			doc = frappe.get_doc({"doctype": "Cane Payment Scroll", "posting_date": day, "mode_of_payment": mode, "is_demo": 1,
				"reference_no": f"{'IBFT' if mode == 'Bank Transfer' else 'CHQ'}-{str(day).replace('-', '')}-{i // 400 + 1}",
				"items": [{"cpr": c} for c in cprs[i:i + 400]], "remarks": f"Weekly payment ({TAG})"})
			doc.flags.ignore_permissions = True
			doc.insert()
			doc.submit()


def cess_month(first, last, deposit_on):
	_as("cane.accountant")
	if not frappe.db.exists("Cane Purchase Receipt", {"season": SEASON, "docstatus": 1, "cess_deposited": 0, "posting_date": ["between", [first, last]]}):
		return
	dep = frappe.get_doc({"doctype": "Road Cess Deposit", "from_date": first, "to_date": last, "deposit_date": deposit_on, "is_demo": 1,
		"challan_no": f"RC-{str(first)[:7]}-S", "remarks": TAG})
	dep.flags.ignore_permissions = True
	dep.insert()
	dep.submit()


def _customers():
	return [c for c in ("Madina Sugar Dealers", "Al-Rehman Trading Co.", "Multan Sugar Agency", "Karachi Commodities (Pvt) Ltd",
		"Shezan Foods (Pvt) Ltd") if frappe.db.exists("Customer", c)]


def sell_week(rnd, day, abbr):
	"""Most of the week's bags go to the dealers: a Delivery Note and a GST invoice each."""
	from sugarcane.stock import stock_qty

	s = frappe.get_cached_doc("Sugar Settings")
	frappe.set_user("Administrator")
	have = stock_qty(s.sugar_item, s.sugar_warehouse, add_days(day, -1))  # production posts after the crushing day
	custs = _customers()
	if have < 200 or not custs:
		return
	sell = int(have * rnd.uniform(0.75, 0.9))
	tax = f"Pakistan GST 18% - {abbr}" if frappe.db.exists("Sales Taxes and Charges Template", f"Pakistan GST 18% - {abbr}") else None
	from erpnext.controllers.accounts_controller import get_taxes_and_charges

	for k, cust in enumerate(custs):
		qty = sell // len(custs) + (sell % len(custs) if k == 0 else 0)
		if qty <= 0:
			continue
		dn = frappe.get_doc({"doctype": "Delivery Note", "customer": cust, "company": s.company, "posting_date": day, "set_posting_time": 1,
			"posting_time": "15:00:00", "selling_price_list": "Sugar Rate List", "taxes_and_charges": tax, "delivery_order_no": f"S25-{day}-{k}",
			"items": [{"item_code": s.sugar_item, "qty": qty, "rate": round(rnd.uniform(6300, 6900), 0), "warehouse": s.sugar_warehouse}]})
		if tax:
			dn.set("taxes", get_taxes_and_charges("Sales Taxes and Charges Template", tax))
		dn.flags.ignore_permissions = True
		dn.insert()
		dn.submit()
		from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

		si = make_sales_invoice(dn.name)
		si.posting_date, si.set_posting_time, si.due_date = day, 1, add_days(day, 15)
		si.set("payment_schedule", [])
		si.flags.ignore_permissions = True
		si.insert()
		si.submit()


def _invoice(dn, day):
	from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

	si = make_sales_invoice(dn)
	si.posting_date, si.set_posting_time, si.due_date = day, 1, add_days(day, 30)
	si.set("payment_schedule", [])
	si.flags.ignore_permissions = True
	si.insert()
	si.submit()
	return si.name


def by_products_month(day, abbr):
	"""Molasses sold to the distillery; the month's bagasse burnt in the boilers."""
	from sugarcane.stock import stock_qty

	s = frappe.get_cached_doc("Sugar Settings")
	frappe.set_user("Administrator")
	mol = stock_qty(s.molasses_item, s.byproduct_warehouse, add_days(day, -1))
	if mol > 1000 and frappe.db.exists("Customer", "Chenab Distillery Ltd"):
		dn = frappe.get_doc({"doctype": "Delivery Note", "customer": "Chenab Distillery Ltd", "company": s.company, "posting_date": day,
			"set_posting_time": 1, "posting_time": "16:00:00", "items": [{"item_code": s.molasses_item, "qty": int(mol * 0.95), "rate": 36,
			"warehouse": s.byproduct_warehouse}]})
		dn.flags.ignore_permissions = True
		dn.insert()
		dn.submit()
		_invoice(dn.name, day)
	bag = stock_qty(s.bagasse_item, s.byproduct_warehouse, add_days(day, -1))
	if bag > 1000:
		se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "company": s.company, "posting_date": day,
			"set_posting_time": 1, "posting_time": "18:00:00", "remarks": f"Bagasse burnt in the boilers ({TAG})",
			"items": [{"item_code": s.bagasse_item, "qty": int(bag * 0.97), "s_warehouse": s.byproduct_warehouse,
				"cost_center": f"Boiler House - {abbr}" if frappe.db.exists("Cost Center", f"Boiler House - {abbr}") else s.cost_center}]})
		se.flags.ignore_permissions = True
		se.insert()
		se.submit()


def packing(abbr):
	s = frappe.get_cached_doc("Sugar Settings")
	if frappe.db.exists("Stock Entry", {"remarks": f"Packing bags for {SEASON} ({TAG})"}):
		return
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Receipt", "company": s.company, "posting_date": "2025-10-25",
		"set_posting_time": 1, "posting_time": "09:00:00", "remarks": f"Packing bags for {SEASON} ({TAG})",
		"items": [{"item_code": s.packing_item, "qty": 400000, "t_warehouse": s.packing_warehouse, "basic_rate": 40, "uom": "Nos", "conversion_factor": 1}]})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()


# ---------------------------------------------------------------- run
def run(loads_per_day: int = 40, until: str | None = None):
	"""Build (or continue) the 2025-26 season. Safe to stop and run again: closed days are skipped."""
	company = frappe.db.get_single_value("Sugar Settings", "company")
	abbr = frappe.get_cached_value("Company", company, "abbr")
	frappe.flags.mute_emails = True
	frappe.flags.sugar_sms_off = True
	rnd = random.Random(SEED)
	try:
		frappe.set_user("Administrator")
		fiscal_year(company)
		season(company, cint(loads_per_day))
		frappe.db.set_value("Crushing Season", SEASON, "status", "Open", update_modified=False)
		print("surveys", surveys(rnd), flush=True)
		indents()
		packing(abbr)
		from sugarcane.setup import demo_costing as dc

		dc.off_season(company, abbr, getdate("2025-07-01"), getdate("2025-10-31"))
		dc.stores_receipt(company, abbr, "2025-10-20")
		frappe.db.commit()
		vehicles = frappe.get_all("Sugar Vehicle", filters={"is_demo": 1, "is_blacklisted": 0}, fields=["name", "vehicle_type", "driver_name", "driver_cnic"],
			order_by="name")
		last = getdate(until) if until else END
		day = START
		while day <= last:
			rnd = random.Random(f"{SEED}-{day}")
			if not frappe.db.exists("Daily Cane Purchase", {"crushing_day": day, "docstatus": 1}):
				n = crush_day(rnd, day, cint(loads_per_day), vehicles)
				bags = plant_day(rnd, day) if n else 0
				frappe.set_user("Administrator")
				if getdate(day).weekday() == 0:
					pay_week(day)
					frappe.set_user("Administrator")
					dc.stores_issue(company, abbr, day)
				if getdate(day).weekday() == 5:
					sell_week(rnd, day, abbr)
				nxt = add_days(day, 1)
				if getdate(nxt).day == 1 or day == END:
					first = getdate(day).replace(day=1)
					cess_month(max(first, START), day, add_days(day, 8))
					by_products_month(day, abbr)
					frappe.set_user("Administrator")
					dc.month(company, abbr, max(first, START), day)
					frappe.db.commit()
					dc.costing_run(company, SEASON, max(first, START), day, close=day == END)
				frappe.db.commit()
				print(day, "loads", n, "bags", bags, flush=True)
			day = add_days(day, 1)
		if last >= END:
			pay_week(add_days(END, 3))
			frappe.db.set_value("Crushing Season", SEASON, "status", "Closed")
			frappe.db.commit()
	except Exception:
		frappe.db.rollback()  # the day in progress is dropped; run again to continue
		raise
	finally:
		if frappe.db.exists("Crushing Season", SEASON):
			frappe.db.set_value("Crushing Season", SEASON, "status", "Closed", update_modified=False)
			frappe.db.commit()
		frappe.flags.sugar_sms_off = False
		frappe.set_user("Administrator")
		from sugarcane.cane_procurement import procurement as p

		frappe.cache.delete_value(p.READING_KEY.format(TERMINAL))


def reset():
	"""Remove the 2025-26 season demo: cancel through the documents (newest first), then delete."""
	from sugarcane.setup.demo import _purge

	frappe.set_user("Administrator")
	frappe.flags.mute_emails = True

	def cancel(dt, filters, order="creation desc"):
		for name in frappe.get_all(dt, filters={**filters, "docstatus": 1}, pluck="name", order_by=order):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.cancel()
		frappe.db.commit()

	for name in frappe.get_all("Costing Run", filters={"season": SEASON, "docstatus": 1}, pluck="name", order_by="to_date desc"):
		d = frappe.get_doc("Costing Run", name)
		d.flags.ignore_permissions = True
		d.cancel()
	frappe.db.commit()
	cancel("Journal Entry", {"user_remark": ["like", f"%{TAG}%"]})
	custs = _customers() + ["Chenab Distillery Ltd"]
	s25 = {"posting_date": ["between", [START, add_days(END, 10)]]}
	cancel("Sales Invoice", {"customer": ["in", custs], **s25})
	cancel("Delivery Note", {"customer": ["in", custs], **s25})
	cancel("Stock Entry", {"remarks": ["like", f"%{TAG}%"]})
	cancel("Cane Payment Scroll", {"is_demo": 1, "remarks": ["like", f"%{TAG}%"]})
	cancel("Road Cess Deposit", {"is_demo": 1, "remarks": TAG})
	for name in frappe.get_all("TPT Bilty", filters={"season": SEASON, "status": "Paid"}, pluck="name"):
		from sugarcane.cane_procurement import procurement as p

		p.reverse_bilty_payment(name, "Season demo reset")
	cancel("Daily Production Entry", {"crushing_day": ["between", [START, END]], "is_demo": 1}, "crushing_day desc")
	cancel("Daily Manufacturing Report", {"season": SEASON}, "crushing_day desc")
	cancel("Daily Cane Purchase", {"season": SEASON}, "crushing_day desc")
	cancel("Cane Purchase Receipt", {"season": SEASON})
	cancel("Cane Token", {"season": SEASON})
	cancel("Indent Batch", {"season": SEASON})
	cancel("Cane Survey", {"season": SEASON})
	weigh = frappe.get_all("Cane Weighment", filters={"season": SEASON}, pluck="name")
	frappe.db.delete("Weighment Reading Log", {"weighment": ["in", weigh or [""]]})
	day_range = {"crushing_day": ["between", [START, END]], "is_demo": 1}
	for dt, f in (("Daily Production Entry", day_range), ("Daily Manufacturing Report", {"season": SEASON}), ("Mill Stoppage", day_range),
			("Daily Cane Purchase", {"season": SEASON}), ("TPT Bilty", {"season": SEASON}), ("Cane Purchase Receipt", {"season": SEASON}),
			("Cane Weighment", {"season": SEASON}), ("Cane Token", {"season": SEASON}), ("Cane Indent", {"season": SEASON}),
			("Indent Batch", {"season": SEASON}), ("Indent Quota Rule", {"season": SEASON}), ("Indent Range", {"season": SEASON}),
			("Cane Survey", {"season": SEASON})):
		if frappe.get_meta(dt).has_field(next(iter(f))):
			_purge(dt, frappe.get_all(dt, filters=f, pluck="name"))
	_purge("Lab Sample", frappe.get_all("Lab Sample", filters={"is_demo": 1, "sample_time": ["between", [f"{START} 00:00:00", f"{add_days(END, 1)} 23:59:59"]]},
		pluck="name"))
	_purge("Costing Run", frappe.get_all("Costing Run", filters={"season": SEASON}, pluck="name"))
	frappe.db.delete("By-product Rate", {"season": SEASON})
	if frappe.db.exists("Crushing Season", SEASON):
		frappe.delete_doc("Crushing Season", SEASON, force=True, ignore_permissions=True)
	frappe.db.commit()
