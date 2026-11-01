"""Pakistani banks for the Grower's Bank pick-list (ERPNext "Bank" records), with the 4-letter bank code that sits in
characters 5-8 of a Pakistani IBAN (PKkk BBBB …), so the bank can be filled in from the IBAN."""

import frappe

# Bank name (as shown in the list) → IBAN bank code. The first seven keep the names already used by cheques and demo data.
PK_BANKS = {
	"HBL": "HABB",
	"MCB Bank": "MUCB",
	"UBL": "UNIL",
	"Allied Bank": "ABPA",
	"National Bank of Pakistan": "NBPA",
	"Meezan Bank": "MEZN",
	"Bank Alfalah": "ALFH",
	"Askari Bank": "ASCM",
	"Bank Al Habib": "BAHL",
	"Faysal Bank": "FAYS",
	"Habib Metropolitan Bank": "MPBL",
	"Standard Chartered Bank": "SCBL",
	"BankIslami": "BKIP",
	"Dubai Islamic Bank": "DUIB",
	"JS Bank": "JSBL",
	"Soneri Bank": "SONE",
	"The Bank of Punjab": "BPUN",
	"The Bank of Khyber": "KHYB",
	"Sindh Bank": "SIND",
	"Al Baraka Bank": "AIIN",
	"MCB Islamic Bank": "MCIB",
	"Silkbank": "SAUD",
	"First Women Bank": "FWOM",
	"Zarai Taraqiati Bank (ZTBL)": "ZTBL",
	"Telenor Microfinance Bank (Easypaisa)": "TMFB",
	"Mobilink Microfinance Bank (JazzCash)": "JCMA",
}
BY_CODE = {code: name for name, code in PK_BANKS.items()}


def ensure():
	"""Create any missing bank (never renames or deletes, so banks added by hand stay)."""
	for name in PK_BANKS:
		if not frappe.db.exists("Bank", name):
			frappe.get_doc({"doctype": "Bank", "bank_name": name}).insert(ignore_permissions=True)


def bank_from_iban(iban: str | None) -> str | None:
	"""The bank a Pakistani IBAN belongs to, if its code is one we know and the Bank record exists."""
	if not iban or not iban.upper().startswith("PK") or len(iban) < 8:
		return None
	name = BY_CODE.get(iban[4:8].upper())
	return name if name and frappe.db.exists("Bank", name) else None


def match_bank(value: str | None) -> str | None:
	"""Bank record for a typed name (exact, then case-insensitive); None when there is no such bank."""
	value = (value or "").strip()
	if not value:
		return None
	if frappe.db.exists("Bank", value):
		return value
	hit = frappe.db.sql("select name from tabBank where lower(name) = lower(%s) limit 1", value)
	return hit[0][0] if hit else None
