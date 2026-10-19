"""Run every queued Repost Item Valuation now, oldest first (a development bench runs no worker)."""
import time

import frappe


def cancel_runs(season="2025-26"):
	for name in frappe.get_all("Costing Run", filters={"season": season, "docstatus": 1}, pluck="name", order_by="to_date desc"):
		d = frappe.get_doc("Costing Run", name)
		d.cancel()
		frappe.db.commit()
		print("cancelled", name, flush=True)


def run():
	from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost

	names = frappe.get_all("Repost Item Valuation", filters={"status": ["in", ["Queued", "In Progress"]], "docstatus": 1},
		pluck="name", order_by="posting_date asc, posting_time asc, creation asc")
	t = time.time()
	for i, n in enumerate(names, 1):
		repost(frappe.get_doc("Repost Item Valuation", n))
		frappe.db.commit()
		if i % 50 == 0 or i == len(names):
			print(f"{i}/{len(names)} {time.time() - t:.0f}s", flush=True)
	left = frappe.db.count("Repost Item Valuation", {"status": ["in", ["Queued", "In Progress"]], "docstatus": 1})
	print("left", left, "failed", frappe.db.count("Repost Item Valuation", {"status": "Failed"}))


def until_done(max_passes=20):
	for i in range(max_passes):
		left = frappe.db.count("Repost Item Valuation", {"status": ["in", ["Queued", "In Progress"]], "docstatus": 1})
		print("pass", i + 1, "left", left, flush=True)
		if not left:
			return
		run()
