"""Sugarcane roles. Also exported as fixtures; created here too so DocPerms and User Permissions work before
fixtures load on a fresh install."""

import frappe

ROLES = {
	"Cane Manager": "Head of cane: all cane masters and documents",
	"Cane Admin": "Posts and cancels CPRs; manages terminals and settings",
	"Circle Officer": "Growers, passbooks and surveys in their circle(s)",
	"Surveyor": "Crop surveys (EagleEye app)",
	"Indent Clerk": "Generates and prints indents",
	"Token Clerk": "Issues cane tokens",
	"Gross Weighman": "First (gross) weight",
	"Tare Weighman": "Second (tare) weight",
	"Yard Supervisor": "Gate passes and yard positions",
	"Cane Cashier": "Pays TPT bilties at the mill cash counter",
	"Lab Chemist": "Hourly lab samples and the daily manufacturing report",
	"Production Manager": "Daily production entries",
	"Cane Accountant": "Payment scrolls, road cess deposits, grower ledgers",
	"Depot User": "Depot weighments and bills",
	"LP Operator": "Registers loaded vehicles at loading points and depots (ELP app)",
	"ELP Auditor": "Independent audit team: compares loading-point and gate photos, accepts or rejects the load",
	"MIS Viewer": "Read-only dashboards and reports",
}


def ensure_roles():
	for role, description in ROLES.items():
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 1, "description": description}).insert(
				ignore_permissions=True)
