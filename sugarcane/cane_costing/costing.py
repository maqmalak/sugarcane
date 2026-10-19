# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Process costing with by-product credit, from the books (the arithmetic is sugarcane.calc.costing).

For a period (a month, or the season to its close):
- cane price      the cane consumed by production at its stock value (Daily Production Entries → Manufacture entries)
- cane other      the mill's own cane costs in the Cane Cost of Sales ledgers: subsidies, its road cess share, depot freight
                  and commission, transit shortage, loading / unloading (govt-rate value is excluded: it is in stock)
- processing      expense GL of the Production, Service and Cane Procurement cost centres, by element (stock issues by the
                  item's group, depreciation entries, the rest by account), service centres allocated by the Cost
                  Allocation Rules; plus the period's share of the Off-season pool; packing from the Manufacture entries
- by-products     the NRV credited on the Manufacture entries (sale rate − selling cost, By-product Rate)
Postings (Costing Run submit): the sugar in the godown on the last day revalued to the full cost per bag (Stock
Reconciliation against Cost of Production Absorbed; later issues and sales repost); at season close, the by-product
variance (realised − NRV credited on what was sold) moved from the sales ledgers to By-product Variance.
"""
from collections import defaultdict

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate

from sugarcane.calc import costing as calc

STOCK_PURPOSES = ("Material Issue", "Material Consumption for Manufacture")


def _settings():
	return frappe.get_cached_doc("Sugar Settings")


def _children(doctype, name) -> list[str]:
	lft, rgt = frappe.db.get_value(doctype, name, ["lft", "rgt"]) or (0, 0)
	return frappe.get_all(doctype, filters={"lft": [">=", lft], "rgt": ["<=", rgt]}, pluck="name") if lft else []


def costed_cost_centers(company) -> tuple[set, set]:
	"""(cost centres whose expense is a cost of production, the off-season centre)."""
	abbr = frappe.get_cached_value("Company", company, "abbr")
	out = set()
	for g in ("Production", "Service", "Cane Procurement"):
		if frappe.db.exists("Cost Center", f"{g} - {abbr}"):
			out |= set(_children("Cost Center", f"{g} - {abbr}"))
	off = _settings().get("off_season_cost_center")
	return out - {off}, ({off} if off else set())


def production(start, end) -> dict:
	"""What the period's Daily Production Entries put into stock: cane consumed, packing, by-products, bags, cane crushed."""
	s = _settings()
	entries = frappe.get_all("Daily Production Entry", filters={"docstatus": 1, "crushing_day": ["between", [start, end]]},
		fields=["name", "season", "crushing_day", "cane_crushed_kg", "bags_produced", "cane_cost", "packing_cost", "by_product_value",
			"sugar_value", "provisional_cost_per_bag", "stock_entry"], limit=0)
	ses = set(frappe.get_all("Production Grade Line", filters={"parent": ["in", [e.name for e in entries] or [""]]}, pluck="stock_entry"))
	ses |= {e.stock_entry for e in entries if e.stock_entry}
	ses.discard(None)
	byp = defaultdict(lambda: [0.0, 0.0])  # item -> [kg, value]
	packing = cane = 0.0
	if ses:
		for r in frappe.db.sql("""select item_code, sum(qty) qty, sum(amount) amount, max(s_warehouse is not null and s_warehouse != '') out_
				from `tabStock Entry Detail` where parent in %s group by item_code, (s_warehouse is not null and s_warehouse != '')""",
				(list(ses),), as_dict=True):
			if r.item_code in (s.molasses_item, s.bagasse_item, s.press_mud_item) and not r.out_:
				byp[r.item_code][0] += flt(r.qty)
				byp[r.item_code][1] += flt(r.amount)
			elif r.item_code == s.packing_item and r.out_:
				packing += flt(r.amount)
			elif r.item_code == s.cane_item and r.out_:
				cane += flt(r.amount)
	bags = sum(cint(e.bags_produced) for e in entries)
	prov = sum(flt(e.provisional_cost_per_bag) * cint(e.bags_produced) for e in entries)
	bag_kg = flt(frappe.db.get_value("Crushing Season", entries[0].season, "bag_weight_kg")) if entries else 50
	return frappe._dict(entries=len(entries), cane_kg=sum(cint(e.cane_crushed_kg) for e in entries), bags=bags, bag_kg=bag_kg or 50,
		cane_value=cane, packing=packing, by_products=dict(byp), provisional_per_bag=round(prov / bags, 2) if bags else 0)


def cane_other(company, start, end) -> float:
	abbr = frappe.get_cached_value("Company", company, "abbr")
	group = f"Cane Cost of Sales - {abbr}"
	if not frappe.db.exists("Account", group):
		return 0.0
	accounts = [a for a in _children("Account", group) if a != group and a != _settings().get("cane_purchase_govt_account")]
	if not accounts:
		return 0.0
	return flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` where is_cancelled = 0 and company = %s and posting_date between %s and %s
		and account in %s""", (company, start, end, accounts))[0][0])


def processing(company, start, end) -> tuple[dict, dict, float, float]:
	"""({(element, cost centre): amount}, {cost centre: amount}, off-season amount in the period, expense outside production)."""
	s = _settings()
	costed, off = costed_cost_centers(company)
	abbr = frappe.get_cached_value("Company", company, "abbr")
	group = f"Cane Cost of Sales - {abbr}"
	skip = set(_children("Account", group)) if frappe.db.exists("Account", group) else set()
	skip |= {a for a in (s.get("cost_absorbed_account"),) if a}
	stock_adj = frappe.get_cached_value("Company", company, "stock_adjustment_account")
	rows = frappe.db.sql("""select g.account, a.account_name, g.cost_center, g.voucher_type, g.voucher_no, sum(g.debit - g.credit) amount,
		count(*) n, je.voucher_type je_type from `tabGL Entry` g join `tabAccount` a on a.name = g.account
		left join `tabJournal Entry` je on g.voucher_type = 'Journal Entry' and je.name = g.voucher_no
		where g.is_cancelled = 0 and g.company = %s and g.posting_date between %s and %s and a.root_type = 'Expense'
		and g.voucher_type not in ('Delivery Note', 'Sales Invoice', 'Stock Reconciliation', 'Period Closing Voucher')
		group by g.account, a.account_name, g.cost_center, g.voucher_type, g.voucher_no, je.voucher_type""", (company, start, end), as_dict=True)
	by, by_cc, off_amt, outside = defaultdict(float), defaultdict(float), 0.0, 0.0
	stock_vouchers = set()
	for r in rows:
		if r.voucher_type == "Stock Entry":
			stock_vouchers.add(r.voucher_no)
			continue  # taken item by item below (store issues, bagasse to the boilers), whatever account they were booked to
		if r.account in skip or r.account == stock_adj:
			continue
		if r.cost_center in off:
			off_amt += flt(r.amount)
			continue
		if r.cost_center not in costed:
			outside += flt(r.amount)
			continue
		el = calc.classify(r.account_name, r.je_type or r.voucher_type)
		by[(el, r.cost_center)] += flt(r.amount)
		by_cc[r.cost_center] += flt(r.amount)
	if stock_vouchers:
		for r in frappe.db.sql("""select d.item_code, d.amount, d.cost_center, d.expense_account, ig.parent_item_group grp, d.item_group
				from `tabStock Entry Detail` d join `tabStock Entry` se on se.name = d.parent left join `tabItem Group` ig on ig.name = d.item_group
				where d.parent in %s and se.purpose in %s and ifnull(d.s_warehouse, '') != '' and ifnull(d.t_warehouse, '') = ''""",
				(list(stock_vouchers), STOCK_PURPOSES), as_dict=True):
			cc = r.cost_center
			if cc in off:
				off_amt += flt(r.amount)
				continue
			if cc not in costed:
				outside += flt(r.amount)
				continue
			el = "Power and fuel" if r.expense_account == s.get("power_steam_account") or r.item_code == s.bagasse_item else calc.classify(
				frappe.get_cached_value("Account", r.expense_account, "account_name") if r.expense_account else "", "Stock Entry", r.grp or r.item_group)
			by[(el, cc)] += flt(r.amount)
			by_cc[cc] += flt(r.amount)
	return dict(by), dict(by_cc), off_amt, outside


def allocation_rules(company) -> list:
	out = []
	for name in frappe.get_all("Cost Allocation Rule", filters={"is_active": 1, "company": ["in", [company, "", None]]}, pluck="name"):
		r = frappe.get_cached_doc("Cost Allocation Rule", name)
		out.append({"service": r.service_cost_center, "basis": r.basis,
			"targets": [{"cost_center": t.cost_center, "pct": flt(t.pct), "hours": flt(t.hours)} for t in r.targets]})
	return out


def off_season_pool(company, season) -> tuple[float, float]:
	"""(the off-season pool for this season: off-season cost centre postings since the previous season ended, season tons basis)."""
	off = _settings().get("off_season_cost_center")
	sea = frappe.db.get_value("Crushing Season", season, ["start_date", "end_date", "crushing_target_maund"], as_dict=True)
	if not (off and sea):
		return 0.0, 0.0
	prev = frappe.db.get_value("Crushing Season", {"end_date": ["<", sea.start_date], "company": company}, "end_date", order_by="end_date desc")
	since = add_days(prev, 1) if prev else add_days(sea.start_date, -365)
	pool = flt(frappe.db.sql("""select sum(debit - credit) from `tabGL Entry` g join `tabAccount` a on a.name = g.account where g.is_cancelled = 0
		and g.company = %s and g.cost_center = %s and a.root_type = 'Expense' and g.posting_date between %s and %s""",
		(company, off, since, sea.end_date))[0][0])
	tons = flt(sea.crushing_target_maund) * 40 / 1000
	return pool, tons


PROCESSES = [  # process -> its cost centres (the design's production departments)
	("Cane yard and handling", ("Cane Yard", "Cane")),
	("Milling (Mill House)", ("Mill House",)),
	("Clarification and boiling", ("Process House", "Boiling House")),
	("Centrifugal and packing", ("Centrifugal and Packing",)),
	("Steam and power", ("Boiler House", "Power House")),
	("Laboratory", ("Laboratory",)),
]


def process_sheet(company, by_cc: dict, packing, tons, bags) -> list[dict]:
	"""Processing cost by process (after the service departments are allocated in); packing material goes to its process."""
	abbr = frappe.get_cached_value("Company", company, "abbr")
	total = sum(by_cc.values()) + flt(packing)
	rows, seen = [], set()
	for name, ccs in PROCESSES:
		names = [f"{c} - {abbr}" for c in ccs]
		seen |= set(names)
		amt = sum(flt(by_cc.get(n)) for n in names) + (flt(packing) if "Centrifugal and Packing" in ccs else 0)
		if amt:
			rows.append({"process_name": name, "cost_centers": ", ".join(ccs), "amount": calc.r2(amt)})
	other = sum(v for k, v in by_cc.items() if k not in seen)
	if abs(other) >= 0.005:
		rows.append({"process_name": "Other cost centres", "cost_centers": ", ".join(sorted(k.rsplit(" - ", 1)[0] for k in by_cc if k not in seen)),
			"amount": calc.r2(other)})
	for r in rows:
		r["per_ton_cane"] = round(r["amount"] / tons, 2) if tons else 0
		r["per_bag"] = round(r["amount"] / bags, 2) if bags else 0
		r["share_pct"] = round(100 * r["amount"] / total, 2) if total else 0
	return rows


def compute(company, start, end, season=None, season_close=False, exclude_run=None, margin_pct=None, gst_pct=None, standalone=False) -> dict:
	"""standalone: a statement for any period, not a run — its off-season share ignores what the runs already took."""
	start, end = getdate(start), getdate(end)
	s = _settings()
	p = production(start, end)
	other = cane_other(company, start, end)
	by, by_cc, off_in_period, outside = processing(company, start, end)
	rules = allocation_rules(company)
	details, elements = [], defaultdict(float)
	by_element = defaultdict(dict)
	for (el, cc), amt in by.items():
		by_element[el][cc] = by_element[el].get(cc, 0) + amt
	allocated_cc = defaultdict(float)
	for el, ccs in by_element.items():
		after, moves = calc.allocate(ccs, rules)
		moved_in = defaultdict(dict)
		for m in moves:
			moved_in[m["to"]][m["from"]] = moved_in[m["to"]].get(m["from"], 0) + m["amount"]
		for cc, amt in after.items():
			own = amt - sum(moved_in[cc].values())
			if abs(own) >= 0.005:
				details.append({"element": el, "cost_center": cc, "allocated_from": None, "amount": calc.r2(own)})
			for src, a in moved_in[cc].items():
				details.append({"element": el, "cost_center": cc, "allocated_from": src, "amount": calc.r2(a)})
			allocated_cc[cc] += amt
			elements[el] += amt
	pool, season_tons = off_season_pool(company, season) if season else (0.0, 0.0)
	spread_before = 0.0
	if season and not standalone:
		f = {"season": season, "docstatus": 1, "company": company}
		if exclude_run:
			f["name"] = ["!=", exclude_run]
		spread_before = flt(sum(flt(x) for x in frappe.get_all("Costing Run", filters=f, pluck="off_season_spread")))
	spread = calc.off_season_share(pool, p.cane_kg / 1000, season_tons, spread_before, season_close)
	rates = {}
	for item in p.by_products:
		br = frappe.db.get_value("By-product Rate", {"item": item, "season": season, "is_active": 1}, ["rate_per_ton", "selling_cost_per_ton"],
			as_dict=True, order_by="valid_from desc") if season else None
		rates[item] = br
	bps = []
	for item, (kg, value) in p.by_products.items():
		tons = kg / 1000
		sell = flt(rates[item].selling_cost_per_ton) * tons if rates.get(item) else 0.0
		bps.append(calc.ByProduct(item, round(tons, 3), round((value + sell) / tons, 2) if tons else 0, sell))
	st = calc.Statement(cane_price=p.cane_value, cane_other=other, elements=dict(elements), packing=p.packing, off_season=spread,
		by_products=bps, sugar_kg=p.bags * p.bag_kg, cane_tons=round(p.cane_kg / 1000, 3), bag_kg=p.bag_kg)
	out = st.as_dict()
	tons = st.cane_tons or 1
	for d in details:
		d["per_ton_cane"] = round(d["amount"] / tons, 2)
	credit = {item: b.credit for item, b in zip(p.by_products, bps)}
	out.update({"from_date": str(start), "to_date": str(end), "entries": p.entries, "bags": p.bags, "details": details,
		"by_cost_center": {k: calc.r2(v) for k, v in allocated_cc.items()}, "off_season_pool": calc.r2(pool),
		"off_season_in_period": calc.r2(off_in_period), "outside_production": calc.r2(outside),
		"molasses_credit": credit.get(s.molasses_item, 0), "bagasse_credit": credit.get(s.bagasse_item, 0),
		"press_mud_credit": credit.get(s.press_mud_item, 0), "provisional_per_bag": p.provisional_per_bag})
	abbr = frappe.get_cached_value("Company", company, "abbr")
	production_ccs = set(_children("Cost Center", f"Production - {abbr}")) if frappe.db.exists("Cost Center", f"Production - {abbr}") else None
	out["structure"] = calc.structure(st.cane_cost, p.packing, details, spread, production_ccs)
	out["processes"] = process_sheet(company, allocated_cc, p.packing, st.cane_tons, p.bags)
	out["price"] = calc.price_build(st.per_bag, flt(s.get("profit_margin_pct")) if margin_pct is None else margin_pct,
		(flt(s.get("sugar_gst_pct")) or 18) if gst_pct is None else gst_pct)
	return out


# ---------------------------------------------------------------- postings
def revalue_sugar(run) -> tuple[str | None, float]:
	"""Stock Reconciliation on the period's last day: every sugar grade in the godown at the full cost per bag. The difference
	goes to Cost of Production Absorbed; issues and sales after that day are reposted at the new rate."""
	from sugarcane.stock import stock_qty

	s = _settings()
	if not (flt(run.cost_per_bag) and s.get("cost_absorbed_account")):
		return None, 0.0
	items = frappe.get_all("Sugar Grade", filters={"is_active": 1}, pluck="item") or [s.sugar_item]
	rows = []
	for item in dict.fromkeys(items):
		qty = stock_qty(item, s.sugar_warehouse, run.to_date)
		if qty > 0:
			rows.append({"item_code": item, "warehouse": s.sugar_warehouse, "qty": qty, "valuation_rate": flt(run.cost_per_bag)})
	if not rows:
		return None, 0.0
	abbr = frappe.get_cached_value("Company", run.company, "abbr")
	sr = frappe.get_doc({"doctype": "Stock Reconciliation", "purpose": "Stock Reconciliation", "company": run.company, "posting_date": run.to_date,
		"posting_time": "23:59:58", "set_posting_time": 1, "expense_account": s.cost_absorbed_account,
		"cost_center": f"Centrifugal and Packing - {abbr}" if frappe.db.exists("Cost Center", f"Centrifugal and Packing - {abbr}") else s.cost_center,
		"items": rows})
	sr.flags.ignore_permissions = True
	sr.insert()
	sr.submit()
	_repost_now(sr.name)
	value = flt(frappe.db.sql("""select sum(stock_value_difference) from `tabStock Ledger Entry` where voucher_type = 'Stock Reconciliation'
		and voucher_no = %s and is_cancelled = 0""", sr.name)[0][0])
	return sr.name, value


def _repost_now(voucher_no):
	"""Run the reposting ERPNext queued for a back-dated entry at once (the scheduler would do it within the hour)."""
	try:
		from erpnext.stock.doctype.repost_item_valuation.repost_item_valuation import repost
	except ImportError:
		return
	for name in frappe.get_all("Repost Item Valuation", filters={"voucher_no": voucher_no, "status": ["in", ["Queued", "In Progress"]],
			"docstatus": 1}, pluck="name"):
		repost(frappe.get_doc("Repost Item Valuation", name))


def by_product_variance(company, season, end) -> list[dict]:
	"""Per by-product sold in the season: NRV credited on what was sold (its stock value out) vs the sales value less selling cost."""
	s = _settings()
	sea = frappe.db.get_value("Crushing Season", season, ["start_date"], as_dict=True)
	out = []
	for item in (s.molasses_item, s.bagasse_item, s.press_mud_item):
		if not item:
			continue
		sold = frappe.db.sql("""select sum(-actual_qty) qty, sum(-stock_value_difference) nrv from `tabStock Ledger Entry` where is_cancelled = 0
			and item_code = %s and voucher_type = 'Delivery Note' and posting_date between %s and %s""", (item, sea.start_date, end), as_dict=True)[0]
		inv = frappe.db.sql("""select i.income_account, sum(i.base_net_amount) amount from `tabSales Invoice Item` i join `tabSales Invoice` si
			on si.name = i.parent where si.docstatus = 1 and si.company = %s and i.item_code = %s and si.posting_date between %s and %s
			group by i.income_account""", (company, item, sea.start_date, end), as_dict=True)
		if not flt(sold.qty) and not inv:
			continue
		br = frappe.db.get_value("By-product Rate", {"item": item, "season": season, "is_active": 1}, "selling_cost_per_ton", order_by="valid_from desc")
		selling = flt(br) * flt(sold.qty) / 1000
		sales = sum(flt(r.amount) for r in inv)
		out.append({"item": item, "qty_kg": flt(sold.qty), "nrv": calc.r2(sold.nrv), "sales": calc.r2(sales), "selling_cost": calc.r2(selling),
			"realised": calc.r2(sales - selling), "variance": calc.r2(sales - selling - flt(sold.nrv)), "income_accounts": inv})
	return out


def post_variance(run) -> tuple[str | None, float]:
	"""Season close: each by-product's realisation variance moved from its sales ledger to By-product Variance."""
	s = _settings()
	acc = s.get("by_product_variance_account")
	rows = by_product_variance(run.company, run.season, run.to_date)
	lines, total = [], 0.0
	cc = frappe.get_cached_value("Company", run.company, "cost_center")
	for r in rows:
		v = r["variance"]
		if abs(v) < 0.01 or not r["income_accounts"]:
			continue
		income = max(r["income_accounts"], key=lambda x: flt(x.amount)).income_account
		if v > 0:  # realised more than credited: take it out of sales into the variance ledger
			lines += [{"account": income, "debit_in_account_currency": v, "cost_center": cc}, {"account": acc, "credit_in_account_currency": v, "cost_center": cc}]
		else:
			lines += [{"account": acc, "debit_in_account_currency": -v, "cost_center": cc}, {"account": income, "credit_in_account_currency": -v, "cost_center": cc}]
		total += v
	if not (lines and acc):
		return None, calc.r2(total)
	je = frappe.get_doc({"doctype": "Journal Entry", "company": run.company, "posting_date": run.to_date, "voucher_type": "Journal Entry",
		"user_remark": _("By-product variance, season {0} ({1})").format(run.season, run.name), "accounts": lines})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	return je.name, calc.r2(total)
