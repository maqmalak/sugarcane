"""Bank documents for paying growers (Phase 6), in the real-estate app's document style (letterhead, .re-doc, QR to the record):

payment_schedule     a scroll's payments grouped by the growers' banks: summary, a table per bank, total in words, signatures
unpaid_scroll        every unpaid CPR (to a date / circle), grouped by the grower's bank, with each CPR's age
instruction_letter   one letter per beneficiary bank to our bank: debit our account, credit the annexed accounts
stop_payment_letter  stop one grower's cheque / transfer of a scroll; the request is recorded on the scroll's payment line

Our bank, branch, account, IBAN, signatories and letterhead address are in Sugar Settings → Bank Letters.
"""

import base64
import io
from collections import OrderedDict

import frappe
from frappe import _
from frappe.utils import cint, date_diff, flt, fmt_money, formatdate, money_in_words, now_datetime

from sugarcane.cane_accounting.accounting import ACC_ROLES, unpaid_cprs

NO_BANK = "No bank account"
VIEW = ACC_ROLES | {"Cane Manager", "MIS Viewer"}


def _need(roles):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("Not allowed"), frappe.PermissionError)


def qr(text: str) -> str:
	import pyqrcode

	buf = io.BytesIO()
	pyqrcode.create(str(text)).svg(buf, scale=3, quiet_zone=2)
	return "data:image/svg+xml;base64," + base64.b64encode(buf.getvalue()).decode()


def app_url(path: str) -> str:
	"""Address of the React app (the QR opens the record there): `sugar_app_url` in site config, else this site + /sugar."""
	base = frappe.conf.get("sugar_app_url") or (frappe.utils.get_url().rstrip("/") + "/sugar")
	return base.rstrip("/") + path


def _ctx(**kw) -> dict:
	s = frappe.get_cached_doc("Sugar Settings")
	return {"company": s.company, "mill_address": s.get("mill_address") or "", "mill_phone": s.get("mill_phone") or "",
		"payer_bank_name": s.get("payer_bank_name"), "payer_branch": s.get("payer_branch"), "payer_account_title": s.get("payer_account_title"),
		"payer_account_no": s.get("payer_account_no"), "payer_iban": s.get("payer_iban"), "signatory_1": s.get("signatory_1"),
		"signatory_2": s.get("signatory_2"), "printed_at": now_datetime().strftime("%d %b %Y %H:%M"),
		"printed_by": frappe.utils.get_fullname(frappe.session.user), "money": lambda v: fmt_money(flt(v), precision=2),
		"words": lambda v: money_in_words(flt(v), "PKR"), "fmt_date": lambda d: formatdate(d, "dd MMM yyyy") if d else "", **kw}


def _pdf(template: str, ctx: dict) -> bytes:
	from frappe.utils.pdf import get_pdf

	html = frappe.render_template(f"sugarcane/templates/bank/{template}.html", ctx)
	return get_pdf(html, {"page-size": "A4", "margin-top": "10mm", "margin-bottom": "12mm", "margin-left": "10mm", "margin-right": "10mm"})


def _prefix():
	return frappe.db.get_single_value("Sugar Settings", "letter_ref_prefix") or "MSML/CANE"


def _bank_code(bank: str) -> str:
	return "".join(w[0] for w in (bank or "X").replace("-", " ").split() if w[:1].isalnum()).upper()[:6] or "X"


def scroll_groups(doc) -> list[dict]:
	"""The scroll's payment lines grouped by beneficiary bank (banks A–Z, 'No bank account' last)."""
	cprs = {}
	for it in doc.items:
		cprs.setdefault(it.grower, []).append(it.cpr)
	groups = OrderedDict()
	for p in doc.payments:
		bank = (p.bank_name or "").strip() if p.iban else ""
		g = groups.setdefault(bank or NO_BANK, {"bank": bank or NO_BANK, "rows": [], "amount": 0.0, "cprs": 0})
		row = frappe._dict(p.as_dict())
		row.cpr_list = " ".join(cprs.get(p.grower, []))
		g["rows"].append(row)
		g["amount"] = flt(g["amount"] + flt(p.amount), 2)
		g["cprs"] += cint(p.cprs)
	out = sorted(groups.values(), key=lambda g: (g["bank"] == NO_BANK, g["bank"]))
	for g in out:
		g["ref"] = f"{_prefix()}/{doc.name}/{_bank_code(g['bank'])}"
		g["rows"].sort(key=lambda r: (r.account_title or r.grower_name or ""))
	return out


def payment_schedule(name: str) -> tuple[str, bytes]:
	_need(VIEW)
	doc = frappe.get_doc("Cane Payment Scroll", name)
	pdf = _pdf("payment_schedule", _ctx(doc=doc, groups=scroll_groups(doc), qr=qr(app_url(f"/accounts/scroll?name={doc.name}"))))
	return f"Payment schedule {doc.name}.pdf", pdf


def instruction_letters(name: str, bank: str | None = None) -> tuple[str, bytes]:
	"""One letter per beneficiary bank (or just `bank`). Growers without bank details are left out — they are paid by cheque."""
	_need(VIEW)
	doc = frappe.get_doc("Cane Payment Scroll", name)
	groups = [g for g in scroll_groups(doc) if g["bank"] != NO_BANK and (not bank or g["bank"] == bank)]
	if not groups:
		frappe.throw(_("Scroll {0} has no payments to a bank account{1}").format(doc.name, f" with {bank}" if bank else ""))
	for g in groups:  # a stopped line is not sent to the bank
		g["rows"] = [r for r in g["rows"] if not r.stop_requested]
		g["amount"] = flt(sum(flt(r.amount) for r in g["rows"]), 2)
	groups = [g for g in groups if g["rows"]]
	pdf = _pdf("instruction_letter", _ctx(doc=doc, groups=groups, qr=qr(app_url(f"/accounts/scroll?name={doc.name}"))))
	return f"Bank instructions {doc.name}{' ' + bank if bank else ''}.pdf", pdf


def unpaid_scroll(to_date=None, circle=None, as_on=None) -> tuple[str, bytes]:
	from sugarcane.api.v1.accounts import as_on_default

	_need(VIEW)
	d = as_on_default(as_on)
	rows = unpaid_cprs(to_date=to_date or None, circle=circle or None, limit=5000)
	by_grower = OrderedDict()
	for r in rows:
		g = by_grower.setdefault(r.grower, frappe._dict(grower=r.grower, grower_name=r.grower_name, circle=r.circle, iban=r.iban,
			bank=(r.bank_name or "").strip() if r.iban else "", cprs=[], amount=0.0, loan=0.0))
		g.cprs.append(frappe._dict(name=r.name, posting_date=r.posting_date, days=max(date_diff(d, r.posting_date), 0)))
		g.amount = flt(g.amount + flt(r.payable_cpr), 2)
		g.loan = flt(g.loan + flt(r.loan_deduction), 2)
	cnic = dict(frappe.get_all("Grower", filters={"name": ["in", list(by_grower) or [""]]}, fields=["name", "cnic"], as_list=True))
	groups = OrderedDict()
	for g in by_grower.values():
		g.cnic = cnic.get(g.grower)
		b = groups.setdefault(g.bank or NO_BANK, {"bank": g.bank or NO_BANK, "rows": [], "amount": 0.0, "cprs": 0, "oldest": 0, "loan": 0.0})
		b["rows"].append(g)
		b["amount"] = flt(b["amount"] + g.amount, 2)
		b["loan"] = flt(b["loan"] + g.loan, 2)
		b["cprs"] += len(g.cprs)
		b["oldest"] = max(b["oldest"], max(c.days for c in g.cprs))
	out = sorted(groups.values(), key=lambda g: (g["bank"] == NO_BANK, g["bank"]))
	for g in out:
		g["rows"].sort(key=lambda r: r.grower_name or "")
	from sugarcane.cane_accounting.accounting import bank_balances

	banks = bank_balances()
	pdf = _pdf("unpaid_scroll", _ctx(groups=out, as_on=d, upto=to_date, circle=circle, growers=len(by_grower), cprs=len(rows),
		total=flt(sum(g["amount"] for g in out), 2), loans=flt(sum(g["loan"] for g in out), 2), banks=banks,
		available=flt(sum(b["available"] for b in banks), 2), qr=qr(app_url("/accounts/scroll"))))
	return f"Unpaid CPR scroll {d}.pdf", pdf


def stop_payment(name: str, grower: str, reason: str, instrument: str | None = None) -> tuple[str, bytes]:
	"""Record a stop-payment request on the scroll's line for the grower and print the letter to our bank. The payment entry
	stays as it is; cancel the scroll (or reverse the payment) once the bank confirms the stop."""
	_need(ACC_ROLES)
	if not (reason or "").strip():
		frappe.throw(_("Give the reason for stopping the payment"))
	doc = frappe.get_doc("Cane Payment Scroll", name)
	if doc.docstatus != 1:
		frappe.throw(_("Scroll {0} is not paid yet — just take the CPRs off it").format(name))
	p = next((r for r in doc.payments if r.grower == grower), None)
	if not p:
		frappe.throw(_("Grower {0} is not on scroll {1}").format(grower, name))
	n = 1 + cint(frappe.db.sql("""select count(*) from `tabCane Payment Scroll Payment` where stop_requested = 1 and parent = %s""", name)[0][0])
	ref = p.stop_letter_no or f"{_prefix()}/STOP/{doc.name}/{n:02d}"
	if not p.stop_requested:
		p.db_set({"stop_requested": 1, "stop_reason": reason, "stop_requested_on": now_datetime(), "stop_letter_no": ref})
		doc.add_comment("Info", _("Stop payment requested for {0} ({1}): {2} — letter {3}").format(p.grower_name, fmt_money(p.amount, precision=2),
			frappe.utils.escape_html(reason), ref))
	instrument = instrument or (doc.reference_no if doc.mode_of_payment == "Cheque" else f"{doc.reference_no or doc.name}/{p.grower}")
	pdf = _pdf("stop_payment_letter", _ctx(doc=doc, p=p, ref=ref, reason=reason, on=now_datetime().date(), instrument=instrument,
		qr=qr(app_url(f"/accounts/scroll?name={doc.name}"))))
	return f"Stop payment {doc.name} {p.grower}.pdf", pdf
