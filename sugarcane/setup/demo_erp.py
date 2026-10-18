# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Phase 7 demo: stores and purchase (demand → inquiry → three quotations → PO → GRN with quality inspection → bill with
withholding → bank payment), store issues and a returnable gate pass; sugar sales (dealers, an agent, contracts,
Delivery Orders weighed on the weighbridge, gate passes, GST invoices, a receipt, a truck still loading); fixed assets on
two books; 30 employees with shifts, attendance (late marks) and October payroll; draft vouchers to batch-post.
Everything is flagged through a `DEMO-P7` remark / name prefix so reset() can remove it."""
import random
from datetime import datetime, time, timedelta

import frappe
from frappe.utils import add_days, cint, flt, getdate

TAG = "DEMO-P7"
SEED = 7007

STORE_ITEMS = [  # code, name, group, uom, rate, warehouse, qi template
	("ST-BRG-6205", "Bearing 6205 ZZ", "Bearings", "Nos", 1450, "Mechanical Store", None),
	("ST-BRG-22320", "Spherical Roller Bearing 22320", "Bearings", "Nos", 68500, "Mechanical Store", None),
	("ST-CHN-MILL", "Cane Carrier Chain Link", "Gears and Chains", "Nos", 9200, "Mechanical Store", None),
	("ST-VLV-4IN", "Gate Valve 4 in", "Pumps and Valves", "Nos", 18500, "Mechanical Store", None),
	("ST-MTR-15KW", "Induction Motor 15 kW", "Motors", "Nos", 265000, "Electrical Store", None),
	("ST-CBL-4C16", "Copper Cable 4C x 16 mm", "Cables", "Meter", 1650, "Electrical Store", None),
	("CH-LIME", "Quick Lime", "Lime", "Kg", 42, "Chemical Store", "Quick Lime"),
	("CH-SULPHUR", "Sulphur (lumps)", "Sulphur", "Kg", 118, "Chemical Store", "Sulphur"),
	("CH-PHOS", "Phosphoric Acid 85%", "Phosphoric Acid", "Kg", 610, "Chemical Store", None),
	("CH-FLOC", "Flocculant (anionic)", "Flocculant", "Kg", 1350, "Chemical Store", None),
	("FL-DIESEL", "High Speed Diesel", "Diesel", "Litre", 272, "Fuel Store", "Diesel"),
	("FL-GREASE", "Lithium Grease EP2", "Grease", "Kg", 960, "Fuel Store", None),
	("TL-WELD", "Welding Electrodes E6013 (pkt)", "Welding", "Nos", 2400, "Tools Store", None),
	("TL-SPAN", "Spanner Set 6–32 mm", "Spanners", "Set", 8900, "Tools Store", None),
	("SF-HELMET", "Safety Helmet", "PPE", "Nos", 850, "Tools Store", None),
]
SUPPLIERS = [  # name, group, withholding, ntn
	("Al-Hamd Bearing House", "Mill Stores Vendor", "153(1)(a) Supply of Goods - Non-company", "3547812-6"),
	("Faisal Engineering Works", "Mill Stores Vendor", "153(1)(a) Supply of Goods - Company", "4120987-1"),
	("Punjab Chemicals (Pvt) Ltd", "Chemical Supplier", "153(1)(a) Supply of Goods - Company", "2289341-4"),
	("Lahore Lime Industries", "Chemical Supplier", "153(1)(a) Supply of Goods - Non-company", "1987654-2"),
	("Indus Sulphur Traders", "Chemical Supplier", "153(1)(a) Supply of Goods - Non-company", "3321456-9"),
	("Pak Electric Motors", "Mill Stores Vendor", "153(1)(a) Supply of Goods - Company", "0765432-8"),
	("Shell Fuel Station Sargodha Rd", "Mill Stores Vendor", "153(1)(a) Supply of Goods - Non-company", "4455667-3"),
	("Haq Rewinding Services", "Service Contractor", "153(1)(b) Services - Non-company", "5566778-1"),
]
CUSTOMERS = [  # name, group, territory, ntn/strn, registered
	("Madina Sugar Dealers", "Sugar Dealer", "Lahore Region", "1234567-8", 1),
	("Al-Rehman Trading Co.", "Sugar Dealer", "Faisalabad Region", "2345678-9", 1),
	("Multan Sugar Agency", "Sugar Dealer", "Multan Region", "3456789-0", 1),
	("Karachi Commodities (Pvt) Ltd", "Sugar Dealer", "Karachi Region", "4567890-1", 1),
	("Shezan Foods (Pvt) Ltd", "Industrial Buyer", "Lahore Region", "5678901-2", 1),
	("Ghulam Rasool Kiryana", "Sugar Dealer", "Sargodha Region", None, 0),
	("Chenab Distillery Ltd", "By-product Buyer", "Faisalabad Region", "6789012-3", 1),
]
FIRST = ("Muhammad", "Ahmad", "Ali", "Usman", "Bilal", "Hamza", "Imran", "Kashif", "Naveed", "Rashid", "Sajjad", "Tariq", "Waqas",
	"Zahid", "Asif", "Farhan", "Shahid", "Javed", "Nadeem", "Aamir", "Saima", "Rabia", "Nasreen", "Sobia")
LAST = ("Khan", "Iqbal", "Hussain", "Ahmed", "Butt", "Malik", "Chaudhry", "Sheikh", "Qureshi", "Rana", "Bhatti", "Gondal")
STAFF = [  # designation, department, base, count, shift, seasonal
	("Chief Engineer", "Workshop", 380000, 1, "General", 0), ("Shift Engineer", "Mill House", 165000, 3, None, 0),
	("Chief Chemist", "Laboratory", 290000, 1, "General", 0), ("Shift Chemist", "Process House", 120000, 3, None, 0),
	("Boiler Operator", "Boiler House", 62000, 3, None, 0), ("Mill Operator", "Mill House", 52000, 4, None, 1),
	("Pan Man", "Process House", 58000, 3, None, 1), ("Fitter", "Workshop", 48000, 3, "General", 0),
	("Electrician", "Power House", 50000, 2, "General", 0), ("Lab Assistant", "Laboratory", 42000, 2, None, 1),
	("Store Keeper", "Stores", 65000, 1, "General", 0), ("Weighbridge Operator", "Cane", 45000, 2, None, 1),
	("Accountant", "Accounts", 140000, 1, "General", 0), ("Security Guard", "Security", 38000, 1, None, 0),
]


def _ins(doc, submit=False):
	d = frappe.get_doc(doc)
	_cc(d)
	d.flags.ignore_permissions = True
	d.insert()
	if submit:
		d.submit()
	return d


def _cc(d):
	"""v16 wants a cost centre on purchase lines: the Stores one unless given."""
	company = d.get("company") or frappe.db.get_single_value("Sugar Settings", "company")
	cc = f"Stores - {_abbr(company)}"
	for row in d.get("items") or []:
		if row.meta.has_field("cost_center") and not row.get("cost_center"):
			row.cost_center = cc
	if d.meta.has_field("cost_center") and not d.get("cost_center") and d.doctype in ("Material Request", "Purchase Order", "Supplier Quotation"):
		d.cost_center = cc


def _abbr(company):
	return frappe.get_cached_value("Company", company, "abbr")


def run():
	company = frappe.db.get_single_value("Sugar Settings", "company")
	if not company or frappe.db.exists("Supplier", SUPPLIERS[0][0]):
		return
	from sugarcane.setup.erp_config import configure

	configure(company)
	rnd = random.Random(SEED)
	frappe.flags.mute_emails = True
	ab = _abbr(company)
	masters(company, ab)
	purchase(company, ab, rnd)
	stores(company, ab, rnd)
	sales(company, ab, rnd)
	assets(company, ab)
	people(company, ab, rnd)
	vouchers(company, ab)
	frappe.db.commit()


# ---------------------------------------------------------------- masters
def masters(company, ab):
	for code, name, group, uom, rate, wh, qi in STORE_ITEMS:
		if not frappe.db.exists("Item", code):
			_ins({"doctype": "Item", "item_code": code, "item_name": name, "item_group": group, "stock_uom": uom, "is_stock_item": 1,
				"is_purchase_item": 1, "valuation_rate": rate, "standard_rate": rate, "quality_inspection_template": qi,
				"inspection_required_before_purchase": 1 if qi else 0, "description": f"{name} ({TAG})",
				"item_defaults": [{"company": company, "default_warehouse": f"{wh} - {ab}"}]})
	for name, group, wht, ntn in SUPPLIERS:
		if not frappe.db.exists("Supplier", name):
			_ins({"doctype": "Supplier", "supplier_name": name, "supplier_group": group, "tax_id": ntn, "country": "Pakistan",
				"tax_withholding_category": wht if frappe.db.exists("Tax Withholding Category", wht) else None})
	for name, group, terr, ntn, reg in CUSTOMERS:
		if not frappe.db.exists("Customer", name):
			_ins({"doctype": "Customer", "customer_name": name, "customer_group": group, "territory": terr, "tax_id": ntn,
				"customer_type": "Company"})
	if not frappe.db.exists("Sales Partner", "Sheikh Brothers (Agent)"):
		_ins({"doctype": "Sales Partner", "partner_name": "Sheikh Brothers (Agent)", "partner_type": "Commission Agent",
			"territory": "Punjab", "commission_rate": 0.5})
	frappe.db.set_value("Item", "SUGAR-50KG", "item_group", "Refined Sugar")


# ---------------------------------------------------------------- purchase cycle
def _po(company, ab, supplier, items, day, sq=None, series=None):
	po = {"doctype": "Purchase Order", "supplier": supplier, "company": company, "transaction_date": day, "schedule_date": add_days(day, 7),
		"taxes_and_charges": f"Input GST 18% - {ab}", "items": [{"item_code": c, "qty": q, "rate": r, "schedule_date": add_days(day, 7),
		"warehouse": frappe.db.get_value("Item Default", {"parent": c, "company": company}, "default_warehouse"),
		**({"supplier_quotation": sq} if sq else {})} for c, q, r in items]}
	if series:
		po["naming_series"] = series
	d = frappe.get_doc(po)
	d.set_missing_values() if hasattr(d, "set_missing_values") else None
	from erpnext.controllers.accounts_controller import get_taxes_and_charges

	d.set("taxes", get_taxes_and_charges("Purchase Taxes and Charges Template", d.taxes_and_charges))
	_cc(d)
	d.flags.ignore_permissions = True
	d.insert()
	d.submit()
	return d


def _receive(po, day, qi_ok=True):
	from erpnext.buying.doctype.purchase_order.purchase_order import make_purchase_receipt

	pr = make_purchase_receipt(po.name)
	pr.posting_date, pr.set_posting_time = day, 1
	pr.posting_time = "11:00:00"
	pr.flags.ignore_permissions = True
	pr.insert()
	for i in pr.items:
		tpl = frappe.db.get_value("Item", i.item_code, "quality_inspection_template")
		if tpl:
			qi = frappe.get_doc({"doctype": "Quality Inspection", "inspection_type": "Incoming", "reference_type": "Purchase Receipt",
				"reference_name": pr.name, "item_code": i.item_code, "sample_size": 1, "inspected_by": "Administrator",
				"report_date": day, "quality_inspection_template": tpl, "child_row_reference": i.name})
			qi.get_item_specification_details() if hasattr(qi, "get_item_specification_details") else None
			for r in qi.readings:
				if r.numeric and r.min_value is not None and r.max_value is not None:
					r.reading_1 = str(round((flt(r.min_value) + flt(r.max_value)) / 2, 2))
				elif not r.numeric:
					r.reading_value = "OK"
			qi.status = "Accepted"
			qi.flags.ignore_permissions = True
			qi.insert()
			qi.submit()
	pr.reload()
	pr.flags.ignore_permissions = True
	pr.submit()
	return pr


def _bill(pr, day, bill_no, category="Local"):
	from erpnext.stock.doctype.purchase_receipt.purchase_receipt import make_purchase_invoice

	pi = make_purchase_invoice(pr.name)
	pi.posting_date, pi.set_posting_time, pi.bill_no, pi.bill_date = day, 1, bill_no, day
	pi.due_date = add_days(day, 30)
	pi.set("payment_schedule", [])
	pi.invoice_category = category
	pi.apply_tds = 1 if frappe.db.get_value("Supplier", pi.supplier, "tax_withholding_category") else 0
	pi.flags.ignore_permissions = True
	pi.insert()
	pi.submit()
	return pi


def _pay(pi, day, bank, cheque):
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Purchase Invoice", pi.name, bank_account=bank)
	pe.posting_date, pe.reference_no, pe.reference_date = day, cheque, day
	pe.mode_of_payment = "Cheque" if frappe.db.exists("Mode of Payment", "Cheque") else pe.mode_of_payment
	pe.remarks = f"Payment to {pi.supplier_name} against {pi.bill_no} ({TAG})"
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	return pe


def purchase(company, ab, rnd):
	bank = f"Cane Payments Bank - {ab}"
	# 1. purchase demand (Material Request) from the process house and the workshop
	mr1 = _ins({"doctype": "Material Request", "material_request_type": "Purchase", "company": company, "transaction_date": "2026-10-03",
		"schedule_date": "2026-10-15", "items": [{"item_code": "CH-LIME", "qty": 20000, "schedule_date": "2026-10-15",
		"warehouse": f"Chemical Store - {ab}"}, {"item_code": "CH-SULPHUR", "qty": 6000, "schedule_date": "2026-10-15", "warehouse": f"Chemical Store - {ab}"}]},
		submit=True)
	mr2 = _ins({"doctype": "Material Request", "material_request_type": "Purchase", "company": company, "transaction_date": "2026-10-04",
		"schedule_date": "2026-10-20", "items": [{"item_code": c, "qty": q, "schedule_date": "2026-10-20",
		"warehouse": frappe.db.get_value("Item Default", {"parent": c, "company": company}, "default_warehouse")} for c, q in
		(("ST-BRG-6205", 120), ("ST-BRG-22320", 4), ("ST-CHN-MILL", 60), ("FL-GREASE", 400))]}, submit=True)
	_ins({"doctype": "Material Request", "material_request_type": "Purchase", "company": company, "transaction_date": "2026-11-04",
		"schedule_date": "2026-11-20", "items": [{"item_code": "ST-MTR-15KW", "qty": 2, "schedule_date": "2026-11-20",
		"warehouse": f"Electrical Store - {ab}"}, {"item_code": "ST-CBL-4C16", "qty": 500, "schedule_date": "2026-11-20",
		"warehouse": f"Electrical Store - {ab}"}]}, submit=True)
	# 2. inquiry (RFQ) to three chemical suppliers, three quotations, PO to the lowest
	chem = ["Punjab Chemicals (Pvt) Ltd", "Lahore Lime Industries", "Indus Sulphur Traders"]
	rfq = _ins({"doctype": "Request for Quotation", "company": company, "transaction_date": "2026-10-05",
		"message_for_supplier": "Please quote your best rates, delivery at mill, 30 days credit.",
		"suppliers": [{"supplier": s} for s in chem], "items": [{"item_code": i.item_code, "qty": i.qty, "uom": i.uom, "conversion_factor": 1,
		"schedule_date": i.schedule_date, "warehouse": i.warehouse, "material_request": mr1.name, "material_request_item": i.name} for i in mr1.items]},
		submit=True)
	quotes = {"Punjab Chemicals (Pvt) Ltd": (44.5, 121), "Lahore Lime Industries": (41.0, 124), "Indus Sulphur Traders": (43.0, 116.5)}
	sqs = {}
	for s, (lime, sul) in quotes.items():
		sqs[s] = _ins({"doctype": "Supplier Quotation", "supplier": s, "company": company, "transaction_date": "2026-10-07", "valid_till": "2026-11-07",
			"items": [{"item_code": "CH-LIME", "qty": 20000, "rate": lime, "request_for_quotation": rfq.name, "warehouse": f"Chemical Store - {ab}"},
				{"item_code": "CH-SULPHUR", "qty": 6000, "rate": sul, "request_for_quotation": rfq.name, "warehouse": f"Chemical Store - {ab}"}]}, submit=True)
	po_lime = _po(company, ab, "Lahore Lime Industries", [("CH-LIME", 20000, 41.0)], "2026-10-08")
	po_sul = _po(company, ab, "Indus Sulphur Traders", [("CH-SULPHUR", 6000, 116.5)], "2026-10-08")
	po_brg = _po(company, ab, "Al-Hamd Bearing House", [("ST-BRG-6205", 120, 1420), ("ST-BRG-22320", 4, 67000)], "2026-10-09")
	po_eng = _po(company, ab, "Faisal Engineering Works", [("ST-CHN-MILL", 60, 9050), ("ST-VLV-4IN", 6, 18200)], "2026-10-10")
	po_fuel = _po(company, ab, "Shell Fuel Station Sargodha Rd", [("FL-DIESEL", 12000, 272), ("FL-GREASE", 400, 955)], "2026-10-12")
	_po(company, ab, "Pak Electric Motors", [("ST-MTR-15KW", 2, 262000)], "2026-11-05")  # still to receive
	# 3. goods received (with quality inspection), bills, payment
	pr_lime = _receive(po_lime, "2026-10-14")
	pr_sul = _receive(po_sul, "2026-10-15")
	pr_brg = _receive(po_brg, "2026-10-16")
	pr_eng = _receive(po_eng, "2026-10-18")
	pr_fuel = _receive(po_fuel, "2026-10-13")
	pi_lime = _bill(pr_lime, "2026-10-16", "LLI-1182")
	_bill(pr_sul, "2026-10-17", "IST-0457")
	pi_brg = _bill(pr_brg, "2026-10-18", "AHB-2291")
	_bill(pr_eng, "2026-10-20", "FEW-778")
	_bill(pr_fuel, "2026-10-14", "SFS-10-26")
	_pay(pi_lime, "2026-10-28", bank, "HBL-004512")
	_pay(pi_brg, "2026-11-05", bank, "HBL-004519")
	# a service bill (motor rewinding) with services withholding
	svc = frappe.get_doc({"doctype": "Purchase Invoice", "supplier": "Haq Rewinding Services", "company": company, "posting_date": "2026-10-22",
		"set_posting_time": 1, "bill_no": "HRS-61", "bill_date": "2026-10-22", "due_date": "2026-11-21", "invoice_category": "Service", "apply_tds": 1,
		"update_stock": 0, "items": [{"item_name": "Rewinding 37 kW motor (crusher)", "description": "Rewinding 37 kW motor (crusher)", "qty": 1,
		"rate": 85000, "uom": "Nos", "expense_account": frappe.db.get_value("Company", company, "default_expense_account"),
		"cost_center": f"Workshop - {ab}"}]})
	svc.flags.ignore_permissions = True
	svc.insert()
	svc.submit()


# ---------------------------------------------------------------- store issues and gate passes
def stores(company, ab, rnd):
	issues = [("2026-11-02", "Chemical Store", "Process House", [("CH-LIME", 3200), ("CH-SULPHUR", 900)]),
		("2026-11-03", "Mechanical Store", "Mill House", [("ST-BRG-6205", 16), ("ST-CHN-MILL", 8)]),
		("2026-11-04", "Fuel Store", "Boiler House", [("FL-DIESEL", 1800), ("FL-GREASE", 60)]),
		("2026-11-05", "Chemical Store", "Process House", [("CH-LIME", 3500), ("CH-SULPHUR", 950)]),
		("2026-11-06", "Mechanical Store", "Workshop", [("ST-BRG-22320", 1), ("ST-VLV-4IN", 2)])]
	expense = frappe.db.get_value("Company", company, "default_expense_account")
	for day, wh, dept, items in issues:
		_ins({"doctype": "Stock Entry", "stock_entry_type": "Store Issue", "company": company, "posting_date": day, "set_posting_time": 1,
			"posting_time": "09:30:00", "remarks": f"Issued to {dept} ({TAG})", "items": [{"item_code": c, "qty": q, "s_warehouse": f"{wh} - {ab}",
			"expense_account": expense, "cost_center": f"{dept} - {ab}"} for c, q in items]}, submit=True)
	gp = _ins({"doctype": "Gate Pass", "pass_type": "Outward - Returnable", "posting_date": "2026-11-03", "party_type": "Supplier",
		"party": "Haq Rewinding Services", "vehicle_no": "SGD-2211", "driver_name": "Bashir Ahmad", "expected_return_date": "2026-11-12",
		"purpose": "15 kW motor of the bagasse elevator for rewinding", "remarks": TAG, "is_demo": 1,
		"items": [{"item_code": "ST-MTR-15KW", "description": "Induction Motor 15 kW (bagasse elevator, burnt)", "qty": 1, "uom": "Nos"}]}, submit=True)
	gp2 = _ins({"doctype": "Gate Pass", "pass_type": "Outward - Returnable", "posting_date": "2026-10-20", "party_type": "Supplier",
		"party": "Faisal Engineering Works", "vehicle_no": "SGD-4410", "expected_return_date": "2026-10-27", "purpose": "Pinion shaft for machining",
		"remarks": TAG, "is_demo": 1, "items": [{"description": "Mill pinion shaft 3rd mill", "qty": 1, "uom": "Nos"}]}, submit=True)
	from sugarcane.mill_stores.gate_pass import record_return

	record_return(gp2.name, on="2026-10-26")
	_ins({"doctype": "Gate Pass", "pass_type": "Outward - Non-Returnable", "posting_date": "2026-11-05", "party_type": "Other",
		"party_name": "Scrap auction — Rafiq Steel", "vehicle_no": "FSD-7781", "purpose": "Scrap iron sold at auction", "remarks": TAG, "is_demo": 1,
		"items": [{"description": "Scrap iron (old roller shells)", "qty": 3.2, "uom": "Ton"}]}, submit=True)
	return gp.name


# ---------------------------------------------------------------- sugar sales
def sales(company, ab, rnd):
	from erpnext.selling.doctype.sales_order.sales_order import make_delivery_note

	from sugarcane.cane_procurement import procurement as p
	from sugarcane.sugar_sales import dispatch

	wh = frappe.db.get_single_value("Sugar Settings", "sugar_warehouse")
	terminal = frappe.db.get_value("Weighbridge Terminal", {"is_active": 1, "allowed_operations": ["in", ["All", "Gross and Tare"]]}, "name") or \
		frappe.db.get_value("Weighbridge Terminal", {"is_active": 1}, "name")
	contracts = [("Madina Sugar Dealers", 400, "2026-11-02", "Sheikh Brothers (Agent)", "Pakistan GST 18%"),
		("Al-Rehman Trading Co.", 300, "2026-11-02", None, "Pakistan GST 18%"),
		("Shezan Foods (Pvt) Ltd", 250, "2026-11-03", None, "Pakistan GST 18%"),
		("Ghulam Rasool Kiryana", 60, "2026-11-04", None, "GST 18% + Further Tax 4%"),
		("Karachi Commodities (Pvt) Ltd", 500, "2026-11-05", "Sheikh Brothers (Agent)", "Pakistan GST 18%")]
	sos = []
	for cust, bags, day, agent, tax in contracts:
		so = frappe.get_doc({"doctype": "Sales Order", "customer": cust, "company": company, "transaction_date": day, "delivery_date": add_days(day, 15),
			"selling_price_list": "Sugar Rate List", "sales_partner": agent, "taxes_and_charges": f"{tax} - {ab}",
			"items": [{"item_code": "SUGAR-50KG", "qty": bags, "rate": 7250, "warehouse": wh, "delivery_date": add_days(day, 15)}]})
		from erpnext.controllers.accounts_controller import get_taxes_and_charges

		so.set("taxes", get_taxes_and_charges("Sales Taxes and Charges Template", so.taxes_and_charges))
		so.flags.ignore_permissions = True
		so.insert()
		so.submit()
		sos.append(so)
	lifts = [(0, 150, "2026-11-03", "LHR-6612"), (1, 120, "2026-11-03", "FSD-3390"), (2, 125, "2026-11-04", "LHR-8821"),
		(0, 150, "2026-11-05", "LHR-6613"), (3, 60, "2026-11-05", "SGD-1123"), (4, 200, "2026-11-06", "KHI-5520"), (1, 100, "2026-11-06", "FSD-3391")]
	invoices = []
	for k, (si, bags, day, vno) in enumerate(lifts):
		dn = make_delivery_note(sos[si].name)
		dn.posting_date, dn.set_posting_time, dn.posting_time = day, 1, f"{10 + k % 6:02d}:15:00"
		for i in dn.items:
			i.qty = bags
		dn.delivery_order_no = f"DO-{1101 + k}"
		dn.dispatch_vehicle_no = vno
		dn.flags.ignore_permissions = True
		dn.insert()
		last = k == len(lifts) - 1
		at = datetime.combine(getdate(day), time(9 + k % 6, 0))
		bags_kg = bags * (50 + 0.1)
		tare = rnd.randint(9200, 11800)
		p._cache_reading(terminal, {"weight_kg": tare, "stable": 1, "raw": "", "source": "Simulator", "at": str(at)})
		sw = dispatch.weigh_empty(dn.name, vno, terminal, driver_name=rnd.choice(FIRST) + " " + rnd.choice(LAST), at=at, is_demo=1)
		if last:  # this truck is still being loaded
			continue
		gross = int(tare + bags_kg * (1 + rnd.uniform(-0.003, 0.003)))
		p._cache_reading(terminal, {"weight_kg": gross, "stable": 1, "raw": "", "source": "Simulator", "at": str(at + timedelta(minutes=75))})
		dispatch.weigh_loaded(sw["name"], at=at + timedelta(minutes=75))
		invoices.append(dn.name)
	# one more DO waiting at the gate (not weighed yet)
	dn = make_delivery_note(sos[4].name)
	dn.posting_date, dn.set_posting_time = "2026-11-06", 1
	for i in dn.items:
		i.qty = 150
	dn.delivery_order_no, dn.dispatch_vehicle_no = "DO-1108", "KHI-5521"
	dn.flags.ignore_permissions = True
	dn.insert()
	# invoices (one per DN), one receipt
	from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice

	first = None
	for name in invoices:
		si = make_sales_invoice(name)
		si.posting_date = frappe.db.get_value("Delivery Note", name, "posting_date")
		si.set_posting_time, si.due_date = 1, add_days(si.posting_date, 15)
		si.set("payment_schedule", [])
		si.flags.ignore_permissions = True
		si.insert()
		si.submit()
		first = first or si
	from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry

	pe = get_payment_entry("Sales Invoice", first.name, bank_account=f"Cane Payments Bank - {ab}")
	pe.posting_date, pe.reference_no, pe.reference_date = "2026-11-05", "MCB-778812", "2026-11-05"
	pe.remarks = f"Receipt from {first.customer_name} ({TAG})"
	pe.flags.ignore_permissions = True
	pe.insert()
	pe.submit()
	# a post-dated cheque received from a dealer (held as a draft until its date)
	si2 = frappe.get_all("Sales Invoice", filters={"docstatus": 1, "outstanding_amount": [">", 0]}, pluck="name", order_by="name", limit=1)
	if si2:
		pdc = get_payment_entry("Sales Invoice", si2[0], bank_account=f"Cane Payments Bank - {ab}")
		pdc.posting_date, pdc.reference_no, pdc.reference_date = "2026-11-06", "UBL-120044", "2026-12-05"
		pdc.remarks = f"Post-dated cheque ({TAG})"
		pdc.flags.ignore_permissions = True
		pdc.insert()


# ---------------------------------------------------------------- fixed assets
def assets(company, ab):
	for name, cat, cost, item in (("Boiler No. 2 (60 TPH)", "Plant and Machinery", 185000000, "FA-BOILER"),
			("Back-pressure Turbine 6 MW", "Plant and Machinery", 240000000, "FA-TURBINE"),
			("Mill Tandem (5 mills)", "Plant and Machinery", 410000000, "FA-MILL"),
			("Factory Building", "Buildings", 150000000, "FA-BUILDING"),
			("Tractor with Trolley", "Vehicles", 7800000, "FA-TRACTOR"),
			("Computers — Cane Office", "Computers", 2400000, "FA-COMPUTERS")):
		if not frappe.db.exists("Item", item):
			_ins({"doctype": "Item", "item_code": item, "item_name": name, "item_group": "Tools and Equipment", "stock_uom": "Nos",
				"is_stock_item": 0, "is_fixed_asset": 1, "asset_category": cat})
		if frappe.db.exists("Asset", {"item_code": item}):
			continue
		a = frappe.get_doc({"doctype": "Asset", "asset_name": name, "item_code": item, "asset_category": cat, "company": company,
			"is_existing_asset": 1, "gross_purchase_amount": cost, "purchase_amount": cost, "net_purchase_amount": cost, "purchase_date": "2020-07-01",
			"available_for_use_date": "2026-07-01", "location": _location(), "calculate_depreciation": 1,
			"cost_center": f"{'Mill House' if cat == 'Plant and Machinery' else 'Administration'} - {ab}"})
		a.set("finance_books", [])
		for fb in frappe.get_all("Asset Finance Book", filters={"parent": cat}, fields=["finance_book", "depreciation_method",
				"frequency_of_depreciation", "total_number_of_depreciations", "rate_of_depreciation"]):
			a.append("finance_books", {**fb, "depreciation_start_date": "2027-06-30"})
		a.flags.ignore_permissions = True
		a.insert()
		a.submit()


def _location():
	return frappe.db.get_value("Location", "Mill Premises") or _ins({"doctype": "Location", "location_name": "Mill Premises"}).name


# ---------------------------------------------------------------- HR
def people(company, ab, rnd):
	if frappe.db.exists("Employee", {"employee_number": "MSM-001"}):
		return
	n, emps = 0, []
	shift_cycle = ["Shift A", "Shift B", "Shift C"]
	for desig, dept, base, count, shift, seasonal in STAFF:
		for k in range(count):
			n += 1
			first, last = rnd.choice(FIRST), rnd.choice(LAST)
			gender = "Female" if first in ("Saima", "Rabia", "Nasreen", "Sobia") else "Male"
			e = _ins({"doctype": "Employee", "first_name": first, "last_name": last, "gender": gender, "company": company,
				"date_of_birth": f"{rnd.randint(1972, 2000)}-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}",
				"date_of_joining": "2026-10-01" if seasonal else f"{rnd.randint(2008, 2024)}-{rnd.randint(1, 12):02d}-01",
				"department": f"{dept} - {ab}", "designation": desig, "employment_type": "Seasonal" if seasonal else "Full-time",
				"employee_number": f"MSM-{n:03d}", "attendance_device_id": f"{1000 + n}", "default_shift": shift or shift_cycle[k % 3],
				"holiday_list": "Mill Holidays 2026-27", "employee_cnic": f"38403-{rnd.randint(1000000, 9999999)}-{rnd.randint(1, 9)}",
				"eobi_no": f"EOBI-{rnd.randint(100000, 999999)}", "is_seasonal": seasonal, "status": "Active",
				"cell_number": f"0300{rnd.randint(1000000, 9999999)}"})
			_ins({"doctype": "Salary Structure Assignment", "employee": e.name, "salary_structure": "Mill Staff - Monthly", "company": company,
				"from_date": "2026-10-01", "base": base, "currency": "PKR", "income_tax_slab": "Pakistan Salaried TY2026",
				"payroll_payable_account": f"Payroll Payable - {ab}"}, submit=True)
			emps.append((e, shift or shift_cycle[k % 3]))
	starts = {s: frappe.db.get_value("Shift Type", s, "start_time") for s in ("Shift A", "Shift B", "Shift C", "General")}
	for day in range(1, 7):
		d = getdate(f"2026-11-{day:02d}")
		for e, shift in emps:
			r = rnd.random()
			if r < 0.05:
				status, late = "Absent", 0
			else:
				status, late = "Present", 1 if r > 0.85 else 0
			att = _ins({"doctype": "Attendance", "employee": e.name, "attendance_date": d, "status": status, "shift": shift, "company": company,
				"late_entry": late}, submit=True)
			if status == "Present":
				st = starts[shift]
				start = datetime.combine(d, time()) + (st if isinstance(st, timedelta) else timedelta())
				inn = start + timedelta(minutes=rnd.randint(18, 45) if late else rnd.randint(-20, 8))
				for t, lt in ((inn, "IN"), (start + timedelta(hours=8, minutes=rnd.randint(0, 25)), "OUT")):
					_ins({"doctype": "Employee Checkin", "employee": e.name, "time": t, "log_type": lt, "device_id": "ZK-GATE-1"})
	# October payroll
	from hrms.payroll.doctype.salary_structure.salary_structure import make_salary_slip

	for e, _shift in emps:
		slip = make_salary_slip("Mill Staff - Monthly", employee=e.name, posting_date="2026-10-31", for_preview=0)
		slip.start_date, slip.end_date, slip.posting_date = "2026-10-01", "2026-10-31", "2026-10-31"
		slip.flags.ignore_permissions = True
		slip.insert()
		slip.submit()


# ---------------------------------------------------------------- vouchers waiting to be posted
def opening(company, ab):
	"""Opening bank and cash balances on 1 July (the cane payments came out of these)."""
	if frappe.db.exists("Journal Entry", {"user_remark": f"Opening balances 1 July 2026 ({TAG})"}):
		return
	cash = f"Cash - {ab}" if frappe.db.exists("Account", f"Cash - {ab}") else frappe.db.get_value("Company", company, "default_cash_account")
	equity = frappe.db.get_value("Account", {"company": company, "account_name": "Temporary Opening", "is_group": 0}, "name") or \
		frappe.db.get_value("Account", {"company": company, "root_type": "Equity", "is_group": 0}, "name")
	cc = frappe.db.get_value("Company", company, "cost_center")
	je = _ins({"doctype": "Journal Entry", "company": company, "posting_date": "2026-07-01", "voucher_type": "Opening Entry", "is_opening": "Yes",
		"user_remark": f"Opening balances 1 July 2026 ({TAG})", "accounts": [
			{"account": f"Cane Payments Bank - {ab}", "debit_in_account_currency": 250000000, "cost_center": cc},
			{"account": cash, "debit_in_account_currency": 2500000, "cost_center": cc},
			{"account": equity, "credit_in_account_currency": 252500000, "cost_center": cc}]}, submit=True)
	return je.name


def vouchers(company, ab):
	opening(company, ab)
	exp = frappe.db.get_value("Company", company, "default_expense_account")
	cash = f"Cash - {ab}" if frappe.db.exists("Account", f"Cash - {ab}") else frappe.db.get_value("Company", company, "default_cash_account")
	bank = f"Cane Payments Bank - {ab}"
	head = lambda n: f"{n} - {ab}" if frappe.db.exists("Account", f"{n} - {ab}") else exp  # noqa: E731
	for day, desc, amt, acc, cc, ex in (("2026-11-05", "MEPCO electricity bill October (colony and offices)", 1840000, bank, "Administration", "Utility Expenses"),
			("2026-11-05", "Petty cash — tea and refreshments, crushing night shift", 18500, cash, "Mill House", "Entertainment Expenses"),
			("2026-11-06", "Diesel for cane yard tractors (cash purchase)", 64000, cash, "Cane", "Miscellaneous Expenses"),
			("2026-11-06", "PTCL internet and telephone October", 42000, bank, "Administration", "Telephone Expenses")):
		_ins({"doctype": "Journal Entry", "company": company, "posting_date": day, "voucher_type": "Bank Entry" if acc == bank else "Cash Entry",
			"cheque_no": "HBL-004530" if acc == bank else None, "cheque_date": day if acc == bank else None, "user_remark": f"{desc} ({TAG})",
			"accounts": [{"account": head(ex), "debit_in_account_currency": amt, "cost_center": f"{cc} - {ab}"},
				{"account": acc, "credit_in_account_currency": amt, "cost_center": f"{cc} - {ab}"}]})
	_backfill_codes()


def _backfill_codes():
	from sugarcane.mill_finance.vouchers import code_for

	for name in frappe.get_all("Journal Entry", filters={"voucher_code": ["in", ["", None]]}, pluck="name"):
		frappe.db.set_value("Journal Entry", name, "voucher_code", code_for(frappe.get_doc("Journal Entry", name)), update_modified=False)


# ---------------------------------------------------------------- reset
def reset():
	"""Remove the Phase 7 demo (documents first, cancelled in reverse order, then masters)."""
	frappe.flags.mute_emails = True

	def cancel_all(dt, filters):
		for name in frappe.get_all(dt, filters={**filters, "docstatus": 1}, pluck="name", order_by="creation desc"):
			d = frappe.get_doc(dt, name)
			d.flags.ignore_permissions = True
			d.flags.ignore_links = True
			try:
				d.cancel()
			except Exception:
				frappe.db.rollback()
		for name in frappe.get_all(dt, filters=filters, pluck="name"):
			frappe.delete_doc(dt, name, force=True, ignore_permissions=True, ignore_missing=True)

	emps = frappe.get_all("Employee", filters={"employee_number": ["like", "MSM-%"]}, pluck="name")
	if emps:
		for dt in ("Salary Slip", "Additional Salary", "Attendance", "Salary Structure Assignment"):
			cancel_all(dt, {"employee": ["in", emps]})
		frappe.db.delete("Employee Checkin", {"employee": ["in", emps]})
		for e in emps:
			frappe.delete_doc("Employee", e, force=True, ignore_permissions=True)
	sup = [s[0] for s in SUPPLIERS]
	cust = [c[0] for c in CUSTOMERS]
	cancel_all("Payment Entry", {"party": ["in", sup + cust]})
	cancel_all("Sales Invoice", {"customer": ["in", cust]})
	cancel_all("Gate Pass", {"remarks": TAG})
	cancel_all("Gate Pass", {"party": ["in", cust]})
	cancel_all("Sales Weighment", {"customer": ["in", cust]})
	cancel_all("Delivery Note", {"customer": ["in", cust]})
	cancel_all("Sales Order", {"customer": ["in", cust]})
	cancel_all("Purchase Invoice", {"supplier": ["in", sup]})
	cancel_all("Quality Inspection", {"reference_type": "Purchase Receipt"})
	cancel_all("Purchase Receipt", {"supplier": ["in", sup]})
	cancel_all("Purchase Order", {"supplier": ["in", sup]})
	cancel_all("Supplier Quotation", {"supplier": ["in", sup]})
	items = [i[0] for i in STORE_ITEMS]
	cancel_all("Stock Entry", {"remarks": ["like", f"%{TAG}%"]})
	for rfq in frappe.get_all("Request for Quotation Supplier", filters={"supplier": ["in", sup]}, pluck="parent"):
		cancel_all("Request for Quotation", {"name": rfq})
	for mr in set(frappe.get_all("Material Request Item", filters={"item_code": ["in", items]}, pluck="parent")):
		cancel_all("Material Request", {"name": mr})
	cancel_all("Journal Entry", {"user_remark": ["like", f"%{TAG}%"]})
	for a in frappe.get_all("Asset", filters={"item_code": ["like", "FA-%"]}, pluck="name"):
		cancel_all("Asset", {"name": a})
	for dt, names in (("Customer", cust), ("Supplier", sup), ("Item", items + [f"FA-{x}" for x in ("BOILER", "TURBINE", "MILL", "BUILDING", "TRACTOR", "COMPUTERS")]),
			("Sales Partner", ["Sheikh Brothers (Agent)"])):
		for n in names:
			if frappe.db.exists(dt, n):
				try:
					frappe.delete_doc(dt, n, force=True, ignore_permissions=True)
				except Exception:
					frappe.db.rollback()
	frappe.db.commit()
