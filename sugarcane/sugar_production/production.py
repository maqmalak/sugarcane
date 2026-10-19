"""Daily Production Entry (§5): from the approved DMR, a Work Order for the bags made against the season's bag BOM and a
Stock Entry (Manufacture) that consumes the cane actually crushed (not the BOM standard) and the packing bags, receives the
sugar into the godown and the by-products at their NRV; the sugar carries what is left of the cost. The day's cane purchase
invoice must exist first (the cane has to be in stock)."""

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate

PROD_ROLES = {"System Manager", "Cane Admin", "Production Manager"}


def fill(doc):
	dmr = frappe.db.get_value("Daily Manufacturing Report", {"crushing_day": getdate(doc.crushing_day), "docstatus": 1},
		["name", "cane_crushed_kg", "sugar_bags", "recovery_pct", "molasses_kg", "bagasse_kg", "press_mud_kg", "season"], as_dict=True)
	if not dmr:
		frappe.throw(_("Approve the Daily Manufacturing Report of {0} first").format(frappe.utils.formatdate(doc.crushing_day)),
			title=_("DMR not approved"))
	doc.dmr, doc.season = dmr.name, dmr.season
	doc.company = doc.company or frappe.db.get_single_value("Sugar Settings", "company")
	doc.update({"cane_crushed_kg": dmr.cane_crushed_kg, "bags_produced": dmr.sugar_bags, "recovery_pct": dmr.recovery_pct,
		"molasses_kg": dmr.molasses_kg, "bagasse_kg": dmr.bagasse_kg, "press_mud_kg": dmr.press_mud_kg})
	doc.daily_purchase = frappe.db.get_value("Daily Cane Purchase", {"crushing_day": getdate(doc.crushing_day), "docstatus": 1}, "name")
	doc.set("grades", [])  # filled on submit


def check(doc):
	"""Before submit (nothing written yet): the role, the closed cane day and the stock the entry will consume."""
	from sugarcane.stock import stock_qty

	if not PROD_ROLES & set(frappe.get_roles()):
		frappe.throw(_("Only the Production Manager posts production"), frappe.PermissionError)
	if not doc.daily_purchase:
		frappe.throw(_("Close crushing day {0} first: the cane is put into stock by its daily purchase invoice").format(
			frappe.utils.formatdate(doc.crushing_day)), title=_("Day not closed"))
	if cint(doc.bags_produced) <= 0 or cint(doc.cane_crushed_kg) <= 0:
		frappe.throw(_("No bags or no cane on the DMR"))
	s = frappe.get_cached_doc("Sugar Settings")
	day = getdate(doc.crushing_day)
	for item, wh, need, label in ((s.cane_item, s.cane_yard_warehouse, cint(doc.cane_crushed_kg), _("cane in the yard")),
			(s.packing_item, s.packing_warehouse, cint(doc.bags_produced), _("packing bags"))):
		have = stock_qty(item, wh, day)
		if have + 0.001 < need:
			frappe.throw(_("Not enough {0}: {1} on the books, {2} needed").format(label, f"{have:,.0f}", f"{need:,}"), title=_("Stock"))


def _lines(doc) -> list[frappe._dict]:
	"""The day's bags by grade (from the DMR), the cane shared out by bags; the largest grade carries the by-products."""
	from sugarcane.sugar_production.doctype.sugar_grade.sugar_grade import default_grade

	rows = frappe.get_all("DMR Grade Output", filters={"parent": doc.dmr, "parenttype": "Daily Manufacturing Report", "bags": [">", 0]},
		fields=["grade", "item", "bags"], order_by="idx asc")
	if not rows:
		d = default_grade()
		rows = [frappe._dict(grade=d.name, item=d.item, bags=cint(doc.bags_produced))]
	total, cane, used = sum(cint(r.bags) for r in rows), cint(doc.cane_crushed_kg), 0
	for i, r in enumerate(rows):
		r.cane_kg = cane - used if i == len(rows) - 1 else int(cane * cint(r.bags) / total)
		used += r.cane_kg
	big = max(range(len(rows)), key=lambda i: cint(rows[i].bags))
	for i, r in enumerate(rows):
		r.by_products = i == big
	return rows


def _manufacture(doc, line, actual, day):
	"""Work Order + Stock Entry (Manufacture) for one grade."""
	from erpnext.manufacturing.doctype.work_order.work_order import make_stock_entry

	from sugarcane.setup.production import ensure_bom

	s = frappe.get_cached_doc("Sugar Settings")
	bom = ensure_bom(doc.season, line.item)
	wo = frappe.get_doc({"doctype": "Work Order", "production_item": line.item, "bom_no": bom, "qty": cint(line.bags),
		"company": doc.company, "fg_warehouse": s.sugar_warehouse, "source_warehouse": s.cane_yard_warehouse, "skip_transfer": 1,
		"wip_warehouse": s.cane_yard_warehouse, "scrap_warehouse": s.byproduct_warehouse, "planned_start_date": f"{day} 07:00:00",
		"use_multi_level_bom": 0, "description": _("Crushing day {0} · grade {1}").format(frappe.utils.formatdate(day), line.grade or "—")})
	wo.flags.ignore_permissions = True
	wo.insert()
	for it in wo.required_items:  # the BOM's source warehouses (yard for cane, packing store for bags)
		it.source_warehouse = s.cane_yard_warehouse if it.item_code == s.cane_item else s.packing_warehouse
	wo.save()
	wo.submit()
	se = frappe.get_doc(make_stock_entry(wo.name, "Manufacture", cint(line.bags)))
	se.posting_date, se.posting_time, se.set_posting_time = day, "23:59:00", 1
	rows, seen = [], set()
	for it in se.items:
		if it.item_code == s.cane_item and it.s_warehouse:
			it.qty = it.transfer_qty = cint(line.cane_kg)  # the cane actually crushed, not the BOM standard
			it.s_warehouse = s.cane_yard_warehouse
		elif it.item_code == s.packing_item and it.s_warehouse:
			it.s_warehouse = s.packing_warehouse
		elif it.item_code in actual:  # by-products: the DMR actuals at their NRV, on the largest grade only
			seen.add(it.item_code)
			qty, rate = actual[it.item_code]
			if not (qty and line.by_products):
				continue
			it.qty = it.transfer_qty = qty
			it.t_warehouse, it.basic_rate, it.set_basic_rate_manually = s.byproduct_warehouse, rate, 1
			it.valuation_type = "Manual"
		rows.append(it)
	se.items = rows
	if line.by_products:
		for code, (qty, rate) in actual.items():
			if qty and code not in seen:
				se.append("items", {"item_code": code, "qty": qty, "transfer_qty": qty, "uom": "Kg", "stock_uom": "Kg", "conversion_factor": 1,
					"t_warehouse": s.byproduct_warehouse, "secondary_item_type": "By-Product", "valuation_type": "Manual", "basic_rate": rate,
					"set_basic_rate_manually": 1})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	se.reload()
	fg = next((i for i in se.items if i.item_code == line.item and i.t_warehouse), None)
	return frappe._dict(bom=bom, work_order=wo.name, stock_entry=se.name, sugar_value=flt(fg.amount) if fg else 0,
		cane=sum(flt(i.amount) for i in se.items if i.item_code == s.cane_item and i.s_warehouse),
		packing=sum(flt(i.amount) for i in se.items if i.item_code == s.packing_item and i.s_warehouse),
		by_products=sum(flt(i.amount) for i in se.items if i.item_code in actual and i.t_warehouse))


def _bagasse_to_boilers(doc, day, kg):
	"""The bagasse burnt in the mill's own boilers leaves the by-products store, charged to Power & Steam at the Boiler House."""
	s = frappe.get_cached_doc("Sugar Settings")
	if not (kg and s.get("power_steam_account")):
		return None
	se = frappe.get_doc({"doctype": "Stock Entry", "stock_entry_type": "Material Issue", "purpose": "Material Issue", "company": doc.company,
		"posting_date": day, "posting_time": "23:59:30", "set_posting_time": 1,
		"remarks": _("Bagasse burnt in the boilers, crushing day {0}").format(frappe.utils.formatdate(day)),
		"items": [{"item_code": s.bagasse_item, "qty": kg, "uom": "Kg", "stock_uom": "Kg", "conversion_factor": 1, "s_warehouse": s.byproduct_warehouse,
			"expense_account": s.power_steam_account, "cost_center": s.get("boiler_house_cost_center") or s.cost_center}]})
	se.flags.ignore_permissions = True
	se.insert()
	se.submit()
	return se.name


def provisional(doc, sugar_value, packing):
	"""Daily provisional full cost: stock cost + the mill's own cane costs (subsidies, its cess share) for the cane crushed +
	the season's budgeted processing cost per ton of cane. The Costing Run replaces it with actuals."""
	sea = frappe.db.get_value("Crushing Season", doc.season, ["subsidy_rate", "additional_subsidy_rate", "govt_rate", "road_cess_pct",
		"grower_cess_share_pct", "budget_processing_per_ton"], as_dict=True) or frappe._dict()
	maund = cint(doc.cane_crushed_kg) / (flt(frappe.db.get_single_value("Sugar Settings", "maund_kg")) or 40)
	mill_cess = flt(sea.govt_rate) * flt(sea.road_cess_pct) / 100 * (1 - flt(sea.grower_cess_share_pct) / 100)
	other = round(maund * (flt(sea.subsidy_rate) + flt(sea.additional_subsidy_rate) + mill_cess), 2)
	processing = round(cint(doc.cane_crushed_kg) / 1000 * flt(sea.budget_processing_per_ton), 2)
	bags = cint(doc.bags_produced)
	return {"packing_cost": round(packing, 2), "cane_other_cost": other, "provisional_processing": processing,
		"provisional_cost_per_bag": round((sugar_value + other + processing) / bags, 2) if bags else 0}


def post(doc):
	"""Called on submit, after check(): a Work Order + Manufacture per grade; burnt bagasse to the boilers; provisional cost."""
	from sugarcane.cane_costing.rates import rate

	s = frappe.get_cached_doc("Sugar Settings")
	day = getdate(doc.crushing_day)
	dmr = frappe.db.get_value("Daily Manufacturing Report", doc.dmr, ["bagasse_burnt_kg", "bagasse_kg"], as_dict=True) or frappe._dict()
	burnt = min(cint(dmr.bagasse_burnt_kg), cint(doc.bagasse_kg))
	credit_internal = cint(s.get("credit_internal_bagasse")) if s.get("credit_internal_bagasse") is not None else 1
	bagasse_in = cint(doc.bagasse_kg) if credit_internal else max(cint(doc.bagasse_kg) - burnt, 0)
	actual = {code: (qty, rate(code, day, doc.season).nrv_per_kg) for code, qty in ((s.molasses_item, cint(doc.molasses_kg)),
		(s.bagasse_item, bagasse_in), (s.press_mud_item, cint(doc.press_mud_kg)))}
	lines = _lines(doc)
	out = []
	for line in lines:
		r = _manufacture(doc, line, actual, day)
		out.append((line, r))
	issue = _bagasse_to_boilers(doc, day, burnt) if credit_internal else None
	for line, r in out:
		row = doc.append("grades", {"grade": line.grade, "item": line.item, "bags": cint(line.bags), "cane_kg": cint(line.cane_kg),
			"work_order": r.work_order, "stock_entry": r.stock_entry, "sugar_value": r.sugar_value,
			"cost_per_bag": round(r.sugar_value / cint(line.bags), 2) if cint(line.bags) else 0})
		row.db_insert()
	main = max(out, key=lambda x: cint(x[0].bags))[1]
	sugar = sum(r.sugar_value for _l, r in out)
	packing = sum(r.packing for _l, r in out)
	doc.db_set({"work_order": main.work_order, "stock_entry": main.stock_entry, "bom": main.bom, "status": "Posted",
		"cane_cost": sum(r.cane for _l, r in out), "by_product_value": sum(r.by_products for _l, r in out), "sugar_value": sugar,
		"cost_per_bag": round(sugar / cint(doc.bags_produced), 2) if cint(doc.bags_produced) else 0, "bagasse_burnt_kg": burnt,
		"bagasse_issue": issue, **provisional(doc, sugar, packing)})


def unpost(doc):
	refs = [("Stock Entry", doc.get("bagasse_issue"))]
	for g in reversed(doc.get("grades") or []):
		refs += [("Stock Entry", g.stock_entry), ("Work Order", g.work_order)]
	if not doc.get("grades"):
		refs += [("Stock Entry", doc.stock_entry), ("Work Order", doc.work_order)]
	for dt, name in refs:
		if name and frappe.db.get_value(dt, name, "docstatus") == 1:
			v = frappe.get_doc(dt, name)
			v.flags.ignore_permissions = True
			v.flags.ignore_links = True
			v.cancel()
	doc.db_set("status", "Cancelled")
