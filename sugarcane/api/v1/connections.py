"""Connections for the React form's "Connections" tab on this site.

mm_core.connections builds groups from a DocType's desk dashboard definition (`<doctype>_dashboard.py`); the real-estate
DocTypes have none, so their tab was empty. This wraps it (hooks.override_whitelisted_methods — only on sites with this
app) and adds what the desk would discover from the schema:

* "Linked to this <doctype>": every business DocType with a Link (or Dynamic Link) field pointing here — directly or
  through a child-table row — e.g. a Plot's Bookings, Receipts, Society Bills, Site Visits, Tasks and Reminder Logs.
* "This <doctype> links to": the documents this record's own Link fields point at (Customer, Plot, Sales Invoice …).

Only business modules are scanned, framework tables (Version, Comment, File …) are skipped, and every group respects
read permission. Each group keeps the latest 50 rows plus a total count."""

import frappe
from frappe import _

from mm_core import connections as base

LIMIT = base.LIMIT
MODULES = ("Sugarcane", "EagleEye Survey", "Cane Indenting", "Vehicle Tracking", "Cane Procurement", "Weighbridge",
		   "Depot Purchase", "Cane Accounting", "Grower Loans", "Cane Costing", "Sugar Production", "Cane Laboratory",
		   "SMS Integration", "Sugar MIS", "Accounts", "Selling", "Buying", "Stock", "Manufacturing", "Projects", "Assets", "HR",
		   "Payroll", "Contacts", "Setup", "Support", "Maintenance")
SKIP = {"Version", "Comment", "File", "Activity Log", "Access Log", "Communication", "DocShare", "Deleted Document", "Error Log",
		"Notification Log", "Email Queue", "ToDo", "Tag Link", "Route History", "View Log", "Energy Point Log", "Document Follow",
		"Repost Item Valuation", "Repost Payment Ledger", "Transaction Deletion Record", "Bulk Transaction Log Detail",
		"Accounting Dimension", "Company", "Account", "Cost Center", "Warehouse", "Price List", "UOM", "Currency", "Country", "Territory",
		"Customer Group", "Supplier Group", "Item Group", "Mode of Payment", "Payment Ledger Entry", "GL Entry", "Stock Ledger Entry",
		"Party Account", "Selling Settings", "Buying Settings", "Surveyor Location Log"}
DATE_FIELDS = ("survey_date", "attendance_date", "posting_date", "transaction_date", "booking_date", "billing_month", "visit_date", "schedule_date", "due_date",
			   "exp_end_date", "start_date", "from_date", "date", "creation")
TITLE_FIELDS = ("grower_name", "village_name", "circle_name", "customer_name", "supplier_name", "title", "subject", "plot", "lead_name", "project_name", "item_name", "full_name",
				"feature_name", "document_type", "reminder_type", "description")


def _business(dt: str) -> bool:
	if dt in SKIP:
		return False
	m = frappe.get_meta(dt)
	return not (m.istable or m.issingle or getattr(m, "is_virtual", 0)) and m.module in MODULES


def _select(dt: str, alias: str = "p") -> tuple[str, str]:
	m = frappe.get_meta(dt)
	status = f"{alias}.status" if m.has_field("status") else (
		f"case {alias}.docstatus when 0 then 'Draft' when 1 then 'Submitted' else 'Cancelled' end" if m.is_submittable else "null")
	date = next((f for f in DATE_FIELDS if f == "creation" or m.has_field(f)), "creation")
	title = next((f for f in TITLE_FIELDS if m.has_field(f)), None)
	detail = f"{alias}.`{title}`" if title else "null"
	return (f"select distinct {alias}.name, {status} status, date({alias}.`{date}`) date, {detail} detail from `tab{dt}` {alias}",
			"and p.docstatus < 2" if m.is_submittable else "")


def _link_fields(target: str):
	"""(parent doctype, fieldname, via child doctype | None) for every Link field pointing at `target`."""
	rows = frappe.db.sql("""select parent, fieldname from `tabDocField` where fieldtype='Link' and options=%(t)s
		union select dt parent, fieldname from `tabCustom Field` where fieldtype='Link' and options=%(t)s""", {"t": target}, as_dict=True)
	out = []
	for r in rows:
		if not frappe.db.exists("DocType", r.parent):
			continue
		if frappe.get_meta(r.parent).istable:
			parents = frappe.db.sql_list("""select parent from `tabDocField` where fieldtype in ('Table', 'Table MultiSelect') and options=%s
				union select dt from `tabCustom Field` where fieldtype in ('Table', 'Table MultiSelect') and options=%s""", (r.parent, r.parent))
			out += [(p, r.fieldname, r.parent) for p in parents if frappe.db.exists("DocType", p) and _business(p)]
		elif _business(r.parent):
			out.append((r.parent, r.fieldname, None))
	return out


def _dynamic_fields(target: str):
	"""(doctype, link field, doctype field) for Dynamic Links that can point at `target` (e.g. RE Reminder Log, Task)."""
	rows = frappe.db.sql("""select parent, fieldname, options from `tabDocField` where fieldtype='Dynamic Link'
		union select dt, fieldname, options from `tabCustom Field` where fieldtype='Dynamic Link'""", as_dict=True)
	return [(r.parent, r.fieldname, r.options) for r in rows if r.options and frappe.db.exists("DocType", r.parent) and _business(r.parent)]


def _auto_groups(doctype: str, name: str, have: set[str]):
	groups, label_in, label_out = [], _("Linked to this {0}").format(_(doctype)), _("This {0} links to").format(_(doctype))
	by_dt: dict[str, list[str]] = {}
	for dt, field, child in _link_fields(doctype):
		if dt == doctype and not child:
			cond = f"p.`{field}` = %(n)s and p.name != %(n)s"
		elif child:
			cond = f"p.name in (select parent from `tab{child}` where parenttype = {frappe.db.escape(dt)} and `{field}` = %(n)s)"
		else:
			cond = f"p.`{field}` = %(n)s"
		by_dt.setdefault(dt, []).append(cond)
	for dt, field, dt_field in _dynamic_fields(doctype):
		if frappe.get_meta(dt).has_field(dt_field):
			by_dt.setdefault(dt, []).append(f"(p.`{dt_field}` = {frappe.db.escape(doctype)} and p.`{field}` = %(n)s)")
	for dt, conds in sorted(by_dt.items()):
		if dt in have:
			continue
		select, ds = _select(dt)
		groups.append((label_in, dt, f"{select} where ({' or '.join(conds)}) {ds} order by date desc", {}))
	# outgoing: this record's own Link fields
	doc = frappe.get_doc(doctype, name)
	targets: dict[str, set[str]] = {}
	for df in frappe.get_meta(doctype).get_link_fields():
		v = doc.get(df.fieldname)
		if v and df.options != doctype and frappe.db.exists("DocType", df.options) and df.options not in SKIP and df.fieldname != "amended_from":
			targets.setdefault(df.options, set()).add(v)
	for dt, names in sorted(targets.items()):
		if dt in have or dt in by_dt:
			continue
		select, _ds = _select(dt)
		groups.append((label_out, dt, f"{select} where p.name in %(names_{frappe.scrub(dt)})s order by date desc", {f"names_{frappe.scrub(dt)}": list(names)}))
	return groups


@frappe.whitelist()
def get_connections(doctype, name):
	out = base.get_connections(doctype, name)
	have = {g["doctype"] for g in out}
	for group, dt, sql, extra in _auto_groups(doctype, name, have):
		if not frappe.has_permission(dt, "read"):
			continue
		try:
			total = frappe.db.sql(f"select count(*) from ({sql}) x", {"n": name, **extra})[0][0]
			rows = frappe.db.sql(f"select * from ({sql}) x limit {LIMIT}", {"n": name, **extra}, as_dict=True) if total else []
		except Exception:
			frappe.log_error(title=f"Connections {doctype} → {dt}")
			continue
		out.append({"group": group, "doctype": dt, "label": _(dt), "count": int(total),
					"rows": [{k: (str(v) if v is not None and k == "date" else v) for k, v in r.items()} for r in rows]})
	return out
