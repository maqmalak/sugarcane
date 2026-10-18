# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 7 dashboards for the React app: Purchase & Stores, Sugar Sales, Finance, HR & Payroll — and the actions that go
with them (batch posting and printing of vouchers, gate-pass returns, sales weighment, late penalties). The forms
themselves are ERPNext's own (desk), opened from the React pages."""
import frappe
from frappe import _
from frappe.utils import add_days, add_months, cint, flt, get_first_day, getdate, nowdate

STORES = {"System Manager", "Stock Manager", "Stock User", "Purchase Manager", "Purchase User", "Cane Admin", "MIS Viewer", "Accounts User"}
SALES = {"System Manager", "Sales Manager", "Sales User", "Stock Manager", "Cane Admin", "MIS Viewer", "Accounts User", "Gross Weighman", "Tare Weighman"}
FIN = {"System Manager", "Accounts Manager", "Accounts User", "Cane Admin", "MIS Viewer"}
HR = {"System Manager", "HR Manager", "HR User", "Cane Admin"}


def _need(roles, what):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to {0}").format(what), frappe.PermissionError)


def _company():
	return frappe.db.get_single_value("Sugar Settings", "company")


def _one(sql, *args):
	return frappe.db.sql(sql, args, as_dict=True)[0]


def _month(day=None, latest=None):
	"""This month so far — or, when nothing happened this month (the demo lives in November), the month of the latest `latest` (doctype, date field)."""
	d = getdate(day or nowdate())
	if latest and not day:
		last = frappe.db.sql(f"select max({latest[1]}) from `tab{latest[0]}` where docstatus = 1")[0][0]
		if last and getdate(last) < get_first_day(d) or (last and getdate(last) > d):
			d = getdate(last)
	return get_first_day(d), d


# ---------------------------------------------------------------- purchase & stores
@frappe.whitelist(methods=["GET"])
def purchase() -> dict:
	_need(STORES, _("see purchase and stores"))
	start, end = _month()
	flow = {
		"demands": _one("select count(*) n from `tabMaterial Request` where docstatus = 1 and status in ('Pending', 'Partially Ordered')").n,
		"inquiries": _one("select count(*) n from `tabRequest for Quotation` where docstatus = 1 and status != 'Cancelled'").n,
		"quotations": _one("select count(*) n from `tabSupplier Quotation` where docstatus < 2").n,
		"to_receive": _one("""select count(*) n, coalesce(sum(grand_total * (100 - per_received) / 100), 0) amt from `tabPurchase Order`
			where docstatus = 1 and per_received < 100 and status not in ('Closed', 'On Hold')"""),
		"grn_month": _one("""select count(*) n, coalesce(sum(base_grand_total), 0) amt from `tabPurchase Receipt` where docstatus = 1
			and posting_date between %s and %s""", start, end),
		"to_pay": _one("select count(*) n, coalesce(sum(outstanding_amount), 0) amt from `tabPurchase Invoice` where docstatus = 1 and outstanding_amount > 0"),
		"qi_pending": _one("select count(*) n from `tabQuality Inspection` where docstatus = 0").n,
	}
	suppliers = frappe.db.sql("""select supplier, supplier_name, count(*) orders, sum(base_grand_total) amount from `tabPurchase Order`
		where docstatus = 1 group by supplier, supplier_name order by amount desc limit 8""", as_dict=True)
	stock = frappe.db.sql("""select b.warehouse, sum(b.stock_value) value, count(distinct b.item_code) items from `tabBin` b
		where b.actual_qty != 0 group by b.warehouse order by value desc""", as_dict=True)
	i_start, i_end = _month(latest=("Stock Entry", "posting_date"))
	issues = frappe.db.sql("""select stock_entry_type, count(*) n, sum(total_outgoing_value) value from `tabStock Entry` where docstatus = 1
		and posting_date between %s and %s and stock_entry_type in ('Store Issue', 'Store Return', 'Store Transfer', 'Tools Issue', 'Tools Return',
		'Job Issue (BOM)', 'Consumption Voucher') group by stock_entry_type""", (i_start, i_end), as_dict=True)
	orders = frappe.get_all("Purchase Order", filters={"docstatus": ["<", 2]}, fields=["name", "supplier_name", "transaction_date", "grand_total",
		"status", "per_received", "per_billed"], order_by="transaction_date desc, name desc", limit=10)
	passes = frappe.get_all("Gate Pass", filters={"docstatus": 1, "pass_type": "Outward - Returnable", "status": ["in", ["Out", "Partly Returned"]]},
		fields=["name", "party_name", "posting_date", "expected_return_date", "status", "vehicle_no"], order_by="expected_return_date asc", limit=10)
	return {"flow": flow, "suppliers": suppliers, "stock": stock, "issues": issues, "orders": orders, "passes": passes,
		"today": nowdate()}


@frappe.whitelist(methods=["POST"])
def gate_pass_return(name: str) -> dict:
	from sugarcane.mill_stores.gate_pass import record_return

	return record_return(name)


# ---------------------------------------------------------------- sugar sales
@frappe.whitelist(methods=["GET"])
def sales() -> dict:
	_need(SALES, _("see sugar sales"))
	start, end = _month(latest=("Delivery Note", "posting_date"))
	s = frappe.get_cached_doc("Sugar Settings")
	from sugarcane.stock import stock_qty

	godown = stock_qty(s.sugar_item, s.sugar_warehouse) if s.get("sugar_item") and s.get("sugar_warehouse") else 0
	contracts = _one("""select count(distinct so.name) n, coalesce(sum(i.qty - i.delivered_qty), 0) bags, coalesce(sum((i.qty - i.delivered_qty) * i.rate), 0) amt
		from `tabSales Order` so join `tabSales Order Item` i on i.parent = so.name where so.docstatus = 1 and so.status not in ('Closed', 'Completed')
		and i.qty > i.delivered_qty""")
	lifted = _one("""select count(*) n, coalesce(sum(total_qty), 0) qty, coalesce(sum(base_grand_total), 0) amt from `tabDelivery Note`
		where docstatus = 1 and is_return = 0 and posting_date between %s and %s""", start, end)
	billed = _one("""select coalesce(sum(base_grand_total), 0) amt, coalesce(sum(total_taxes_and_charges), 0) tax from `tabSales Invoice`
		where docstatus = 1 and is_return = 0 and posting_date between %s and %s""", start, end)
	recv = _one("select count(*) n, coalesce(sum(outstanding_amount), 0) amt from `tabSales Invoice` where docstatus = 1 and outstanding_amount > 0")
	aging = frappe.db.sql("""select case when datediff(curdate(), due_date) <= 0 then 'Not due' when datediff(curdate(), due_date) <= 30 then '1-30'
		when datediff(curdate(), due_date) <= 60 then '31-60' when datediff(curdate(), due_date) <= 90 then '61-90' else '90+' end bucket,
		sum(outstanding_amount) amount from `tabSales Invoice` where docstatus = 1 and outstanding_amount > 0 group by bucket""", as_dict=True)
	territory = frappe.db.sql("""select territory, sum(total_qty) qty, sum(base_net_total) amount from `tabSales Invoice` where docstatus = 1
		and is_return = 0 group by territory order by amount desc""", as_dict=True)
	trend = frappe.db.sql("""select posting_date day, sum(total_qty) qty, sum(base_grand_total) amount from `tabDelivery Note` where docstatus = 1
		and is_return = 0 and posting_date >= %s group by posting_date order by posting_date""", add_days(end, -30), as_dict=True)
	loading = frappe.get_all("Sales Weighment", filters={"docstatus": 0}, fields=["name", "delivery_note", "customer_name", "vehicle_no",
		"tare_kg", "tare_at", "bags", "expected_kg", "terminal"], order_by="tare_at asc")
	to_load = frappe.get_all("Delivery Note", filters={"docstatus": 0, "is_return": 0}, fields=["name", "customer_name", "total_qty",
		"posting_date", "dispatch_vehicle_no", "delivery_order_no"], order_by="posting_date asc", limit=20)
	waiting = {w.delivery_note for w in loading}
	dispatches = frappe.db.sql("""select dn.name, dn.posting_date, dn.customer_name, dn.total_qty, dn.base_grand_total, dn.dispatch_vehicle_no vehicle_no,
		dn.gate_pass, w.net_kg, w.difference_pct, w.within_limit from `tabDelivery Note` dn left join `tabSales Weighment` w on w.name = dn.sales_weighment
		where dn.docstatus = 1 and dn.is_return = 0 order by dn.posting_date desc, dn.name desc limit 12""", as_dict=True)
	terminals = frappe.get_all("Weighbridge Terminal", filters={"is_active": 1}, pluck="name")
	rates = frappe.get_all("Item Price", filters={"price_list": "Sugar Rate List"}, fields=["item_code", "price_list_rate", "uom"])
	return {"godown_bags": godown, "contracts": contracts, "lifted": lifted, "billed": billed, "receivable": recv, "aging": aging,
		"territory": territory, "trend": [{**t, "day": str(t.day)} for t in trend], "loading": loading,
		"to_load": [d for d in to_load if d.name not in waiting], "dispatches": dispatches, "terminals": terminals, "rates": rates}


@frappe.whitelist(methods=["POST"])
def weigh_empty(delivery_note: str, vehicle_no: str, terminal: str, driver_name=None, manual_kg=None, note=None) -> dict:
	_need(SALES, _("weigh sales trucks"))
	from sugarcane.sugar_sales.dispatch import weigh_empty as w

	return w(delivery_note, vehicle_no, terminal, driver_name, manual_kg, note)


@frappe.whitelist(methods=["POST"])
def weigh_loaded(name: str, manual_kg=None, note=None, accept=0) -> dict:
	_need(SALES, _("weigh sales trucks"))
	from sugarcane.sugar_sales.dispatch import weigh_loaded as w

	return w(name, manual_kg, note, accept=accept)


# ---------------------------------------------------------------- finance
def _balances(company, account_type):
	return frappe.db.sql("""select a.name account, a.account_name, coalesce(sum(g.debit - g.credit), 0) balance from `tabAccount` a
		left join `tabGL Entry` g on g.account = a.name and g.is_cancelled = 0 where a.company = %s and a.account_type = %s and a.is_group = 0
		group by a.name, a.account_name order by balance desc""", (company, account_type), as_dict=True)


@frappe.whitelist(methods=["GET"])
def finance() -> dict:
	_need(FIN, _("see finance"))
	company = _company()
	start, end = _month(latest=("Journal Entry", "posting_date"))
	fy = getdate("2026-07-01") if end >= getdate("2026-07-01") else getdate("2025-07-01")
	from sugarcane.mill_finance.report.earnings_per_share.earnings_per_share import profit

	inc, exp = profit(company, fy, end)
	shares = flt(frappe.db.get_single_value("Sugar Settings", "shares_outstanding")) or 1
	drafts = frappe.db.sql("""select 'Journal Entry' doctype, name, voucher_code code, posting_date, total_debit amount, user_remark remark, owner
		from `tabJournal Entry` where docstatus = 0 union all select 'Payment Entry', name, if(payment_type = 'Pay', 'BPV', 'BRV'), posting_date,
		paid_amount, coalesce(remarks, party_name), owner from `tabPayment Entry` where docstatus = 0 order by posting_date, name limit 200""", as_dict=True)
	recent = frappe.get_all("Journal Entry", filters={"docstatus": 1}, fields=["name", "voucher_code", "posting_date", "total_debit", "user_remark"],
		order_by="posting_date desc, name desc", limit=15)
	codes = frappe.db.sql("""select coalesce(voucher_code, 'JV') code, count(*) n, sum(total_debit) amount from `tabJournal Entry`
		where docstatus = 1 and posting_date between %s and %s group by code""", (start, end), as_dict=True)
	pdc = _one("""select count(*) n, coalesce(sum(case when payment_type = 'Pay' then paid_amount else 0 end), 0) issued,
		coalesce(sum(case when payment_type = 'Receive' then paid_amount else 0 end), 0) received from `tabPayment Entry`
		where docstatus < 2 and reference_date > posting_date and clearance_date is null""")
	pay = _one("select coalesce(sum(outstanding_amount), 0) amt from `tabPurchase Invoice` where docstatus = 1 and outstanding_amount > 0").amt
	rec = _one("select coalesce(sum(outstanding_amount), 0) amt from `tabSales Invoice` where docstatus = 1 and outstanding_amount > 0").amt
	return {"banks": [b for b in _balances(company, "Bank") if b.balance], "cash": [b for b in _balances(company, "Cash") if b.balance],
		"payable": pay, "receivable": rec, "profit": {"from": str(fy), "income": inc, "expense": exp, "profit": inc - exp, "eps": round((inc - exp) / shares, 4)},
		"drafts": drafts, "recent": recent, "codes": codes, "pdc": pdc,
		"assets": _one("select count(*) n, coalesce(sum(net_purchase_amount), 0) cost, 0 book from `tabAsset` where docstatus = 1")}


@frappe.whitelist(methods=["POST"])
def post_vouchers(refs) -> dict:
	from sugarcane.mill_finance.vouchers import post

	return post(refs)


@frappe.whitelist(methods=["POST"])
def print_vouchers(refs):
	"""One PDF with a voucher per page (download)."""
	_need(FIN, _("print vouchers"))
	from sugarcane.mill_finance.vouchers import voucher_pdf

	refs = frappe.parse_json(refs) if isinstance(refs, str) else refs
	if not refs:
		frappe.throw(_("Choose the vouchers to print"))
	fname, pdf = voucher_pdf(refs)
	frappe.local.response.filename = fname
	frappe.local.response.filecontent = pdf
	frappe.local.response.type = "pdf"


# ---------------------------------------------------------------- HR & payroll
@frappe.whitelist(methods=["GET"])
def hr(day: str | None = None) -> dict:
	_need(HR, _("see HR"))
	d = getdate(day or nowdate())
	if not day and not frappe.db.exists("Attendance", {"attendance_date": d, "docstatus": 1}):  # the demo lives in November
		d = getdate(frappe.db.sql("select max(attendance_date) from `tabAttendance` where docstatus = 1")[0][0] or d)
	staff = frappe.db.sql("""select coalesce(department, '—') department, count(*) n, sum(employment_type = 'Seasonal') seasonal from `tabEmployee`
		where status = 'Active' group by department order by n desc""", as_dict=True)
	att = {r.status: cint(r.n) for r in frappe.db.sql("""select status, count(*) n from `tabAttendance` where docstatus = 1 and attendance_date = %s
		group by status""", d, as_dict=True)}
	late = _one("select count(*) n from `tabAttendance` where docstatus = 1 and attendance_date = %s and late_entry = 1", d).n
	checkins = _one("select count(*) n, count(distinct employee) people from `tabEmployee Checkin` where date(time) = %s", d)
	shifts = frappe.db.sql("""select coalesce(shift, '—') shift, count(*) n, sum(late_entry) late from `tabAttendance` where docstatus = 1
		and attendance_date = %s group by shift""", d, as_dict=True)
	payroll = frappe.db.sql("""select left(end_date, 7) month, count(*) slips, sum(gross_pay) gross, sum(total_deduction) deductions,
		sum(net_pay) net from `tabSalary Slip` where docstatus < 2 group by month order by month desc limit 6""", as_dict=True)
	trend = frappe.db.sql("""select attendance_date day, sum(status = 'Present') present, sum(status = 'Absent') absent, sum(late_entry) late
		from `tabAttendance` where docstatus = 1 and attendance_date between %s and %s group by attendance_date order by attendance_date""",
		(add_days(d, -13), d), as_dict=True)
	leaves = frappe.get_all("Leave Application", filters={"status": "Open", "docstatus": 0}, fields=["name", "employee_name", "leave_type",
		"from_date", "to_date", "total_leave_days"], order_by="from_date asc", limit=10)
	from sugarcane.mill_hr.hr import late_marks

	month = str(d)[:7]
	return {"day": str(d), "active": sum(r.n for r in staff), "staff": staff, "attendance": att, "late": late, "checkins": checkins,
		"shifts": shifts, "payroll": payroll, "trend": [{**t, "day": str(t.day)} for t in trend], "leaves": leaves,
		"late_month": late_marks(month)[:10], "month": month}


@frappe.whitelist(methods=["POST"])
def late_penalties(month: str) -> dict:
	from sugarcane.mill_hr.hr import late_penalties as lp

	return lp(month)
