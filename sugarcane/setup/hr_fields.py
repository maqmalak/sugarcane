"""Custom fields the React HR pages (ported from Baogee Textile / MicroMax ERP) read and write: Urdu names, department
code and level, designation abbreviation, basic salary, and the branch location. Field names keep the mm_ prefix of those
apps so the pages work unchanged. Applied on install and on every migrate (idempotent)."""

from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

FIELDS = {
	"Branch": [
		{"fieldname": "location_section", "label": "Location", "fieldtype": "Section Break", "insert_after": "branch", "module": "Sugarcane"},
		{"fieldname": "branch_address", "label": "Address", "fieldtype": "Small Text", "insert_after": "location_section", "module": "Sugarcane"},
		{"fieldname": "city", "label": "City", "fieldtype": "Data", "insert_after": "branch_address", "in_list_view": 1, "module": "Sugarcane"},
		{"fieldname": "location_column", "fieldtype": "Column Break", "insert_after": "city", "module": "Sugarcane"},
		{"fieldname": "latitude", "label": "Latitude", "fieldtype": "Float", "insert_after": "location_column", "precision": "6", "module": "Sugarcane"},
		{"fieldname": "longitude", "label": "Longitude", "fieldtype": "Float", "insert_after": "latitude", "precision": "6", "module": "Sugarcane"},
	],
	"Department": [
		{"fieldname": "mm_code", "label": "Code", "fieldtype": "Data", "insert_after": "mm_urdu_name", "module": "Sugarcane"},
		{"fieldname": "mm_level", "label": "Level", "fieldtype": "Select", "options": "\nDivision\nDepartment\nSub Department", "insert_after": "mm_code", "description": "Division → Department → Sub Department; employees sit in a Sub Department.", "module": "Sugarcane"},
		{"fieldname": "mm_urdu_name", "label": "Department Name (Urdu)", "fieldtype": "Data", "insert_after": "department_name", "in_standard_filter": 1, "module": "Sugarcane"},
	],
	"Designation": [
		{"fieldname": "mm_abbr", "label": "Abbreviation", "fieldtype": "Data", "insert_after": "mm_urdu_name", "module": "Sugarcane"},
		{"fieldname": "mm_urdu_name", "label": "Designation (Urdu)", "fieldtype": "Data", "insert_after": "designation_name", "module": "Sugarcane"},
	],
	"Employee": [
		{"fieldname": "mm_urdu_name", "label": "Full Name (Urdu)", "fieldtype": "Data", "insert_after": "employee_name", "module": "Sugarcane"},
		{"fieldname": "mm_basic_salary", "label": "Basic Salary", "fieldtype": "Currency", "insert_after": "ctc", "module": "Sugarcane"},
	],
}


def ensure():
	create_custom_fields(FIELDS, ignore_validate=True, update=True)
