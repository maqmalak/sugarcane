# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 9: security settings for the production site — run once at go-live (not on the demo site):

    bench --site erp… execute sugarcane.setup.hardening.apply
    bench --site erp… execute sugarcane.setup.hardening.report      # what is set now, and what is not

Strong passwords, lock-out after failed logins, a working-day session, two-factor sign-in for the roles that can
move money or override weights, and no demo records."""
import frappe

SETTINGS = {  # System Settings field -> production value
	"enable_password_policy": 1,
	"minimum_password_score": 3,          # zxcvbn score 0–4
	"allow_consecutive_login_attempts": 5,
	"allow_login_after_fail": 900,        # seconds locked out
	"session_expiry": "12:00",            # a working day; sign in again after
	"enable_two_factor_auth": 1,
	"two_factor_method": "OTP App",
	"lifespan_qrcode_image": 240,
	"login_with_email_link": 0,
	"disable_user_pass_login": 0,
}
TWO_FACTOR_ROLES = ("System Manager", "Cane Admin", "Cane Manager", "Accounts Manager", "Cane Accountant", "HR Manager")


def report() -> dict:
	s = frappe.get_single("System Settings")
	rows = {k: {"now": s.get(k), "production": v, "ok": str(s.get(k)) == str(v)} for k, v in SETTINGS.items() if s.meta.has_field(k)}
	roles = {r: frappe.db.get_value("Role", r, "two_factor_auth") for r in TWO_FACTOR_ROLES if frappe.db.exists("Role", r)}
	demo = sum(frappe.db.count(dt, {"is_demo": 1}) for dt in ("Grower", "Cane Purchase Receipt", "Cane Survey") if frappe.db.table_exists(dt))
	out = {"settings": rows, "two_factor_roles": roles, "demo_records": demo, "developer_mode": frappe.conf.get("developer_mode"),
		"allow_tests": frappe.conf.get("allow_tests")}
	for k, v in rows.items():
		print(f"{'ok ' if v['ok'] else 'SET'} {k}: {v['now']} (production {v['production']})")
	print("two-factor roles:", roles)
	print("demo records:", demo, "· developer_mode:", out["developer_mode"], "· allow_tests:", out["allow_tests"])
	return out


def apply() -> dict:
	if frappe.db.exists("Grower", {"is_demo": 1}):
		frappe.throw("This site holds demo data. Hardening is for the production site; run sc-reset-demo elsewhere, not here.")
	s = frappe.get_single("System Settings")
	for k, v in SETTINGS.items():
		if s.meta.has_field(k):
			s.set(k, v)
	s.flags.ignore_permissions = True
	s.save()
	for r in TWO_FACTOR_ROLES:
		if frappe.db.exists("Role", r):
			frappe.db.set_value("Role", r, "two_factor_auth", 1)
	for key in ("developer_mode", "allow_tests"):
		if frappe.conf.get(key):
			print(f"site_config: set {key} to 0 for production (bench --site … set-config {key} 0)")
	frappe.db.commit()
	return report()
