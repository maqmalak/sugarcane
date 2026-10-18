# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt

from collections import defaultdict

import frappe
from frappe.utils import flt, getdate

from sugarcane.cane_procurement.report_utils import col, dates


def execute(filters=None):
	"""Depot weight excess / short: what reached the mill against what the depot bought.

	bought      the depot's CPRs — payable kg (paid to growers) and net kg (weighed, with binding)
	sent        loaded trucks weighed out at the depot
	received    the same trucks weighed in at the mill
	depot  ±    sent − bought net (more sent than weighed in = excess at the depot)
	transit ±   received − sent (negative = lost on the road)
	vs purchase received − bought payable: the depot's total excess (+) / short (−) against what was paid for
	held        cane bought and not yet sent (net kg); on the road: sent and not yet weighed in at the mill. The result adds both back
	            so a depot still holding cane, or with a truck on the way, isn't shown short
	"""
	f = frappe._dict(filters or {})
	start, end = dates(f)
	cond = {"s": start, "e": end, "d": f.depot or ""}
	g = defaultdict(lambda: defaultdict(float))
	for r in frappe.db.sql("""select purchase_depot depot, posting_date day, count(*) loads, sum(net_kg) net, sum(payable_kg) payable
			from `tabCane Purchase Receipt` where docstatus = 1 and ifnull(purchase_depot, '') != '' and posting_date between %(s)s and %(e)s
			and (%(d)s = '' or purchase_depot = %(d)s) group by purchase_depot, posting_date""", cond, as_dict=True):
		g[(r.depot, r.day)].update(loads=r.loads, net=flt(r.net), payable=flt(r.payable))
	for r in frappe.db.sql("""select depot, dispatch_day day, count(*) trucks, sum(dispatched_kg) sent from `tabDepot Dispatch` where docstatus = 1
			and dispatch_day between %(s)s and %(e)s and (%(d)s = '' or depot = %(d)s) group by depot, dispatch_day""", cond, as_dict=True):
		g[(r.depot, r.day)].update(trucks=r.trucks, sent=flt(r.sent))
	for r in frappe.db.sql("""select depot, received_day day, sum(received_kg) received, sum(dispatched_kg) sent_of_received from `tabDepot Dispatch`
			where docstatus = 1 and status = 'Received' and received_day between %(s)s and %(e)s and (%(d)s = '' or depot = %(d)s)
			group by depot, received_day""", cond, as_dict=True):
		g[(r.depot, r.day)].update(received=flt(r.received), sent_of_received=flt(r.sent_of_received))
	road = dict(frappe.db.sql("""select depot, sum(dispatched_kg) from `tabDepot Dispatch` where docstatus = 1 and status in ('In Transit', 'At Mill')
		and dispatch_day between %(s)s and %(e)s and (%(d)s = '' or depot = %(d)s) group by depot""", cond))
	data, by_depot = [], defaultdict(lambda: defaultdict(float))
	for (depot, day), v in sorted(g.items()):
		row = {"depot": depot, "day": day, "loads": v["loads"], "trucks": v["trucks"], "payable": v["payable"], "net": v["net"], "binding": v["net"] - v["payable"],
			"sent": v["sent"], "received": v["received"], "depot_diff": v["sent"] - v["net"] if v["sent"] or v["net"] else 0,
			"transit_diff": v["received"] - v["sent_of_received"], "vs_purchase": v["received"] - v["payable"]}
		data.append(row)
		t = by_depot[depot]
		for k in ("loads", "trucks", "payable", "net", "binding", "sent", "received", "transit_diff"):
			t[k] += row[k]
		t["sent_of_received"] += v["sent_of_received"]
	out = []
	for depot in sorted(by_depot):
		t = by_depot[depot]
		held = t["net"] - t["sent"]
		held_payable = held * (t["payable"] / t["net"]) if t["net"] else 0
		vs = t["received"] - t["payable"]
		on_road = flt(road.get(depot))
		after = t["received"] + on_road + held_payable - t["payable"]
		out.append({"depot": depot, "day": None, "indent": 0, "loads": t["loads"], "trucks": t["trucks"], "payable": t["payable"], "net": t["net"],
			"binding": t["binding"], "sent": t["sent"], "received": t["received"], "depot_diff": t["sent"] - (t["net"] - held),
			"transit_diff": t["transit_diff"], "vs_purchase": vs, "held": held, "on_road": on_road, "after_held": round(after),
			"pct": round(after * 100 / t["payable"], 2) if t["payable"] else 0, "result": "Excess" if after > 0 else ("Short" if after < 0 else "Even")})
		out += [{**r, "depot": "", "indent": 1, "depot_name": depot} for r in data if r["depot"] == depot]
	columns = [col("depot", "Depot", "Link", "Cane Depot", 150), col("day", "Day", "Date", width=95), col("loads", "Loads", "Int", width=60),
		col("payable", "Bought Payable kg", "Int", width=125), col("net", "Bought Net kg", "Int", width=110), col("binding", "Binding kg", "Int", width=85),
		col("trucks", "Trucks", "Int", width=65), col("sent", "Sent kg", "Int", width=100), col("received", "Received kg", "Int", width=105),
		col("depot_diff", "Depot ± kg", "Int", width=90), col("transit_diff", "Transit ± kg", "Int", width=95),
		col("vs_purchase", "Received − Bought kg", "Int", width=140), col("held", "Held at Depot kg", "Int", width=115), col("on_road", "On the Road kg", "Int", width=110),
		col("after_held", "Excess (+) / Short (−) kg", "Int", width=160), col("pct", "% of Purchase", "Float", width=95), col("result", "Result", width=70)]
	chart = {"data": {"labels": [r["depot"] for r in out if not r.get("indent")], "datasets": [{"name": "Excess / short %",
		"values": [r["pct"] for r in out if not r.get("indent")]}]}, "type": "bar"}
	return columns, out, None, chart
