"""Contractor bills (Phase 6).

Unloading at Mill        the yard unloading contractor: every gate CPR (net maund unloaded) and, under the contract, every
                         depot truck received, at the Unloading Contract's rate for the vehicle type (per maund, plus per vehicle)
                         — the contract in force on that day, else Sugar Settings → unloading rate. **Idle payment:** each mill
                         stoppage of a paid category and at least the minimum length, hours × the idle rate (capped per day).
                         Posts Dr Cane Loading and Unloading · Cr Creditors (party: the contractor).
Loading at Loading Point each CPR loaded at one of the contractor's loading points × the point's loading rate. Same posting.
Depot Freight and        the contractor's depot trucks received (freight, less the shortage recovered) and the depot commission
Commission               — already posted with the crushing days, so the bill is a statement (no journal).
A CPR, truck or stoppage is billed once per bill type.
"""

import re
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate

from sugarcane.cane_laboratory.lab import stoppage_minutes

ROLES = {"System Manager", "Cane Admin", "Cane Accountant"}


def _cats(text) -> set:
	return {c.strip() for c in re.split(r"\\n|\n|,", text or "") if c.strip()}


def _billed(bill_type: str, doctype: str, exclude: str | None) -> set:
	return set(frappe.db.sql_list("""select i.reference_name from `tabContractor Bill Item` i join `tabContractor Bill` b on b.name = i.parent
		where b.bill_type = %s and b.docstatus < 2 and b.name != %s and i.reference_doctype = %s""", (bill_type, exclude or "", doctype)))


def contract_for(contractor: str, day):
	name = frappe.db.get_value("Unloading Contract", {"contractor": contractor, "status": ["!=", "Terminated"], "valid_from": ["<=", day],
		"valid_to": [">=", day]}, "name")
	return frappe.get_cached_doc("Unloading Contract", name) if name else None


def _terms(contractor, day):
	"""(contract name, rate per maund, {vehicle type: (per maund, per vehicle)}, include depot trucks, idle rate, min minutes, max h/day, categories)"""
	s = frappe.get_cached_doc("Sugar Settings")
	c = contract_for(contractor, day)
	if c:
		return frappe._dict(contract=c.name, rate=flt(c.rate_per_maund), by_type={r.vehicle_type: (flt(r.rate_per_maund), flt(r.rate_per_vehicle)) for r in c.rates},
			depot=cint(c.include_depot_trucks), idle_rate=flt(c.idle_rate_per_hour), idle_min=cint(c.idle_min_minutes), idle_cap=flt(c.idle_max_hours_per_day),
			cats=_cats(c.idle_categories) or _cats(s.get("idle_categories")))
	return frappe._dict(contract=None, rate=flt(s.get("unloading_rate")), by_type={}, depot=1, idle_rate=flt(s.get("idle_rate_per_hour")),
		idle_min=cint(s.get("idle_min_minutes")), idle_cap=0, cats=_cats(s.get("idle_categories")))


def build(doc):
	s = frappe.get_cached_doc("Sugar Settings")
	doc.company = doc.company or s.company
	if doc.bill_type == "Unloading at Mill" and not doc.contractor:
		doc.contractor = s.get("unloading_contractor")
	if not doc.contractor:
		frappe.throw(_("Choose the contractor"))
	start, end = getdate(doc.from_date), getdate(doc.to_date)
	if end < start:
		frappe.throw(_("The period ends before it starts"))
	doc.set("items", [])
	{"Unloading at Mill": _unloading, "Loading at Loading Point": _loading, "Depot Freight and Commission": _depot}[doc.bill_type](doc, start, end)
	doc.line_count = len(doc.items)
	doc.total_maund = round(sum(flt(i.maund) for i in doc.items), 3)
	doc.gross_amount = round(sum(flt(i.amount) for i in doc.items), 2)
	doc.deductions = round(sum(flt(i.deduction) for i in doc.items), 2)
	doc.net_amount = round(doc.gross_amount - doc.deductions, 2)
	doc.idle_hours = round(sum(flt(i.hours) for i in doc.items if i.reference_doctype == "Mill Stoppage"), 2)
	doc.idle_amount = round(sum(flt(i.amount) for i in doc.items if i.reference_doctype == "Mill Stoppage"), 2)


def _unloading(doc, start, end):
	billed_cpr = _billed(doc.bill_type, "Cane Purchase Receipt", doc.name)
	billed_dsp = _billed(doc.bill_type, "Depot Dispatch", doc.name)
	billed_stop = _billed(doc.bill_type, "Mill Stoppage", doc.name)
	contracts = set()
	for c in frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": ["between", [start, end]], "purchase_depot": ["is", "not set"]},
			fields=["name", "posting_date", "vehicle_no", "vehicle_type", "net_kg", "grower_name"], order_by="posted_at"):
		if c.name in billed_cpr:
			continue
		t = _terms(doc.contractor, c.posting_date)
		contracts.add(t.contract)
		per_md, per_v = t.by_type.get(c.vehicle_type, (0, 0))
		rate = per_md or (flt(doc.rate) if not t.contract and flt(doc.rate) else t.rate)
		md = round(flt(c.net_kg) / 40, 3)
		doc.append("items", {"posting_date": c.posting_date, "reference_doctype": "Cane Purchase Receipt", "reference_name": c.name, "vehicle_no": c.vehicle_no,
			"description": f"Unloaded {c.vehicle_type} · {c.grower_name}", "maund": md, "rate": rate, "amount": round(md * rate + per_v, 2)})
	for d in frappe.get_all("Depot Dispatch", filters={"docstatus": 1, "status": "Received", "received_day": ["between", [start, end]]},
			fields=["name", "received_day", "vehicle_no", "vehicle_type", "received_kg", "depot"], order_by="mill_tare_at"):
		t = _terms(doc.contractor, d.received_day)
		if d.name in billed_dsp or not t.depot:
			continue
		per_md, per_v = t.by_type.get(d.vehicle_type, (0, 0))
		rate = per_md or t.rate
		md = round(flt(d.received_kg) / 40, 3)
		doc.append("items", {"posting_date": d.received_day, "reference_doctype": "Depot Dispatch", "reference_name": d.name, "vehicle_no": d.vehicle_no,
			"description": f"Unloaded depot truck from {d.depot}", "maund": md, "rate": rate, "amount": round(md * rate + per_v, 2)})
	day = start
	while day <= end:  # idle payment: the crew waits while the mill is stopped
		t = _terms(doc.contractor, day)
		if t.idle_rate:
			paid = 0.0
			for st in stoppage_minutes(day)[1]:
				if st.name in billed_stop or st.category not in t.cats or cint(st.minutes_in_day) < t.idle_min:
					continue
				h = round(cint(st.minutes_in_day) / 60, 2)
				if t.idle_cap:
					h = round(max(min(h, t.idle_cap - paid), 0), 2)
				if h <= 0:
					continue
				paid += h
				doc.append("items", {"posting_date": day, "reference_doctype": "Mill Stoppage", "reference_name": st.name, "hours": h, "rate": t.idle_rate,
					"description": f"Idle: mill stopped {st.minutes_in_day} min ({st.category}{' · ' + st.reason if st.reason else ''})"[:140],
					"amount": round(h * t.idle_rate, 2)})
		day = add_days(day, 1)
	contracts.discard(None)
	doc.unloading_contract = sorted(contracts)[0] if contracts else None
	doc.rate = doc.rate or (_terms(doc.contractor, start).rate)
	doc.idle_rate = _terms(doc.contractor, start).idle_rate


def _loading(doc, start, end):
	points = [doc.loading_point] if doc.loading_point else frappe.get_all("Loading Point", filters={"contractor": doc.contractor}, pluck="name")
	if not points:
		frappe.throw(_("{0} has no loading points").format(doc.contractor))
	billed = _billed(doc.bill_type, "Cane Purchase Receipt", doc.name)
	rates = dict(frappe.get_all("Loading Point", filters={"name": ["in", points]}, fields=["name", "loading_rate"], as_list=True))
	for c in frappe.get_all("Cane Purchase Receipt", filters={"docstatus": 1, "posting_date": ["between", [start, end]], "loading_point": ["in", points]},
			fields=["name", "posting_date", "vehicle_no", "loading_point", "payable_maund", "grower_name"], order_by="posted_at"):
		if c.name in billed:
			continue
		rate = flt(rates.get(c.loading_point))
		doc.append("items", {"posting_date": c.posting_date, "reference_doctype": "Cane Purchase Receipt", "reference_name": c.name, "vehicle_no": c.vehicle_no,
			"description": f"Loaded at {c.loading_point} · {c.grower_name}", "maund": c.payable_maund, "rate": rate, "amount": round(flt(c.payable_maund) * rate, 2)})


def _depot(doc, start, end):
	depots = [doc.depot] if doc.depot else frappe.get_all("Cane Depot", filters={"contractor": doc.contractor}, pluck="name")
	billed = _billed(doc.bill_type, "Depot Dispatch", doc.name)
	billed_je = _billed(doc.bill_type, "Journal Entry", doc.name)
	for d in frappe.get_all("Depot Dispatch", filters={"docstatus": 1, "status": "Received", "received_day": ["between", [start, end]],
			"depot": ["in", depots or [""]], "contractor": doc.contractor}, fields=["name", "received_day", "vehicle_no", "received_kg", "freight_rate",
			"freight_amount", "recovery_amount", "shortage_kg", "excess_shortage_kg", "posted_in", "depot"], order_by="mill_tare_at"):
		if d.name in billed:
			continue
		doc.append("items", {"posting_date": d.received_day, "reference_doctype": "Depot Dispatch", "reference_name": d.name, "vehicle_no": d.vehicle_no,
			"description": f"Freight from {d.depot}; short {d.shortage_kg} kg ({d.excess_shortage_kg} kg over the allowance){'' if d.posted_in else ' · day not closed'}",
			"maund": round(flt(d.received_kg) / 40, 3), "rate": d.freight_rate, "amount": d.freight_amount, "deduction": d.recovery_amount})
	for p in frappe.db.sql("""select dcp.crushing_day day, p.amount, p.depot, p.voucher, p.description from `tabDaily Cane Purchase Posting` p
			join `tabDaily Cane Purchase` dcp on dcp.name = p.parent where dcp.docstatus = 1 and p.description like 'Commission%%'
			and p.depot in %(d)s and dcp.crushing_day between %(s)s and %(e)s""", {"d": depots or [""], "s": start, "e": end}, as_dict=True):
		if p.voucher in billed_je:
			continue
		doc.append("items", {"posting_date": p.day, "reference_doctype": "Journal Entry", "reference_name": p.voucher, "description": p.description,
			"amount": p.amount})


def check(doc):
	if not ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the cane accountant posts contractor bills"), frappe.PermissionError)
	if not doc.items:
		frappe.throw(_("Nothing to bill in this period"))
	if doc.bill_type != "Depot Freight and Commission" and not frappe.get_cached_doc("Sugar Settings").get("contract_labour_account"):
		frappe.throw(_("Set the Cane Loading & Unloading account in Sugar Settings"))


def post(doc):
	if doc.bill_type == "Depot Freight and Commission":
		doc.db_set("status", "Statement")
		return
	s = frappe.get_cached_doc("Sugar Settings")
	if not s.get("contract_labour_account"):
		frappe.throw(_("Set the Cane Loading & Unloading account in Sugar Settings"))
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Journal Entry", "company": doc.company, "posting_date": doc.bill_date,
		"cheque_no": doc.name, "cheque_date": doc.bill_date,
		"user_remark": _("{0} bill {1}: {2} – {3}, {4} lines{5}").format(doc.bill_type, doc.name, doc.from_date, doc.to_date, doc.line_count,
			_(", idle {0} h").format(doc.idle_hours) if flt(doc.idle_hours) else ""),
		"accounts": [
			{"account": s.contract_labour_account, "debit_in_account_currency": flt(doc.net_amount), "cost_center": s.cost_center},
			{"account": frappe.get_cached_value("Company", doc.company, "default_payable_account"), "party_type": "Supplier", "party": doc.contractor,
				"credit_in_account_currency": flt(doc.net_amount), "cost_center": s.cost_center},
		]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	doc.db_set({"journal_entry": je.name, "status": "Posted"})


def unpost(doc):
	if doc.journal_entry and frappe.db.get_value("Journal Entry", doc.journal_entry, "docstatus") == 1:
		je = frappe.get_doc("Journal Entry", doc.journal_entry)
		je.flags.ignore_permissions = True
		je.flags.ignore_links = True
		je.cancel()
	doc.db_set("status", "Cancelled")


def bill_pdf(name: str) -> tuple[str, bytes]:
	from sugarcane.cane_accounting.bank_docs import _ctx, _pdf, app_url, qr

	doc = frappe.get_doc("Contractor Bill", name)
	doc.check_permission("read")
	groups = defaultdict(lambda: {"rows": [], "maund": 0.0, "amount": 0.0, "deduction": 0.0, "hours": 0.0})
	label = {"Cane Purchase Receipt": _("Cane unloaded (gate CPRs)") if doc.bill_type == "Unloading at Mill" else _("Cane loaded"),
		"Depot Dispatch": _("Depot trucks"), "Mill Stoppage": _("Idle payment — mill stopped"), "Journal Entry": _("Depot commission")}
	for i in doc.items:
		g = groups[label.get(i.reference_doctype, i.reference_doctype)]
		g["rows"].append(i)
		for k in ("maund", "amount", "deduction", "hours"):
			g[k] = round(g[k] + flt(i.get(k)), 3 if k in ("maund", "hours") else 2)
	sup = frappe.db.get_value("Supplier", doc.contractor, ["supplier_name", "tax_id"], as_dict=True) or {}
	pdf = _pdf("contractor_bill", _ctx(doc=doc, groups=dict(groups), sup=sup, qr=qr(app_url(f"/accounts/d/contractor-bill/{doc.name}"))))
	return f"Contractor bill {doc.name}.pdf", pdf
