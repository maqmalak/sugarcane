"""Endpoints the shared React shell (forked from the real-estate / MicroMax frontend) expects: session boot, DocType
definitions for the generated list / form pages, and quick-entry fields for a Link field's "+"."""

import frappe
from frappe import _

from sugarcane.api.v1.app import boot as app_boot

SKIP_TYPES = {"HTML", "Button", "Image", "Fold", "Heading", "Geolocation", "Table MultiSelect", "Signature", "Barcode"}
FIELD_KEYS = ("fieldname", "fieldtype", "label", "options", "reqd", "read_only", "hidden", "depends_on", "mandatory_depends_on",
	"fetch_from", "fetch_if_empty", "default", "precision", "description", "in_list_view", "in_standard_filter", "bold",
	"collapsible", "columns")
QUICK_DENY = {"User", "Company", "Account", "Role", "Role Profile", "DocType", "Module Def", "Currency", "Fiscal Year",
	"Cost Center", "Warehouse", "Workflow State", "Print Format", "Letter Head", "Grower"}
QUICK_EXTRA = {"Supplier": ("supplier_group",), "Cane Village": ("village_code", "circle"), "Cane Sector": ("sector_code", "circle")}
QUICK_DEFAULTS: dict[str, dict] = {}
QUICK_TYPES = {"Data", "Link", "Select", "Int", "Float", "Currency", "Percent", "Date", "Check", "Small Text", "Text", "Phone",
	"Dynamic Link"}


@frappe.whitelist(allow_guest=True, methods=["GET"])
def boot() -> dict:
	"""The sugar app's boot (user, roles, CSRF, company, season) in the shape the shared shell reads."""
	b = app_boot()
	if b.get("user"):
		b.setdefault("default_project", None)
		b["mock_mode"] = False
	return b


def _fields(meta):
	out = []
	for df in meta.fields:
		if df.fieldtype in SKIP_TYPES:
			continue
		row = {k: df.get(k) for k in FIELD_KEYS if df.get(k) not in (None, "", 0)}
		row["fieldname"], row["fieldtype"] = df.fieldname, df.fieldtype
		out.append(row)
	return out


@frappe.whitelist(methods=["GET"])
def form_meta(doctype: str) -> dict:
	"""DocType definition shaped for the React generic list / form (custom fields included)."""
	if not frappe.has_permission(doctype, "read"):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	meta = frappe.get_meta(doctype)
	children = {df.fieldname: {"doctype": df.options, "fields": _fields(frappe.get_meta(df.options))} for df in meta.get_table_fields()}
	return {
		"doctype": doctype, "issingle": meta.issingle, "is_submittable": meta.is_submittable, "title_field": meta.title_field,
		"search_fields": [f.strip() for f in (meta.search_fields or "").split(",") if f.strip()], "sort_field": meta.sort_field,
		"sort_order": meta.sort_order, "fields": _fields(meta), "children": children, "module": meta.module,
		"can_create": frappe.has_permission(doctype, "create"),
		"has_geo": any(df.fieldtype == "Geolocation" for df in meta.fields),
	}


@frappe.whitelist(methods=["GET"])
def quick_entry_meta(doctype: str) -> dict:
	"""Fields for an inline "New <doctype>" dialog from a Link field's "+": the required and quick-entry fields, or
	`eligible: false` with the reason when inline creation makes no sense."""
	meta = frappe.get_meta(doctype)
	reason = None
	if doctype in QUICK_DENY:
		reason = "create on its own page"
	elif not frappe.has_permission(doctype, "create"):
		reason = "no permission"
	elif meta.is_submittable or meta.issingle or meta.istable or meta.is_virtual:
		reason = "not a master"
	elif any(df.reqd for df in meta.get_table_fields()):
		reason = "needs child rows"
	name_field = (meta.autoname or "").split(":", 1)[1] if (meta.autoname or "").startswith("field:") else None
	fields = []
	for df in meta.fields:
		if df.fieldtype not in QUICK_TYPES or df.hidden or df.read_only:
			continue
		if not (df.reqd or df.allow_in_quick_entry or df.fieldname == name_field or df.fieldname == meta.title_field
				or df.fieldname in QUICK_EXTRA.get(doctype, ())):
			continue
		row = {k: df.get(k) for k in FIELD_KEYS if df.get(k) not in (None, "", 0)}
		row["fieldname"], row["fieldtype"] = df.fieldname, df.fieldtype
		if df.fieldname in QUICK_DEFAULTS.get(doctype, {}):
			row["default"] = QUICK_DEFAULTS[doctype][df.fieldname]
		fields.append(row)
	first = name_field or meta.title_field
	fields.sort(key=lambda f: 0 if f["fieldname"] == first else 1)
	if not fields and not reason:
		reason = "no quick-entry fields"
	return {"doctype": doctype, "eligible": reason is None, "reason": reason, "label": _(doctype), "fields": fields[:12]}
