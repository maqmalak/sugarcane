import frappe, random, traceback
def run(steps="masters,purchase,stores,sales,assets,people,vouchers", commit=0):
	from sugarcane.setup import demo_erp as d
	company = frappe.db.get_single_value("Sugar Settings", "company")
	ab = d._abbr(company); rnd = random.Random(d.SEED)
	frappe.flags.mute_emails = True
	for s in steps.split(","):
		try:
			getattr(d, s)(company, ab, rnd) if s not in ("assets", "vouchers", "masters") else getattr(d, s)(company, ab)
			print("OK", s)
		except Exception:
			traceback.print_exc(limit=-6)
			frappe.db.rollback()
			return
	if int(commit):
		frappe.db.commit(); print("committed")
	else:
		frappe.db.rollback()
