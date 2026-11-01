# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.naming import getseries

from sugarcane.calc.identity import GROWER_SERIAL_LEN, FormatError, grower_id_prefix, normalize_iban
from sugarcane.setup.banks import bank_from_iban
from sugarcane.utils import clean_cnic, clean_mobile, settings


class Grower(Document):
	def autoname(self):
		"""<circle code>-<village code>-<serial in village>, e.g. 001-001-0001. The serial comes from the Series
		table keyed on the prefix, so it is per village and safe under concurrent inserts."""
		circle_code, village_code = self._codes()
		prefix = grower_id_prefix(circle_code, village_code)
		serial = int(getseries(prefix, GROWER_SERIAL_LEN))
		if serial >= 10**GROWER_SERIAL_LEN:
			frappe.throw(_("Village {0} already has the maximum number of growers").format(self.village))
		self.grower_serial = serial
		self.name = f"{prefix}{serial:0{GROWER_SERIAL_LEN}d}"

	def _codes(self):
		circle_code = frappe.db.get_value("Cane Circle", self.circle, "circle_code")
		village = frappe.db.get_value("Cane Village", self.village, ["circle", "village_code"], as_dict=True)
		if not circle_code or not village:
			frappe.throw(_("Select a valid circle and village"))
		return circle_code, village.village_code

	def validate(self):
		self.cnic = clean_cnic(self.cnic)
		self.grower_name = (self.grower_name or "").strip()
		# Old records keep whatever was imported until someone edits the number.
		if self.mobile and (self.is_new() or self.has_value_changed("mobile")):
			self.mobile = clean_mobile(self.mobile)
		if self.village and self.circle:
			village_circle = frappe.db.get_value("Cane Village", self.village, "circle")
			if village_circle != self.circle:
				frappe.throw(_("Village {0} is in circle {1}, not {2}").format(
					frappe.bold(self.village), frappe.bold(village_circle), frappe.bold(self.circle)))
		if self.iban:
			try:
				self.iban = normalize_iban(self.iban)
			except FormatError as e:
				frappe.throw(_("Bank IBAN: {0}").format(str(e)))
			from_iban = bank_from_iban(self.iban)
			if from_iban and not self.bank_name:
				self.bank_name = from_iban
			elif from_iban and from_iban != self.bank_name:
				frappe.msgprint(_("The IBAN looks like a {0} account, but the bank is set to {1}. Please check.").format(
					frappe.bold(from_iban), frappe.bold(self.bank_name)), indicator="orange", alert=True)
		self.set_payable_account()

	def set_payable_account(self):
		"""ERPNext finds the ledger of a custom party type only through its Party Account rows, so every grower
		always has one row per company (from Sugar Settings → Grower Payable)."""
		s = settings()
		if not (s.company and s.grower_payable_account):
			return
		if not any(row.company == s.company for row in self.accounts):
			self.append("accounts", {"company": s.company, "account": s.grower_payable_account})

	def on_update(self):
		if self.flags.skip_bank_account:
			return
		sync_bank_account(self)


def sync_bank_account(grower):
	"""Keeps one ERPNext Bank Account (party_type Grower) in step with the grower's bank fields; the bank scroll
	export reads it."""
	if not (grower.bank_name and (grower.account_no or grower.iban)):
		return
	if not frappe.db.exists("Bank", grower.bank_name):
		frappe.get_doc({"doctype": "Bank", "bank_name": grower.bank_name}).insert(ignore_permissions=True)
	values = {
		# ERPNext names Bank Accounts "<account name> - <bank>"; the grower ID keeps namesakes at one bank apart
		"account_name": f"{grower.name} {grower.account_title or grower.grower_name}"[:140],
		"bank": grower.bank_name,
		"bank_account_no": grower.account_no,
		"iban": grower.iban,
		"branch_code": grower.branch_code,
		"party_type": "Grower",
		"party": grower.name,
		"is_default": 1,
	}
	name = grower.bank_account if grower.bank_account and frappe.db.exists("Bank Account", grower.bank_account) else None
	if name:
		account = frappe.get_doc("Bank Account", name)
		changed = any((account.get(k) or None) != (v or None) for k, v in values.items() if k != "account_name")
		if not changed:
			return
		account.update(values)
		account.save(ignore_permissions=True)
	else:
		account = frappe.get_doc({"doctype": "Bank Account", **values}).insert(ignore_permissions=True)
		grower.db_set("bank_account", account.name, update_modified=False)
