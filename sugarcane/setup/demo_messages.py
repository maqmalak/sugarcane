# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Demo messages: the demo generator runs with messages off, then this replays every event for the demo records (Mock
gateway) and dates each message at its record's own time; a few keyword conversations and two own templates."""
from datetime import datetime, time, timedelta

import frappe
from frappe.utils import get_datetime, getdate

from sugarcane import sms


def _at(log, when):
	when = get_datetime(when)
	frappe.db.set_value("Sugar SMS Log", log, {"queued_at": when, "sent_at": when + timedelta(seconds=4)}, update_modified=False)


def _replay(doctype, fn, order, when, filters=None):
	for name in frappe.get_all(doctype, filters={"is_demo": 1, "docstatus": 1, **(filters or {})}, pluck="name", order_by=order):
		doc = frappe.get_doc(doctype, name)
		before = set(frappe.get_all("Sugar SMS Log", filters={"reference_doctype": doctype, "reference_name": name}, pluck="name"))
		fn(doc)
		for log in set(frappe.get_all("Sugar SMS Log", filters={"reference_doctype": doctype, "reference_name": name}, pluck="name")) - before:
			_at(log, when(doc))


def run():
	if frappe.db.exists("Sugar SMS Log", {"is_demo": 1}):
		return
	frappe.flags.sugar_sms_off = False
	frappe.flags.sugar_sms_nocap = True
	try:
		for t in (
			{"template_name": "CPR Posted - Roman Urdu", "event": "CPR Posted", "language": "Roman Urdu", "audience": "Grower",
				"body": sms.DEFAULTS["CPR Posted"][1]},
			{"template_name": "Payment Sent - English", "event": "Payment Sent", "language": "English", "audience": "Grower",
				"body": "{{ mill }}: Dear {{ grower_name }}, Rs {{ amount }} for {{ cprs }} CPR(s) sent {{ mode }} to {{ bank }} on {{ day }}. Ref {{ scroll }}. Thank you for your cane."},
		):
			if not frappe.db.exists("Sugar SMS Template", t["template_name"]):
				frappe.get_doc({"doctype": "Sugar SMS Template", "channel": "SMS", "is_active": 1, "is_demo": 1, **t}).insert(ignore_permissions=True)
		_replay("Cane Indent", sms.indent_submitted, "authorized_on asc", lambda d: d.authorized_on or datetime.combine(getdate(d.indent_date), time(10)))
		_replay("Cane Token", sms.token_submitted, "issued_at asc", lambda d: d.issued_at)
		_replay("Cane Purchase Receipt", sms.cpr_submitted, "posted_at asc", lambda d: get_datetime(d.posted_at) + timedelta(minutes=1))
		posted = dict(frappe.get_all("Cane Purchase Receipt", filters={"is_demo": 1}, fields=["name", "posted_at"], as_list=True))
		_replay("TPT Bilty", sms.bilty_submitted, "name asc", lambda d: get_datetime(posted.get(d.cpr) or d.creation) + timedelta(minutes=2))
		_replay("Cane Payment Scroll", sms.scroll_submitted, "posting_date asc", lambda d: datetime.combine(getdate(d.posting_date), time(15, 30)))
		for name in frappe.get_all("Grower Loan", filters={"is_demo": 1, "docstatus": 1, "disbursed_on": ["is", "set"]}, pluck="name", order_by="disbursed_on asc"):
			loan = frappe.get_doc("Grower Loan", name)
			sms.loan_disbursed(loan)
			for log in frappe.get_all("Sugar SMS Log", filters={"reference_doctype": "Grower Loan", "reference_name": name}, pluck="name"):
				_at(log, datetime.combine(getdate(loan.disbursed_on), time(12)))
		_keywords()
	finally:
		frappe.flags.sugar_sms_nocap = False
	frappe.db.commit()


def _keywords():
	"""Growers who supplied cane text the mill: BAL, CPR, LOAN, PAY, a wrong keyword, and a number that isn't registered."""
	last = frappe.db.sql("select max(posted_at) from `tabCane Purchase Receipt` where is_demo = 1 and docstatus = 1")[0][0]
	if not last:
		return
	rows = frappe.db.sql("""select c.grower, g.mobile from `tabCane Purchase Receipt` c join `tabGrower` g on g.name = c.grower
		where c.is_demo = 1 and c.docstatus = 1 and ifnull(g.mobile, '') != '' group by c.grower, g.mobile order by c.grower limit 4""", as_dict=True)
	loaned = frappe.db.sql("""select l.grower, g.mobile from `tabGrower Loan` l join `tabGrower` g on g.name = l.grower
		where l.is_demo = 1 and l.status = 'Disbursed' and ifnull(g.mobile, '') != '' limit 1""", as_dict=True)
	talk = [(r.mobile, w) for r, w in zip(rows, ("BAL", "CPR", "PAY", "bal please"))] + [(r.mobile, "LOAN") for r in loaned]
	talk += [(rows[0].mobile, "RATE") if rows else None, ("0345-0000001", "BAL")]
	at = get_datetime(last) + timedelta(minutes=20)
	for i, item in enumerate(t for t in talk if t):
		out = sms.receive(item[0], item[1], is_demo=1)
		_at(out["in"], at + timedelta(minutes=7 * i))
		if out["out"]:
			_at(out["out"], at + timedelta(minutes=7 * i, seconds=3))


def reset():
	frappe.db.delete("Sugar SMS Log", {"is_demo": 1})
	frappe.db.delete("Sugar SMS Template", {"is_demo": 1})
