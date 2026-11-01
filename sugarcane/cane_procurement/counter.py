"""Cash counters (tills) for TPT bilties, and the payee displays.

A cashier opens a session on a counter (Cash Counter 1, 2 …). Its opening balance is that counter's last counted close. Cash comes
from / goes back to the strong room (each move posts a Journal Entry between the strong room and the counter's cash account).
Bilties are scanned into a basket and paid together, in cash (never more than the till holds) or by one JazzCash transfer.
The current balance is always: opening + received − returned − cash paid. At close the cashier counts the notes; any short / excess
is posted, and the counted cash becomes the next opening.

Displays: the counter and weighbridge screens push what the payee should see (screen key "counter:<name>" / "wb:<terminal>") to the
cache; the display page polls it. Weighbridge displays add the terminal's live weight.
"""

import json

import frappe
from frappe import _
from frappe.utils import cint, flt, now_datetime

DENOMS = (5000, 1000, 500, 100, 50, 20, 10, 0)  # 0 = coins (count = rupees)


def _need():
	from sugarcane.cane_procurement.procurement import CASH_ROLES, need

	need(CASH_ROLES, _("work the cash counter"))


def counters() -> list:
	return frappe.get_all("Cash Counter", filters={"is_active": 1}, fields=["name", "cash_account", "display_title", "display_note"],
		order_by="name asc")


def open_session_of(user: str | None = None, counter: str | None = None) -> str | None:
	filters = {"status": "Open"}
	if counter:
		filters["counter"] = counter
	else:
		filters["cashier"] = user or frappe.session.user
	return frappe.db.get_value("Cash Counter Session", filters, "name")


def refresh(name: str) -> frappe._dict:
	"""Recompute a session's totals from its movements and bilties and store them."""
	s = frappe.get_doc("Cash Counter Session", name)
	rec = sum(flt(m.amount) for m in s.movements if m.movement_type == "Received from Strong Room")
	ret = sum(flt(m.amount) for m in s.movements if m.movement_type == "Returned to Strong Room")
	paid = frappe.db.sql("""select ifnull(payment_mode, 'Cash') mode, count(*) n, ifnull(sum(amount), 0) amt from `tabTPT Bilty`
		where counter_session = %s and status = 'Paid' group by ifnull(payment_mode, 'Cash')""", name, as_dict=True)
	by = {r.mode: r for r in paid}
	cash, jazz = by.get("Cash") or frappe._dict(n=0, amt=0), by.get("JazzCash") or frappe._dict(n=0, amt=0)
	vals = {"received_total": rec, "returned_total": ret, "cash_paid_total": flt(cash.amt), "cash_paid_count": cint(cash.n),
		"jazzcash_total": flt(jazz.amt), "jazzcash_count": cint(jazz.n),
		"expected_balance": flt(s.opening_balance) + rec - ret - flt(cash.amt)}
	if s.status == "Open":
		s.db_set(vals, update_modified=False)
	return frappe._dict({**s.as_dict(), **vals})


def open_session(counter: str) -> str:
	_need()
	if not frappe.db.get_value("Cash Counter", counter, "is_active"):
		frappe.throw(_("Counter {0} is not active").format(counter))
	other = open_session_of(counter=counter)
	if other:
		who = frappe.db.get_value("Cash Counter Session", other, "cashier")
		frappe.throw(_("{0} is already open ({1}, {2}) — close it first").format(counter, other, who), title=_("Counter in use"))
	mine = open_session_of()
	if mine:
		frappe.throw(_("You already have {0} open").format(mine))
	last = frappe.db.get_value("Cash Counter Session", {"counter": counter, "status": "Closed"}, "counted_balance",
		order_by="closed_at desc")
	s = frappe.get_doc({"doctype": "Cash Counter Session", "counter": counter, "cashier": frappe.session.user, "status": "Open",
		"opened_at": now_datetime(), "opening_balance": flt(last), "expected_balance": flt(last)})
	s.insert(ignore_permissions=True)
	return s.name


def _mine(name: str):
	s = frappe.get_doc("Cash Counter Session", name)
	if s.status != "Open":
		frappe.throw(_("{0} is closed").format(name))
	if s.cashier != frappe.session.user and not ({"System Manager", "Cane Admin"} & set(frappe.get_roles())):
		frappe.throw(_("{0} belongs to {1}").format(name, s.cashier), frappe.PermissionError)
	return s


def move(name: str, movement_type: str, amount, reference: str | None = None) -> frappe._dict:
	"""Cash received from / returned to the strong room."""
	_need()
	s = _mine(name)
	amount = flt(amount)
	if amount <= 0:
		frappe.throw(_("Enter the amount"))
	if movement_type not in ("Received from Strong Room", "Returned to Strong Room"):
		frappe.throw(_("Unknown movement"))
	if movement_type == "Returned to Strong Room" and amount > flt(refresh(name).expected_balance) + 0.001:
		frappe.throw(_("The till holds only {0}").format(frappe.format(refresh(name).expected_balance, "Currency")))
	till = frappe.db.get_value("Cash Counter", s.counter, "cash_account")
	room = frappe.db.get_single_value("Sugar Settings", "strong_room_account")
	if not till or not room:
		frappe.throw(_("Set the counter's cash account and the Strong Room Cash account in Sugar Settings"))
	cfg = frappe.get_cached_doc("Sugar Settings")
	inn = movement_type == "Received from Strong Room"
	at = now_datetime()
	je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Cash Entry", "company": cfg.company, "posting_date": at.date(),
		"title": f"{s.counter}: {movement_type}", "cheque_no": reference or s.name, "cheque_date": at.date(),
		"user_remark": f"{movement_type} — {s.counter}, session {s.name}{f', {reference}' if reference else ''}",
		"accounts": [
			{"account": till if inn else room, "debit_in_account_currency": amount, "cost_center": cfg.cost_center},
			{"account": room if inn else till, "credit_in_account_currency": amount, "cost_center": cfg.cost_center},
		]})
	je.flags.ignore_permissions = True
	je.insert()
	je.submit()
	s.append("movements", {"movement_type": movement_type, "amount": amount, "at": at, "reference": reference,
		"by_user": frappe.session.user, "journal_entry": je.name})
	s.flags.ignore_permissions = True
	s.save()
	return refresh(name)


def pay_many(name: str, bilties: list[str], received_by=None, received_by_cnic=None, payment_mode="Cash", wallet_number=None,
		wallet_txn_id=None) -> dict:
	"""Pay a basket of bilties from the session's counter, together: one batch, one recipient, one JazzCash TID."""
	from sugarcane.cane_procurement.procurement import pay_bilty

	_need()
	s = _mine(name)
	bilties = list(dict.fromkeys(b.strip().upper() for b in bilties if b and b.strip()))
	if not bilties:
		frappe.throw(_("Scan the bilties to pay"))
	rows = frappe.get_all("TPT Bilty", filters={"name": ["in", bilties]}, fields=["name", "status", "docstatus", "amount"])
	found = {r.name: r for r in rows}
	for b in bilties:
		r = found.get(b)
		if not r or r.docstatus != 1 or r.status != "Unpaid":
			frappe.throw(_("Bilty {0} is {1}").format(b, _(r.status) if r else _("not found")))
	total = sum(flt(r.amount) for r in rows)
	if payment_mode != "JazzCash" and total > flt(refresh(name).expected_balance) + 0.001:
		frappe.throw(_("Not enough cash in {0}: the till holds {1}, the bilties come to {2}. Receive cash from the strong room first.").format(
			s.counter, frappe.format(refresh(name).expected_balance, "Currency"), frappe.format(total, "Currency")), title=_("Not enough cash"))
	batch = frappe.generate_hash(length=10).upper()
	for b in bilties:
		pay_bilty(b, received_by, received_by_cnic, payment_mode=payment_mode, wallet_number=wallet_number,
			wallet_txn_id=wallet_txn_id, session=name, batch=batch)
	return {"batch": batch, "paid": bilties, "total": total, "mode": payment_mode, "session": refresh(name)}


def close(name: str, denominations: list[dict], note: str | None = None) -> frappe._dict:
	"""Count the till; post any short / excess; the counted cash is the closing (and next opening) balance."""
	_need()
	s = _mine(name)
	cur = refresh(name)
	s.set("denominations", [])
	counted = 0.0
	for d in denominations or []:
		den, cnt = cint(d.get("denomination")), cint(d.get("count"))
		if cnt <= 0:
			continue
		amt = cnt * (den or 1)
		counted += amt
		s.append("denominations", {"denomination": den, "count": cnt, "amount": amt})
	diff = round(counted - flt(cur.expected_balance), 2)
	if diff and not (note or "").strip():
		frappe.throw(_("The count is {0} {1} — give the reason").format(abs(diff), _("excess") if diff > 0 else _("short")))
	if diff:
		till = frappe.db.get_value("Cash Counter", s.counter, "cash_account")
		short_acc = frappe.db.get_single_value("Sugar Settings", "cash_short_excess_account")
		if not short_acc:
			frappe.throw(_("Set the Cash Short & Excess account in Sugar Settings"))
		cfg = frappe.get_cached_doc("Sugar Settings")
		je = frappe.get_doc({"doctype": "Journal Entry", "voucher_type": "Cash Entry", "company": cfg.company,
			"posting_date": now_datetime().date(), "title": f"{s.counter}: cash {'excess' if diff > 0 else 'short'}",
			"user_remark": f"{s.counter} close {s.name}: counted {counted:,.2f}, expected {flt(cur.expected_balance):,.2f}"
				+ (f" — {note}" if note else ""),
			"accounts": [
				{"account": till if diff > 0 else short_acc, "debit_in_account_currency": abs(diff), "cost_center": cfg.cost_center},
				{"account": short_acc if diff > 0 else till, "credit_in_account_currency": abs(diff), "cost_center": cfg.cost_center},
			]})
		je.flags.ignore_permissions = True
		je.insert()
		je.submit()
		s.difference_journal_entry = je.name
	s.update({"counted_balance": counted, "difference": diff, "close_note": (note or "").strip() or None, "status": "Closed",
		"closed_at": now_datetime(), **{k: cur[k] for k in ("received_total", "returned_total", "cash_paid_total", "cash_paid_count",
			"jazzcash_total", "jazzcash_count", "expected_balance")}})
	s.flags.ignore_permissions = True
	s.save()
	return frappe._dict(s.as_dict())


# ---------------------------------------------------------------- payee displays
def _key(screen: str) -> str:
	return f"sc_display:{screen}"


def display_push(screen: str, state: dict):
	state = {**(state or {}), "at": str(now_datetime()), "by": frappe.session.user}
	frappe.cache.set_value(_key(screen), json.dumps(state, default=str), expires_in_sec=6 * 3600)


def display_get(screen: str) -> dict:
	raw = frappe.cache.get_value(_key(screen))
	state = json.loads(raw) if raw else {}
	if screen.startswith("wb:"):
		from sugarcane.cane_procurement.procurement import latest_reading

		term = screen[3:]
		state["terminal"] = frappe.db.get_value("Weighbridge Terminal", term, ["name", "terminal_name"], as_dict=True)
		state["reading"] = latest_reading(term)
	elif screen.startswith("counter:"):
		c = frappe.db.get_value("Cash Counter", screen[8:], ["name", "display_title", "display_note"], as_dict=True)
		state["counter"] = c
	state["company"] = frappe.db.get_single_value("Sugar Settings", "company")
	return state


def ensure_counters(company: str):
	"""Cash Counter 1 (the existing cash counter account) and Cash Counter 2 (its own till account), if none exist yet."""
	if frappe.db.count("Cash Counter"):
		return
	from sugarcane.setup.accounts import _account, _parent_of

	s = frappe.get_cached_doc("Sugar Settings")
	abbr = frappe.get_cached_value("Company", company, "abbr")
	first = s.cash_counter_account
	if not first:
		return
	second = _account(company, abbr, "Cash Counter 2 - Cane", _parent_of(first), "Cash")
	for n, acc in ((1, first), (2, second)):
		frappe.get_doc({"doctype": "Cash Counter", "counter_name": f"Cash Counter {n}", "cash_account": acc, "is_active": 1,
			"display_title": f"TPT Cash Counter {n}", "display_note": "Show your bilty and CNIC · بلٹی اور شناختی کارڈ دکھائیں"}).insert(
			ignore_permissions=True)
