# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import re

from frappe.model.document import Document

from sugarcane.utils import clean_cnic


def normalize_registration(value: str) -> str:
	"""'lhr 1234' / 'LHR-1234' → 'LHR-1234'."""
	text = re.sub(r"[\s_]+", "-", (value or "").strip().upper())
	return re.sub(r"-{2,}", "-", text)


class SugarVehicle(Document):
	def autoname(self):
		self.registration_no = normalize_registration(self.registration_no)
		self.name = self.registration_no

	def validate(self):
		self.registration_no = normalize_registration(self.registration_no)
		self.driver_cnic = clean_cnic(self.driver_cnic, "Driver CNIC", required=False)
		self.vehicle_owner_cnic = clean_cnic(self.vehicle_owner_cnic, "Owner CNIC", required=False)
