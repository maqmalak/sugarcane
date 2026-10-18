"""Document vault (as in the real-estate app):

Generated documents  every bank letter, schedule, scroll and loan application that is printed is kept as a private PDF —
                     a new version each time — on a Sugar Generated Document, attached to its source record (scroll, loan,
                     grower), so the record's attachments show the full history.
Vault                papers that come from outside (CNIC copies, fard, guarantee deeds, bank advices, cess challans,
                     contracts, NOCs) uploaded with their expiry; a daily job marks them Expiring Soon / Expired and the
                     home page warns.
"""

import frappe
from frappe.utils import add_days, cint, getdate, now_datetime, nowdate


def store(document_type: str, reference_doctype: str | None, reference_name: str | None, fname: str, content: bytes,
		grower: str | None = None, bank: str | None = None, remarks: str | None = None) -> dict:
	from frappe.utils.file_manager import save_file

	version = frappe.db.count("Sugar Generated Document", {"document_type": document_type, "reference_name": reference_name or "",
		"bank": bank or ["is", "not set"]}) + 1
	base, _dot, ext = fname.rpartition(".")
	f = save_file(f"{base} v{version}.{ext or 'pdf'}", content, reference_doctype or "Sugar Generated Document", reference_name or "", is_private=1)
	doc = frappe.get_doc({"doctype": "Sugar Generated Document", "document_type": document_type, "reference_doctype": reference_doctype,
		"reference_name": reference_name, "version": version, "grower": grower, "bank": bank, "issued_on": now_datetime(),
		"issued_by": frappe.session.user, "file": f.file_url, "remarks": remarks})
	doc.insert(ignore_permissions=True)
	return {"name": doc.name, "version": version, "file_url": f.file_url}


def status_of(doc) -> str:
	if not doc.expiry_date:
		return "No Expiry"
	left = (getdate(doc.expiry_date) - getdate(nowdate())).days
	if left < 0:
		return "Expired"
	return "Expiring Soon" if left <= cint(doc.renewal_alert_days or 30) else "Valid"


def refresh_statuses():
	"""Daily: re-mark the vault's documents as their expiry comes closer."""
	for d in frappe.get_all("Sugar Vault Document", filters={"expiry_date": ["is", "set"]}, fields=["name", "expiry_date", "renewal_alert_days", "status"]):
		s = status_of(frappe._dict(d))
		if s != d.status:
			frappe.db.set_value("Sugar Vault Document", d.name, "status", s, update_modified=False)


def expiring(days: int = 30) -> int:
	return frappe.db.count("Sugar Vault Document", {"status": ["in", ["Expiring Soon", "Expired"]]})
