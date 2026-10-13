# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

"""Bulk grower registration from Excel / CSV.

Each row is checked (CNIC format and uniqueness in the file and the database, circle / village codes, passbook
duplicates, IBAN checksum) and saved in its own savepoint, so one bad row never stops the rest. Rows that fail come
back as an Excel sheet with an "error" column; fix them there and import that sheet again.
"""

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import cint, cstr, flt

from sugarcane.calc.identity import FormatError, normalize_cnic, normalize_code

COLUMNS = (
	"grower_name", "father_name", "cnic", "mobile", "circle_code", "village_code", "passbook_no", "acres",
	"bank_name", "branch_name", "branch_code", "account_title", "account_no", "iban", "filer_status", "address",
)
REQUIRED = ("grower_name", "cnic", "circle_code", "village_code")
EXAMPLE = ("Muhammad Aslam", "Ghulam Rasool", "38403-1234567-1", "03001234567", "001", "001", "PB-0001", "4.5",
	"HBL", "Bhalwal", "0412", "Muhammad Aslam", "00427900123456", "", "Non-Filer", "Chak 12 NB")


class GrowerImport(Document):
	def validate(self):
		if self.is_new():
			self.status = "Draft"

	@frappe.whitelist()
	def start_import(self):
		self.check_permission("write")
		if self.status in ("Queued", "In Progress"):
			frappe.throw(_("This import is already running"))
		self.db_set({"status": "Queued", "log": "", "imported_rows": 0, "failed_rows": 0, "error_file": None})
		frappe.enqueue(run_import, queue="long", timeout=3600, import_name=self.name,
			now=frappe.flags.in_test, enqueue_after_commit=True)
		return self.status


def read_rows(file_url: str) -> list[dict]:
	file = frappe.get_doc("File", {"file_url": file_url})
	content = file.get_content()
	if file_url.lower().endswith((".xlsx", ".xlsm")):
		from frappe.utils.xlsxutils import read_xlsx_file_from_attached_file

		rows = read_xlsx_file_from_attached_file(fcontent=content)
	elif file_url.lower().endswith(".csv"):
		from frappe.utils.csvutils import read_csv_content

		rows = read_csv_content(content)
	else:
		frappe.throw(_("Upload an .xlsx or .csv file"))
	rows = [r for r in rows if any(cstr(c).strip() for c in r)]
	if not rows:
		return []
	header = [cstr(h).strip().lower().replace(" ", "_").replace(".", "") for h in rows[0]]
	missing = [c for c in REQUIRED if c not in header]
	if missing:
		frappe.throw(_("Missing columns: {0}. Download the template for the expected layout.").format(", ".join(missing)))
	return [{h: (cstr(v).strip() if v is not None else "") for h, v in zip(header, row, strict=False)} for row in rows[1:]]


def _commit():
	"""Commit progress in the background job; inside tests the test case owns the transaction."""
	if not frappe.flags.in_test:
		frappe.db.commit()


def run_import(import_name: str):
	doc = frappe.get_doc("Grower Import", import_name)
	doc.db_set("status", "In Progress")
	_commit()
	try:
		rows = read_rows(doc.import_file)
		ok, failed, log = _import_rows(doc, rows)
	except Exception:
		frappe.db.rollback()
		doc.db_set({"status": "Failed", "log": frappe.get_traceback()})
		_commit()
		return
	error_file = _error_sheet(doc, failed) if failed else None
	doc.db_set({
		"status": "Completed with Errors" if failed else "Completed",
		"total_rows": len(rows), "imported_rows": ok, "failed_rows": len(failed), "error_file": error_file,
		"log": "\n".join(log[-500:]),
	})
	_commit()
	frappe.publish_realtime("grower_import_done", {"name": doc.name}, user=doc.owner)


def _import_rows(doc, rows):
	circles = {r.circle_code: r.name for r in frappe.get_all("Cane Circle", fields=["name", "circle_code"])}
	seen_cnic, seen_pb = set(), set()
	ok, failed, log = 0, [], []
	for i, row in enumerate(rows, start=2):  # row 1 is the header
		try:
			values = _check(row, circles, seen_cnic, seen_pb)
		except (FormatError, frappe.ValidationError) as e:
			failed.append({**row, "error": cstr(e)})
			log.append(f"Row {i}: {e}")
			continue
		frappe.db.savepoint("grower_row")
		try:
			grower = frappe.get_doc({"doctype": "Grower", **values["grower"]})
			grower.flags.skip_bank_account = not cint(doc.create_bank_accounts)
			grower.insert()
			if values["passbook_no"] and doc.create_passbooks:
				holdings = [{"acres": values["acres"]}] if values["acres"] else []
				frappe.get_doc({"doctype": "Grower Passbook", "passbook_no": values["passbook_no"], "grower": grower.name,
					"land_holdings": holdings}).insert()
			ok += 1
			log.append(f"Row {i}: {grower.name} {grower.grower_name}")
		except Exception as e:
			frappe.db.rollback(save_point="grower_row")
			message = cstr(getattr(e, "message", None) or e) or e.__class__.__name__
			failed.append({**row, "error": frappe.utils.strip_html(message)})
			log.append(f"Row {i}: {message}")
		frappe.clear_messages()
		if ok and ok % 100 == 0:
			_commit()
	return ok, failed, log


def _check(row, circles, seen_cnic, seen_pb):
	for col in REQUIRED:
		if not row.get(col):
			raise FormatError(f"{col} is empty")
	cnic = normalize_cnic(row["cnic"])
	if cnic in seen_cnic:
		raise FormatError(f"CNIC {cnic} appears more than once in the file")
	if frappe.db.exists("Grower", {"cnic": cnic}):
		raise FormatError(f"CNIC {cnic} is already registered")
	circle_code = normalize_code(row["circle_code"], 3, "Circle code")
	village_code = normalize_code(row["village_code"], 3, "Village code")
	circle = circles.get(circle_code)
	if not circle:
		raise FormatError(f"No circle with code {circle_code}")
	village = f"{circle_code}-{village_code}"
	if not frappe.db.exists("Cane Village", village):
		raise FormatError(f"No village {village_code} in circle {circle_code}")
	passbook = cstr(row.get("passbook_no")).strip().upper()
	if passbook:
		if passbook in seen_pb:
			raise FormatError(f"Passbook {passbook} appears more than once in the file")
		if frappe.db.exists("Grower Passbook", passbook):
			raise FormatError(f"Passbook {passbook} already exists")
	filer = cstr(row.get("filer_status")).strip().title() or "Non-Filer"
	if filer not in ("Filer", "Non-Filer"):
		raise FormatError("filer_status must be Filer or Non-Filer")
	seen_cnic.add(cnic)
	if passbook:
		seen_pb.add(passbook)
	grower = {k: row.get(k) or None for k in ("grower_name", "father_name", "mobile", "bank_name", "branch_name",
		"branch_code", "account_title", "account_no", "iban", "address")}
	grower.update({"cnic": cnic, "circle": circle, "village": village, "filer_status": filer})
	return {"grower": grower, "passbook_no": passbook, "acres": flt(row.get("acres"))}


def _error_sheet(doc, failed):
	from frappe.utils.xlsxutils import make_xlsx

	header = [*COLUMNS, "error"]
	data = [header] + [[r.get(c, "") for c in header] for r in failed]
	xlsx = make_xlsx(data, "Rows with errors").getvalue()
	file = frappe.get_doc({"doctype": "File", "file_name": f"{doc.name}-errors.xlsx", "content": xlsx,
		"attached_to_doctype": doc.doctype, "attached_to_name": doc.name, "is_private": 1}).insert(ignore_permissions=True)
	return file.file_url


@frappe.whitelist()
def download_template():
	from frappe.utils.xlsxutils import make_xlsx

	frappe.only_for(("System Manager", "Cane Manager", "Cane Admin", "Circle Officer"))
	frappe.response["filename"] = "grower_import_template.xlsx"
	frappe.response["filecontent"] = make_xlsx([list(COLUMNS), list(EXAMPLE)], "Growers").getvalue()
	frappe.response["type"] = "binary"
