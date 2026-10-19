# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt, getdate

ROLES = {"System Manager", "Cane Admin", "Cost Accountant"}


class CostingRun(Document):
	def validate(self):
		from sugarcane.cane_costing.costing import compute

		self.company = self.company or frappe.db.get_single_value("Sugar Settings", "company")
		if getdate(self.from_date) > getdate(self.to_date):
			frappe.throw(_("From must be before To"))
		if self.season:
			sea = frappe.db.get_value("Crushing Season", self.season, ["start_date", "end_date"], as_dict=True)
			if self.run_type == "Season Close" and getdate(self.to_date) < getdate(sea.end_date):
				frappe.throw(_("A season-close run ends on the season's last day ({0})").format(sea.end_date))
		st = frappe.get_cached_doc("Sugar Settings")
		if self.profit_margin_pct is None or (self.is_new() and not flt(self.profit_margin_pct)):
			self.profit_margin_pct = flt(st.get("profit_margin_pct"))
		if not flt(self.gst_pct):
			self.gst_pct = flt(st.get("sugar_gst_pct")) or 18
		r = compute(self.company, self.from_date, self.to_date, self.season, self.run_type == "Season Close", exclude_run=self.name,
			margin_pct=flt(self.profit_margin_pct), gst_pct=flt(self.gst_pct))
		sx, pr = r["structure"], r["price"]
		self.update({"direct_material": sx["direct_material"], "direct_labour": sx["direct_labour"], "prime_cost": sx["prime_cost"],
			"factory_overhead": sx["factory_overhead"], "cost_of_production": sx["cost_of_production"],
			"foh_per_bag": round(sx["factory_overhead"] / r["bags"], 2) if r["bags"] else 0,
			"cost_before_tax": pr["cost_before_tax"], "profit_per_bag": pr["profit"], "price_before_gst": pr["price_before_gst"],
			"gst_per_bag": pr["gst"], "price_after_gst": pr["price_after_gst"], "cost_after_gst": pr["cost_after_gst"]})
		self.set("processes", r["processes"])
		self.update({"cane_tons": r["cane_tons"], "sugar_bags": r["bags"], "sugar_kg": r["sugar_kg"], "recovery_pct": r["recovery_pct"],
			"production_entries": r["entries"], "cane_price": r["cane_price"], "cane_other": r["cane_other"], "cane_cost": r["cane_cost"],
			"processing_cost": round(sum(r["elements"].values()), 2), "packing_cost": r["packing"], "off_season_pool": r["off_season_pool"],
			"off_season_spread": r["off_season"], "joint_cost": r["joint"], "molasses_credit": r["molasses_credit"], "bagasse_credit": r["bagasse_credit"],
			"press_mud_credit": r["press_mud_credit"], "by_product_credit": r["credit"], "net_cost": r["net"], "cost_per_kg": round(r["per_kg"], 4),
			"cost_per_bag": r["per_bag"], "cost_per_ton_cane": r["per_ton_cane"], "cane_share_pct": r["cane_share_pct"],
			"provisional_cost_per_bag": r["provisional_per_bag"],
			"variance_per_bag": round(r["per_bag"] - r["provisional_per_bag"], 2) if r["provisional_per_bag"] else 0})
		self.set("details", sorted(r["details"], key=lambda d: (d["element"], d["cost_center"], d["allocated_from"] or "")))
		if self.docstatus == 0:
			self.status = "Calculated"

	def before_submit(self):
		if not ROLES & set(frappe.get_roles()):
			frappe.throw(_("Only a Cost Accountant posts a costing run"), frappe.PermissionError)
		if not flt(self.sugar_bags):
			frappe.throw(_("No production was posted in this period"))
		clash = frappe.db.get_value("Costing Run", {"company": self.company, "docstatus": 1, "name": ["!=", self.name],
			"from_date": ["<=", self.to_date], "to_date": [">=", self.from_date], "run_type": self.run_type}, "name")
		if clash:
			frappe.throw(_("Costing run {0} already covers part of this period").format(clash))
		if self.capitalise and not frappe.db.get_single_value("Sugar Settings", "cost_absorbed_account"):
			frappe.throw(_("Set Sugar Settings → Cost of Production Absorbed Account first"))
		self.status = "Posted"

	def on_submit(self):
		from sugarcane.cane_costing.costing import post_variance, revalue_sugar

		if self.capitalise:
			sr, value = revalue_sugar(self)
			self.db_set({"stock_reconciliation": sr, "revaluation_amount": value})
		if self.run_type == "Season Close":
			je, v = post_variance(self)
			self.db_set({"variance_journal": je, "by_product_variance": v})

	def on_cancel(self):
		for dt, name in (("Journal Entry", self.variance_journal), ("Stock Reconciliation", self.stock_reconciliation)):
			if name and frappe.db.get_value(dt, name, "docstatus") == 1:
				d = frappe.get_doc(dt, name)
				d.flags.ignore_permissions = True
				d.cancel()
		self.db_set("status", "Cancelled")

	def before_cancel(self):
		self.ignore_linked_doctypes = ("Stock Reconciliation", "Journal Entry", "GL Entry", "Stock Ledger Entry", "Repost Item Valuation")
