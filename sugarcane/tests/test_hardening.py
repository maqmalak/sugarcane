"""Phase 9: indexes in place, the health check (guest vs System Manager), the endpoints open to guests (each one known,
token-protected or harmless, and rate-limited where it takes input), the role manuals and their access rule."""

import ast
import os

import frappe
from frappe.tests import IntegrationTestCase

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# every guest endpoint, and why it may be open
GUEST = {
	"api/v1/app.py:boot": "who is signed in (nothing for a guest)",
	"api/v1/spa.py:boot": "the shell's boot (nothing for a guest)",
	"api/v1/survey.py:login": "field-app sign-in with password + device (rate-limited)",
	"api/v1/sms.py:inbound": "SMS gateway callback (shared token, rate-limited)",
	"mill_hr/hr.py:punch": "biometric clocks (shared token, rate-limited)",
	"api/v1/health.py:status": "uptime monitor: ok / not ok only (rate-limited)",
}
TAKES_INPUT = {"api/v1/survey.py:login", "api/v1/sms.py:inbound", "mill_hr/hr.py:punch", "api/v1/health.py:status"}


def _guest_endpoints():
	"""(file:function, decorators) for every @frappe.whitelist(allow_guest=True) in the app."""
	found = {}
	for root, _dirs, files in os.walk(APP):
		if "/tests" in root or "node_modules" in root:
			continue
		for f in files:
			if not f.endswith(".py"):
				continue
			path = os.path.join(root, f)
			tree = ast.parse(open(path, encoding="utf-8").read())
			for node in ast.walk(tree):
				if not isinstance(node, ast.FunctionDef):
					continue
				names = [ast.unparse(d) for d in node.decorator_list]
				if any("whitelist" in n and "allow_guest=True" in n for n in names):
					found[f"{os.path.relpath(path, APP)}:{node.name}"] = names
	return found


class TestHardening(IntegrationTestCase):
	def test_indexes(self):
		from sugarcane.setup import indexes

		indexes.ensure()
		self.assertEqual(indexes.missing(), [])
		self.assertTrue(frappe.db.has_index("tabCane Purchase Receipt", indexes.index_name(["season", "posting_date"])))
		self.assertTrue(frappe.db.has_index("tabCane Token", indexes.index_name(["crushing_day", "status"])))
		self.assertEqual(indexes.ensure(), 0)  # idempotent

	def test_guest_endpoints_are_known_and_limited(self):
		found = _guest_endpoints()
		self.assertEqual(set(found), set(GUEST), "a new guest endpoint must be reviewed and listed here")
		for ep in TAKES_INPUT:
			self.assertTrue(any("rate_limit" in d for d in found[ep]), f"{ep} must be rate-limited")

	def test_health_check(self):
		from sugarcane.api.v1 import health

		frappe.set_user("Guest")
		try:
			out = health.status()
			self.assertEqual(set(out), {"ok"})
		finally:
			frappe.set_user("Administrator")
		out = health.status()
		names = {c["check"] for c in out["checks"]}
		self.assertTrue({"database", "redis cache", "scheduler", "backup", "disk", "weighbridge agents"} <= names)
		db = next(c for c in out["checks"] if c["check"] == "database")
		self.assertTrue(db["ok"])
		self.assertTrue(all(c["level"] in ("ok", "warn", "fail") for c in out["checks"]))

	def test_manuals_by_role(self):
		from sugarcane.api.v1 import help as hlp

		everything = {m["slug"] for m in hlp.manuals()}  # Administrator sees all
		self.assertTrue({"getting-started", "surveyor", "weighbridge", "cane-accountant", "management"} <= everything)
		page = hlp.manual("weighbridge")
		self.assertIn("<h1", page["html"])
		user = "test.p9.weighman@micromaxsugar.example"
		if not frappe.db.exists("User", user):
			u = frappe.get_doc({"doctype": "User", "email": user, "first_name": "P9 Weighman", "send_welcome_email": 0})
			u.insert()
			u.add_roles("Gross Weighman")
		frappe.set_user(user)
		try:
			mine = {m["slug"] for m in hlp.manuals()}
			self.assertIn("weighbridge", mine)
			self.assertIn("getting-started", mine)
			self.assertNotIn("cane-accountant", mine)
			with self.assertRaises(frappe.PermissionError):
				hlp.manual("cane-accountant")
			with self.assertRaises(frappe.DoesNotExistError):
				hlp.manual("../hooks")
		finally:
			frappe.set_user("Administrator")
