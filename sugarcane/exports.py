"""Report centre for the React app (ported from the real-estate app): every sugar-mill script report the user may open,
with simple filters, a preview and Excel (.xlsx) / PDF downloads. New reports in the sugar modules appear on their own.
Permissions are the report's own roles (frappe.desk.query_report.run checks them)."""

import json

import frappe
from frappe import _
from frappe.utils import add_days, cstr, flt, fmt_money, formatdate, nowdate

SUGAR_MODULES = ("Sugarcane", "EagleEye Survey", "Cane Indenting", "Vehicle Tracking", "Cane Procurement", "Weighbridge",
	"Depot Purchase", "Cane Accounting", "Grower Loans", "Cane Costing", "Sugar Production", "Cane Laboratory",
	"SMS Integration", "Sugar MIS", "Mill Stores", "Sugar Sales", "Mill Finance", "Mill HR")
GROUPS = {"EagleEye Survey": "Crop Survey", "Cane Indenting": "Indenting", "Cane Procurement": "Procurement",
	"Weighbridge": "Weighbridge", "Cane Accounting": "Cane Accounts", "Grower Loans": "Grower Loans", "Cane Costing": "Costing",
	"Sugar Production": "Production", "Cane Laboratory": "Laboratory", "Sugar MIS": "MIS", "Sugarcane": "Masters", "Vehicle Tracking": "ELP", "Depot Purchase": "Depot",
	"Mill Stores": "Purchase & Stores", "Sugar Sales": "Sugar Sales", "Mill Finance": "Finance", "Mill HR": "HR & Payroll"}
SURVEY = ["season", "from_date", "to_date", "zone", "circle", "village", "variety", "crop_type", "survey_for"]
FILTERS = {  # report -> filters it accepts (default by module below)
	"Surveyor Attendance Report": ["from_date", "to_date", "surveyor", "circle", "attendance_status"],
	"Surveyor Performance": ["season", "circle"],
	"Survey vs Actual Yield": ["season", "circle", "variety"],
	"Indent Register": ["season", "from_date", "to_date", "circle", "village", "indent_status"],
	"Daily Indent Schedule": ["season", "from_date", "to_date", "circle"],
	"Circle Wise Indent Summary": ["season", "circle"],
	"Grower Indent Balance": ["season", "circle", "village"],
	"ELP Pending Registrations": ["circle"],
	"CPR Register": ["from_date", "to_date", "circle", "entry_type", "payment_status"],
	"TPT Bilty Register": ["from_date", "to_date", "bilty_status"],
	"Cane Day Close": ["to_date"],
	"Token Register": ["from_date", "to_date", "circle", "token_status"],
	"Depot Stock": ["to_date"],
	"Variety Wise Recovery": ["from_date", "to_date", "recovery_group"],
	"Grower Ledger": ["grower", "from_date", "to_date"],
	"Grower Payable Aging": ["as_on", "circle"],
	"CPR Paid Unpaid": ["from_date", "to_date", "circle", "payment_status"],
	"Road Cess Deducted vs Deposited": [],
	"Depot Dispatch Register": ["from_date", "to_date", "depot", "dispatch_status"],
	"Season Progress": ["season", "to_date"],
	"Circle Wise Performance": ["season", "to_date"],
	"Grower Supply Ranking": ["season", "circle"],
	"Comparative Statement": ["from_date", "to_date"],
	"Gate Pass Outstanding": ["from_date", "to_date"],
	"Sugar Dispatch Register": ["from_date", "to_date"],
	"Payables Projection": [],
	"Post Dated Cheques": [],
	"Earnings Per Share": ["from_date", "to_date"],
	"WPPF and WWF": ["from_date", "to_date"],
	"Voucher Register": ["from_date", "to_date"],
	"Late Coming Register": [],
	"Production Summary": ["season", "from_date", "to_date", "production_group"],
	"By-product Stock and Movement": ["season", "from_date", "to_date"],
	"By-product Realization": ["season", "to_date"],
	"Cost of Production Statement": ["season", "from_date", "to_date"],
	"Accounts Receivable": ["to_date"], "Accounts Receivable Summary": ["to_date"], "Accounts Payable": ["to_date"], "Accounts Payable Summary": ["to_date"],
	"Sales Register": ["from_date", "to_date"], "Purchase Register": ["from_date", "to_date"],
	"Cost per Bag Trend": ["season", "from_date", "to_date"],
	"Cost Center Expense Analysis": ["season", "from_date", "to_date"],
	"Recovery vs Cost": ["season", "from_date", "to_date", "cost_view"],
	"Pol Loss Analysis": ["season", "from_date", "to_date"],
	"In-process Ledger": ["season", "from_date", "to_date"],
}
MODULE_FILTERS = {"EagleEye Survey": SURVEY, "Vehicle Tracking": ["from_date", "to_date", "circle"],
	"Cane Procurement": ["from_date", "to_date", "circle"], "Weighbridge": ["from_date", "to_date"],
	"Depot Purchase": ["from_date", "to_date", "depot"], "Cane Laboratory": ["from_date", "to_date"], "Sugar Production": ["from_date", "to_date"],
	"Cane Accounting": ["from_date", "to_date", "circle"], "Grower Loans": ["circle", "loan_status"], "Cane Costing": ["from_date", "to_date"]}
DESCRIPTIONS = {
	"Cane Survey Detail": "Every surveyed field: grower, CNIC, passbook, village, variety, declared vs measured area",
	"Circle Wise Survey Summary": "Fields, growers, area, plant / ratoon / diseased acres and expected cane per circle",
	"Variety Wise Survey Summary": "Surveyed area and expected cane by cane variety",
	"Grower Wise Survey Summary": "Each grower's surveyed fields, area and expected cane",
	"Grower and Circle Wise Survey": "Growers within each circle, by variety",
	"Circle and Village Wise Survey": "Surveyed area for every village of every circle",
	"Sector Wise Survey Summary": "Surveyed area by sector",
	"Survey vs Actual Yield": "Expected cane from the survey against cane received (CPRs) by variety",
	"Surveyor Attendance Report": "Check-in / check-out, hours, km, geofence and fields surveyed per day",
	"Surveyor Performance": "Each surveyor's target against acres and fields surveyed",
	"Indent Register": "Every indent: grower, supply date, validity, load, delivery point, batch, prints and token",
	"Circle Wise Indent Summary": "Surveyed and entitled cane, loads, and indents issued / used / expired per circle",
	"Grower Indent Balance": "Each grower's entitled loads against indents issued, used, expired and still to issue",
	"Daily Indent Schedule": "Indents per supply day against the mill's daily intake capacity",
	"ELP Pending Registrations": "Indents valid today that no vehicle was registered against at a loading point yet",
	"ELP Pending Arrival": "Vehicles registered at a loading point / depot that have not reached the mill gate",
	"ELP Pending Verification": "Arrived vehicles (gate photos taken) waiting for the audit team",
	"ELP Uncleared Registrations": "Registrations neither accepted, rejected nor cancelled after 24 hours",
	"ELP LP Wise Summary": "Per loading point: registered, in transit, pending verification, accepted, rejected, journey times",
	"ELP Reconciliation": "Per circle and day: indents against loads registered, arrived, accepted and rejected",
	"ELP Total Loads": "Loads registered per day and their outcome",
	"ELP Registration Audit": "Every registration: GPS actual vs the point's parameters, geofence, device, serial, tower, photo quality",
	"ELP Arrival Audit": "Every arrival: GPS at the gate, journey vs standard and average, verdict and auditor",
	"ELP Vehicles Not Arrived": "Vehicles still not at the mill 48 hours after registration",
	"ELP Journey Time": "Each journey against the point's standard time and its own average",
	"Season Progress": "Day by day: cane bought (gate / depots), crushed, sugar bags and recovery, with running totals against the season target",
	"Circle Wise Performance": "Per circle: survey, quota, indents issued / used / expired and cane supplied — % of quota and of the survey",
	"Grower Supply Ranking": "Growers by cane supplied: survey expected, loads, payable, paid, unpaid and loan outstanding",
	"Comparative Statement": "Supplier quotations side by side per item: each rate, the lowest, the spread and the last PO rate",
	"Gate Pass Outstanding": "Returnable items still outside the mill, with days overdue",
	"Sugar Dispatch Register": "Delivery Orders lifted: bags, truck weight against expected, gate pass and billing",
	"Payables Projection": "What the mill will pay by week: unpaid bills by due date plus goods received but not invoiced",
	"Post Dated Cheques": "Cheques issued and received dated after today, with the days to presentation",
	"Earnings Per Share": "Profit after tax ÷ shares outstanding, by month and for the period",
	"WPPF and WWF": "Workers' Profit Participation Fund (5%) and Workers' Welfare Fund (2%) on profit before tax",
	"Voucher Register": "Journals by voucher type — JV, BPV, BRV, CPV, CRV — posted and draft",
	"Late Coming Register": "Late marks per employee for a month and the days to deduct",
	"Production Summary": "Cane crushed, sugar bags by grade, recovery and by-products — by day, week or month",
	"By-product Stock and Movement": "Molasses, bagasse and press mud: opening, produced, burnt in the boilers, sold, closing",
	"By-product Realization": "NRV credited against the sales value realised (less selling cost) for the by-products sold",
	"Accounts Receivable": "Who owes the mill, invoice by invoice, aged 0–30, 31–60, 61–90, 91–120 and over 120 days",
	"Accounts Receivable Summary": "Receivable per customer with the ageing buckets",
	"Accounts Payable": "What the mill owes, bill by bill, aged by due date",
	"Accounts Payable Summary": "Payable per supplier with the ageing buckets",
	"Sales Register": "Every sales invoice in the period with its taxes and totals",
	"Purchase Register": "Every purchase invoice in the period with its taxes and totals",
	"Cost of Production Statement": "Cane + processing − by-product credit = net cost of sugar per kg / bag / ton of cane, beside the previous season",
	"Cost per Bag Trend": "Daily stock and provisional cost per bag against each costing run's final cost",
	"Cost Center Expense Analysis": "Processing cost by cost centre and element after allocation, per ton of cane",
	"Recovery vs Cost": "Recovery % and cost per kg side by side, by month or by circle",
	"Pol Loss Analysis": "Pol lost in bagasse, press mud, molasses and undetermined, with recovery and mill extraction",
	"In-process Ledger": "Day by day: cane opening, received, into process, closing (t, Rs); packing and processing added; sugar and by-products out",
}
# filter key -> (label, kind, source); kind: date | select | link; the report receives `param` (or the key)
FILTER_DEFS = {
	"season": {"label": "Season", "kind": "link", "doctype": "Crushing Season"},
	"from_date": {"label": "From", "kind": "date"},
	"to_date": {"label": "To", "kind": "date"},
	"zone": {"label": "Zone", "kind": "link", "doctype": "Sugar Zone"},
	"circle": {"label": "Circle", "kind": "link", "doctype": "Cane Circle"},
	"village": {"label": "Village", "kind": "link", "doctype": "Cane Village", "title": "village_name", "depends": "circle"},
	"variety": {"label": "Variety", "kind": "link", "doctype": "Cane Variety"},
	"crop_type": {"label": "Plant / Ratoon", "kind": "select", "options": ["Plant", "Ratoon"]},
	"survey_for": {"label": "Survey For", "kind": "select", "options": ["Company", "Competitor", "All"]},
	"attendance_status": {"label": "Status", "kind": "select", "options": ["Present", "Half Day", "Out of Area", "Absent"],
		"param": "status"},
	"entry_type": {"label": "Entry", "kind": "select", "options": ["ELP Verified", "Gate", "Depot"]},
	"depot": {"label": "Depot", "kind": "link", "doctype": "Cane Depot"},
	"grower": {"label": "Grower", "kind": "link", "doctype": "Grower", "title": "grower_name"},
	"as_on": {"label": "As on", "kind": "date"},
	"loan_status": {"label": "Status", "kind": "select", "options": ["Draft", "Approved", "Disbursed", "Recovered", "Written Off"], "param": "status"},
	"recovery_group": {"label": "Group by", "kind": "select", "options": ["Variety", "Circle", "Grower", "Source"], "param": "group_by"},
	"dispatch_status": {"label": "Status", "kind": "select", "options": ["Loading", "In Transit", "At Mill", "Received", "Cancelled"], "param": "status"},
	"payment_status": {"label": "Payment", "kind": "select", "options": ["Unpaid", "Paid"]},
	"bilty_status": {"label": "Status", "kind": "select", "options": ["Unpaid", "Paid"], "param": "status"},
	"token_status": {"label": "Status", "kind": "select", "options": ["Issued", "Gross", "Completed", "Cancelled"], "param": "status"},
	"production_group": {"label": "By", "kind": "select", "options": ["Day", "Week", "Month"], "param": "group_by"},
	"cost_view": {"label": "View", "kind": "select", "options": ["Month", "Circle"], "param": "view"},
	"indent_status": {"label": "Status", "kind": "select", "options": ["Draft", "Authorized", "Printed", "Used", "Expired", "Cancelled"],
		"param": "status"},
}
MAX_PREVIEW = 300


# ERPNext's own finance reports, shown in the Report Centre under Finance (receivables, payables, registers).
ERP_FINANCE = ("Accounts Receivable", "Accounts Receivable Summary", "Accounts Payable", "Accounts Payable Summary", "Sales Register", "Purchase Register")
AGEING = ("Accounts Receivable", "Accounts Receivable Summary", "Accounts Payable", "Accounts Payable Summary")


def _reports():
	rows = frappe.get_all("Report", filters={"module": ["in", SUGAR_MODULES], "disabled": 0,
		"report_type": ["in", ["Script Report", "Query Report"]]}, fields=["name", "module"], order_by="module asc, name asc")
	out = {r.name: r.module for r in rows}
	for name in ERP_FINANCE:
		if frappe.db.exists("Report", {"name": name, "disabled": 0}):
			out[name] = "Mill Finance"
	return out


def _accepted(report, module):
	return FILTERS.get(report) or MODULE_FILTERS.get(module, [])


def _filters(report, module, raw):
	given = json.loads(raw) if isinstance(raw, str) else (raw or {})
	accepted = _accepted(report, module)
	f = {}
	for key in accepted:
		value = given.get(key)
		if value in (None, ""):
			continue
		f[FILTER_DEFS.get(key, {}).get("param", key)] = value
	if "season" in accepted and not f.get("season"):
		f["season"] = frappe.db.get_single_value("Sugar Settings", "active_season")
	if report in ERP_FINANCE:  # ERPNext's own reports need the company and their own date names
		f["company"] = frappe.defaults.get_user_default("Company") or frappe.db.get_single_value("Global Defaults", "default_company")
		if report in AGEING:
			f["report_date"] = f.pop("to_date", None) or nowdate()
			f.setdefault("ageing_based_on", "Due Date")
			f.setdefault("range", "30, 60, 90, 120")
			f.setdefault("range1", 30); f.setdefault("range2", 60); f.setdefault("range3", 90); f.setdefault("range4", 120)
		else:
			f.setdefault("from_date", frappe.utils.get_first_day(nowdate()))
			f.setdefault("to_date", nowdate())
	if report == "Surveyor Attendance Report":
		f.setdefault("from_date", add_days(nowdate(), -14))
		f.setdefault("to_date", nowdate())
	return f


def _options(accepted, given):
	out = {}
	for key in accepted:
		d = FILTER_DEFS.get(key, {})
		if d.get("kind") == "select":
			out[key] = [{"value": o, "label": o} for o in d["options"]]
		elif d.get("kind") == "link" and frappe.has_permission(d["doctype"], "read"):
			fields = ["name"] + ([d["title"]] if d.get("title") else [])
			flt_ = {}
			if d.get("depends") and given.get(d["depends"]) and frappe.get_meta(d["doctype"]).has_field(d["depends"]):
				flt_[d["depends"]] = given[d["depends"]]
			rows = frappe.get_list(d["doctype"], fields=fields, filters=flt_, order_by="name asc", limit_page_length=500)
			out[key] = [{"value": r.name, "label": (r.get(d["title"]) if d.get("title") else None) or r.name} for r in rows]
		elif key == "surveyor":
			out[key] = [{"value": u, "label": frappe.utils.get_fullname(u)} for u in
				frappe.get_all("Has Role", filters={"role": "Surveyor", "parenttype": "User", "parent": ["not in", ["Administrator"]]},
					pluck="parent", distinct=True)]
	return out


def _run(report, filters):
	from frappe.desk.query_report import run

	result = run(report, filters=filters, ignore_prepared_report=True)
	frappe.local.sc_report_extras = {"chart": result.get("chart"), "summary": result.get("report_summary"),
		"message": result.get("message")}
	columns = []
	for c in result.get("columns") or []:
		if isinstance(c, str):  # "Label:Type/Options:Width"
			label, _sep, rest = c.partition(":")
			c = {"label": label, "fieldname": frappe.scrub(label), "fieldtype": (rest.split(":")[0].split("/")[0] or "Data")}
		columns.append({"label": c.get("label"), "fieldname": c.get("fieldname"), "fieldtype": c.get("fieldtype") or "Data"})
	rows = []
	for r in result.get("result") or []:
		if isinstance(r, (list, tuple)):
			r = {columns[i]["fieldname"]: v for i, v in enumerate(r) if i < len(columns)}
		if isinstance(r, dict):
			rows.append(r)
	return columns, rows


def _check(report):
	reports = _reports()
	if report not in reports:
		frappe.throw(_("Unknown report {0}").format(report))
	return reports[report]


@frappe.whitelist(methods=["GET"])
def catalogue() -> list[dict]:
	"""Reports this user may open, grouped by module, with the filters each accepts (labels and kinds)."""
	out = []
	for name, module in _reports().items():
		if not frappe.get_doc("Report", name).is_permitted():
			continue
		accepted = _accepted(name, module)
		out.append({"name": name, "group": GROUPS.get(module, module), "module": module, "filters": accepted,
			"filter_defs": [{"key": k, "label": FILTER_DEFS.get(k, {}).get("label", k.replace("_", " ").title()),
				"kind": FILTER_DEFS.get(k, {}).get("kind", "select" if k == "surveyor" else "text")} for k in accepted],
			"description": DESCRIPTIONS.get(name, "")})
	return out


@frappe.whitelist(methods=["GET"])
def preview(report: str, filters: str | None = None) -> dict:
	module = _check(report)
	given = json.loads(filters) if filters else {}
	f = _filters(report, module, given)
	columns, rows = _run(report, f)
	extras = getattr(frappe.local, "sc_report_extras", {}) or {}
	summary = [{"label": cstr(x.get("label")), "value": x.get("value"), "datatype": x.get("datatype"), "indicator": x.get("indicator")}
		for x in (extras.get("summary") or []) if isinstance(x, dict)]
	shown = {k: f.get(FILTER_DEFS.get(k, {}).get("param", k)) for k in _accepted(report, module)}
	return {"columns": columns, "rows": rows[:MAX_PREVIEW], "total": len(rows), "filters": {k: v for k, v in shown.items() if v},
		"summary": summary, "chart": extras.get("chart"), "message": cstr(extras.get("message") or "") or None,
		"options": _options(_accepted(report, module), {**given, **shown}), "blocks": []}


def _cell(value, fieldtype, for_pdf=False):
	if value is None:
		return ""
	if fieldtype == "Currency":
		return fmt_money(flt(value), precision=0, currency="PKR") if for_pdf else flt(value)
	if fieldtype in ("Float", "Percent"):
		return flt(value, 2)
	if fieldtype == "Int":
		return int(flt(value))
	if fieldtype == "Check":
		return "Yes" if value else "No"
	if fieldtype == "Date" and for_pdf:
		return formatdate(value)
	return cstr(value) if for_pdf or not isinstance(value, (int, float)) else value


@frappe.whitelist(methods=["GET"])
def download(report: str, file_format: str = "xlsx", filters: str | None = None):
	"""Stream the whole report (not just the preview) as .xlsx or .pdf."""
	module = _check(report)
	f = _filters(report, module, filters)
	columns, rows = _run(report, f)
	stamp = nowdate()
	if file_format == "xlsx":
		from frappe.utils.xlsxutils import make_xlsx

		data = [[c["label"] for c in columns]] + [[_cell(r.get(c["fieldname"]), c["fieldtype"]) for c in columns] for r in rows]
		frappe.local.response.filecontent = make_xlsx(data, report[:31]).getvalue()
		frappe.local.response.filename = f"{report} {stamp}.xlsx"
	elif file_format == "pdf":
		from frappe.utils.pdf import get_pdf

		company = frappe.db.get_single_value("Sugar Settings", "company")
		head = frappe.db.get_value("Letter Head", {"is_default": 1}, "content") or (
			f"<h2 style='margin:0'>{frappe.utils.escape_html(company or '')}</h2>")
		letter_head = frappe.render_template(head, {"doc": frappe._dict()})
		html = frappe.render_template("sugarcane/templates/docs/report_export.html", {
			"title": report, "letter_head": letter_head, "columns": columns, "filters": f, "generated": frappe.utils.now_datetime(),
			"rows": [[_cell(r.get(c["fieldname"]), c["fieldtype"], True) for c in columns] for r in rows],
			"numeric": [c["fieldtype"] in ("Currency", "Float", "Int", "Percent") for c in columns],
			"nowrap": [c["fieldtype"] in ("Currency", "Float", "Int", "Percent", "Date", "Link", "Datetime") for c in columns],
			"user": frappe.utils.get_fullname(frappe.session.user),
		})
		frappe.local.response.filecontent = get_pdf(html, {"orientation": "Landscape" if len(columns) > 6 else "Portrait"})
		frappe.local.response.filename = f"{report} {stamp}.pdf"
	else:
		frappe.throw(_("Format must be xlsx or pdf"))
	frappe.local.response.type = "download"
