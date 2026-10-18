# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	"""Per depot and crushing day: growers' loads bought, maund, value, commission; trucks sent and received; shortage."""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	cond = {"s": start, "e": end, "d": f.depot or ""}
	bought = frappe.db.sql("""select c.purchase_depot depot, c.posting_date day, count(*) loads, sum(c.payable_maund) maund, sum(c.govt_value) govt_value,
		sum(c.payable_cpr) payable, max(dp.depot_rate) rate from `tabCane Purchase Receipt` c join `tabCane Depot` dp on dp.name = c.purchase_depot
		where c.docstatus = 1 and c.posting_date between %(s)s and %(e)s and (%(d)s = '' or c.purchase_depot = %(d)s)
		group by c.purchase_depot, c.posting_date""", cond, as_dict=True)
	sent = frappe.db.sql("""select depot, dispatch_day day, count(*) trucks, sum(dispatched_kg) kg from `tabDepot Dispatch` where docstatus = 1
		and dispatch_day between %(s)s and %(e)s and (%(d)s = '' or depot = %(d)s) group by depot, dispatch_day""", cond, as_dict=True)
	got = frappe.db.sql("""select depot, received_day day, count(*) trucks, sum(received_kg) kg, sum(shortage_kg) shortage, sum(dispatched_kg) sent
		from `tabDepot Dispatch` where docstatus = 1 and status = 'Received' and received_day between %(s)s and %(e)s and (%(d)s = '' or depot = %(d)s)
		group by depot, received_day""", cond, as_dict=True)
	g = defaultdict(dict)
	for r in bought:
		g[(r.depot, r.day)].update(loads=r.loads, maund=r.maund, govt_value=r.govt_value, payable=r.payable, commission=round((r.maund or 0) * (r.rate or 0), 2))
	for r in sent:
		g[(r.depot, r.day)].update(trucks_sent=r.trucks, sent_kg=r.kg)
	for r in got:
		g[(r.depot, r.day)].update(trucks_received=r.trucks, received_kg=r.kg, shortage_kg=r.shortage,
			shortage_pct=round(r.shortage * 100 / r.sent, 3) if r.sent else 0)
	data = [{"depot": k[0], "day": k[1], **v} for k, v in sorted(g.items())]
	columns = [col("depot", "Depot", "Link", "Cane Depot", 150), col("day", "Crushing Day", "Date", width=105), col("loads", "Loads", "Int", width=65),
		col("maund", "Bought md", "Float", width=95), col("govt_value", "Govt Value", "Currency", width=115), col("payable", "Payable", "Currency", width=115),
		col("commission", "Commission", "Currency", width=100), col("trucks_sent", "Trucks Sent", "Int", width=90), col("sent_kg", "Sent kg", "Int", width=95),
		col("trucks_received", "Trucks Received", "Int", width=110), col("received_kg", "Received kg", "Int", width=100),
		col("shortage_kg", "Shortage kg", "Int", width=90), col("shortage_pct", "Shortage %", "Percent", width=85)]
	return columns, data
