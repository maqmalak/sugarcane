# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Grower / driver messages (SMS or WhatsApp) and the keyword replies.

Every message is a *Sugar SMS Log* row (insert-only). An event (indent issued, CPR posted, payment sent…) renders the
active *Sugar SMS Template* for that event and language — or the built-in text — for the grower's mobile.

- Gateway **Mock**: the message is logged as *Mocked* at once; nothing leaves the server (the demo and the tests).
- A real gateway: the row is *Queued* and the scheduler sends it (`flush_queue`, every few minutes), outside quiet hours.
  Keyword replies go at once.
- A number gets at most *daily cap* messages a day; a bad number is logged as *Skipped*.
- Test mode (a test number in Sugar Settings) sends everything to that number.

Sending never breaks the business transaction: a failure is logged, the CPR / scroll still posts.
"""
import re

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, fmt_money, formatdate, get_datetime, getdate, now_datetime, nowdate

GSM = 160
UNICODE = 70
EVENTS = ("Indent Issued", "Indent Expiring", "Token Issued", "CPR Posted", "Bilty Ready", "Payment Sent", "Loan Disbursed",
	"Loan Markup", "Survey Recorded", "Keyword Reply", "Custom")

# built-in texts: (English, Roman Urdu, Urdu). A Sugar SMS Template for the event and language replaces them.
DEFAULTS = {
	"Indent Issued": (
		"{{ mill }}: Indent {{ indent }} for {{ load_maund }} maund issued. Valid {{ valid_from }} to {{ valid_to }}. Bring it with your cane.",
		"{{ mill }}: Indent {{ indent }} ({{ load_maund }} mann) jari. {{ valid_from }} se {{ valid_to }} tak kaar-amad. Ganna ke sath laayen.",
		"{{ mill }}: انڈینٹ {{ indent }} ({{ load_maund }} من) جاری۔ {{ valid_from }} سے {{ valid_to }} تک کارآمد۔"),
	"Indent Expiring": (
		"{{ mill }}: Indent {{ indent }} expires on {{ valid_to }}. Supply your cane before then.",
		"{{ mill }}: Indent {{ indent }} {{ valid_to }} ko khatam. Is se pehle ganna laayen.",
		"{{ mill }}: انڈینٹ {{ indent }} کی مدت {{ valid_to }} کو ختم۔ اس سے پہلے گنا لائیں۔"),
	"Token Issued": (
		"{{ mill }}: Your cane on {{ vehicle_no }} reached the gate, token {{ token }} at {{ time }}.",
		"{{ mill }}: Aap ka ganna {{ vehicle_no }} gate par pohanch gaya, token {{ token }} {{ time }}.",
		"{{ mill }}: آپ کا گنا {{ vehicle_no }} گیٹ پر پہنچ گیا، ٹوکن {{ token }}۔"),
	"CPR Posted": (
		"{{ mill }}: CPR {{ cpr }} {{ day }}: {{ maund }} maund, value Rs {{ value }}, payable Rs {{ amount }}{% if loan %} after loan Rs {{ loan }}{% endif %}.",
		"{{ mill }}: CPR {{ cpr }} {{ day }}: {{ maund }} mann, qeemat Rs {{ value }}, qabil-e-adaigi Rs {{ amount }}{% if loan %} (qarz Rs {{ loan }} kata){% endif %}.",
		"{{ mill }}: سی پی آر {{ cpr }} {{ day }}: {{ maund }} من، قابل ادائیگی {{ amount }} روپے۔"),
	"Bilty Ready": (
		"{{ mill }}: Bilty {{ bilty }} for {{ vehicle_no }}: {{ maund }} maund x {{ rate }} = Rs {{ amount }}. Collect at the cane cash counter.",
		"{{ mill }}: Bilty {{ bilty }} ({{ vehicle_no }}): {{ maund }} mann x {{ rate }} = Rs {{ amount }}. Cash counter se wusool karen.",
		"{{ mill }}: بلٹی {{ bilty }} ({{ vehicle_no }}): {{ amount }} روپے۔ کیش کاؤنٹر سے وصول کریں۔"),
	"Payment Sent": (
		"{{ mill }}: Rs {{ amount }} for {{ cprs }} CPR(s) paid {{ mode }} to {{ bank }} on {{ day }}. Ref {{ scroll }}.",
		"{{ mill }}: {{ cprs }} CPR ki Rs {{ amount }} adaigi {{ day }} ko {{ bank }} mein. Ref {{ scroll }}.",
		"{{ mill }}: {{ cprs }} سی پی آر کی {{ amount }} روپے ادائیگی {{ day }} کو {{ bank }} میں۔"),
	"Loan Disbursed": (
		"{{ mill }}: Loan {{ loan }} of Rs {{ amount }} disbursed on {{ day }}. Markup {{ markup }}% a year; {{ recovery }}% of each CPR recovers it.",
		"{{ mill }}: Qarz {{ loan }} Rs {{ amount }} {{ day }} ko jari. Markup {{ markup }}% salana; har CPR se {{ recovery }}% wusooli.",
		"{{ mill }}: قرض {{ loan }} کے {{ amount }} روپے {{ day }} کو جاری۔"),
	"Loan Markup": (
		"{{ mill }}: Markup Rs {{ amount }} added to loan {{ loan }} for {{ month }}. Outstanding Rs {{ outstanding }}.",
		"{{ mill }}: Qarz {{ loan }} par {{ month }} ka markup Rs {{ amount }}. Baqaya Rs {{ outstanding }}.",
		"{{ mill }}: قرض {{ loan }} پر {{ month }} کا مارک اپ {{ amount }} روپے۔ بقایا {{ outstanding }}۔"),
	"Survey Recorded": (
		"{{ mill }}: Your field {{ survey }} ({{ acres }} acre, {{ variety }}) is surveyed for {{ season }}.",
		"{{ mill }}: Aap ka khet {{ survey }} ({{ acres }} acre, {{ variety }}) {{ season }} ke liye survey ho gaya.",
		"{{ mill }}: آپ کا کھیت {{ survey }} ({{ acres }} ایکڑ) سروے ہو گیا۔"),
	"Keyword Reply": ("{{ reply }}", "{{ reply }}", "{{ reply }}"),
	"Custom": ("{{ text }}", "{{ text }}", "{{ text }}"),
}
LANG_INDEX = {"English": 0, "Roman Urdu": 1, "Urdu": 2}

SAMPLE = {
	"mill": "MicroMax", "indent": "IND-2026-00123", "load_maund": "600", "valid_from": "05-11-2026", "valid_to": "08-11-2026",
	"token": "TKN-2026-00456", "vehicle_no": "LHR-4521", "time": "09:42", "cpr": "CPR-2026-00456", "day": "05-11-2026",
	"maund": "612.5", "value": "245,000", "amount": "238,140", "loan": "", "bilty": "BLT-2026-00456", "rate": "12.00",
	"cprs": "3", "mode": "by bank transfer", "bank": "HBL ****1234", "scroll": "CPS-2026-0004", "markup": "12",
	"recovery": "50", "month": "October 2026", "outstanding": "148,500", "survey": "SRV-0091", "acres": "4.5",
	"variety": "CPF-246", "season": "2026-27", "reply": "MicroMax: balance Rs 238,140 unpaid on 2 CPRs.", "text": "Message text",
	"grower_name": "Muhammad Ali",
}


# ---------------------------------------------------------------- helpers
def cfg() -> frappe._dict:
	s = frappe.get_cached_doc("Sugar Settings")
	return frappe._dict(
		enabled=cint(s.get("sms_enabled")), gateway=s.get("sms_gateway") or "Mock", sender=s.get("sms_sender") or "MICROMAX",
		language=s.get("sms_language") or "English", test_number=normalise(s.get("sms_test_number")),
		quiet_from=cint(s.get("sms_quiet_from")), quiet_to=cint(s.get("sms_quiet_to")), cap=cint(s.get("sms_daily_cap")),
		mill=((s.get("company") or "").split() or ["MicroMax"])[0],
	)


def normalise(mobile) -> str | None:
	"""Pakistani mobile to 923XXXXXXXXX: 0300-1234567, 3001234567, +92 300 1234567, 0092… ; anything else is None."""
	d = re.sub(r"\D", "", str(mobile or ""))
	if d.startswith("0092"):
		d = d[2:]
	if len(d) == 11 and d.startswith("03"):
		d = "92" + d[1:]
	elif len(d) == 10 and d.startswith("3"):
		d = "92" + d
	return d if len(d) == 12 and d.startswith("923") else None


def segments(text: str) -> int:
	"""SMS parts: 160 / 153 characters (GSM), 70 / 67 when the text has Urdu or other non-GSM letters."""
	n = len(text or "")
	if not n:
		return 0
	single, multi = (GSM, 153) if all(ord(c) < 128 for c in text) else (UNICODE, 67)
	return 1 if n <= single else -(-n // multi)


def money(v) -> str:
	return fmt_money(flt(v), precision=0)


def template_for(event: str, language: str, audience: str | None = None):
	filters = {"event": event, "is_active": 1}
	for lang in (language, "English"):
		for aud in ([audience] if audience else []) + [None]:
			f = {**filters, "language": lang, **({"audience": aud} if aud else {})}
			name = frappe.db.get_value("Sugar SMS Template", f, "name", order_by="modified desc")
			if name:
				return frappe.get_cached_doc("Sugar SMS Template", name)
	return None


def body_for(event: str, language: str, audience: str | None = None) -> tuple[str, str | None]:
	t = template_for(event, language, audience)
	if t:
		return t.body, t.name
	texts = DEFAULTS.get(event) or DEFAULTS["Custom"]
	return texts[LANG_INDEX.get(language, 0)], None


def render(body: str, ctx: dict) -> str:
	return re.sub(r"[ \t]+", " ", frappe.render_template(body or "", ctx)).strip()


def render_sample(template) -> str:
	return render(template.body, {**SAMPLE, "mill": cfg().mill})


def quiet(c=None, at=None) -> bool:
	c = c or cfg()
	if c.quiet_from == c.quiet_to:
		return False
	h = get_datetime(at or now_datetime()).hour
	return (c.quiet_from <= h or h < c.quiet_to) if c.quiet_from > c.quiet_to else (c.quiet_from <= h < c.quiet_to)


def sent_today(mobile: str) -> int:
	return frappe.db.count("Sugar SMS Log", {"mobile": mobile, "direction": "Out", "queued_at": [">=", nowdate()],
		"status": ["in", ["Queued", "Sent", "Mocked"]]})


# ---------------------------------------------------------------- sending
def send(event: str, mobile, ctx: dict | None = None, *, grower=None, party_name=None, audience="Grower", reference=None,
		language=None, text=None, immediate=False, in_reply_to=None, is_demo=0) -> str | None:
	"""Log (and send / queue) one message. Returns the log name, or None when messaging is off."""
	c = cfg()
	if not c.enabled or frappe.flags.sugar_sms_off:  # the demo generator turns messages off and replays them afterwards
		return None
	language = language or c.language
	if text is None:
		body, template = body_for(event, language, audience)
		message = render(body, {**SAMPLE_BLANK, "mill": c.mill, **(ctx or {})})
	else:
		message, template = text, None
	to = normalise(mobile)
	log = frappe.get_doc({
		"doctype": "Sugar SMS Log", "direction": "Out", "event": event, "mobile": to or str(mobile or "")[:20], "grower": grower,
		"party_name": party_name, "reference_doctype": reference[0] if reference else None,
		"reference_name": reference[1] if reference else None, "channel": "WhatsApp" if c.gateway == "WhatsApp" else "SMS",
		"language": language, "template": template, "queued_at": now_datetime(), "message": message,
		"segments": segments(message), "in_reply_to": in_reply_to, "is_demo": cint(is_demo), "status": "Queued",
	})
	if not to:
		log.status, log.response = "Skipped", _("No valid mobile number")
	elif not message:
		log.status, log.response = "Skipped", _("Empty message")
	elif c.cap and event != "Keyword Reply" and not frappe.flags.sugar_sms_nocap and sent_today(to) >= c.cap:
		log.status, log.response = "Skipped", _("Daily limit of {0} messages reached").format(c.cap)
	log.flags.ignore_permissions = True
	log.insert()
	if log.status == "Queued" and (c.gateway == "Mock" or immediate):
		dispatch(log, c)
	return log.name


SAMPLE_BLANK = {k: "" for k in SAMPLE}


def dispatch(log, c=None):
	"""Hand one queued message to the gateway and record the outcome."""
	c = c or cfg()
	to = c.test_number or log.mobile
	note = _("test mode: sent to {0} instead of {1}").format(to, log.mobile) if c.test_number and to != log.mobile else ""
	status, response = "Sent", note
	try:
		if c.gateway == "Mock":
			status = "Mocked"
		elif c.gateway == "Frappe SMS Settings":
			from frappe.core.doctype.sms_settings.sms_settings import send_via_gateway

			send_via_gateway({"receiver_list": [to], "message": log.message, "success_msg": False})
		elif c.gateway == "WhatsApp":
			if not frappe.db.exists("DocType", "WhatsApp Message"):
				raise frappe.ValidationError(_("The WhatsApp app is not installed on this site"))
			frappe.get_doc({"doctype": "WhatsApp Message", "type": "Outgoing", "to": to, "message": log.message,
				"content_type": "text", "reference_doctype": log.reference_doctype, "reference_name": log.reference_name}
			).insert(ignore_permissions=True)
	except Exception as e:
		status, response = "Failed", (str(e) or e.__class__.__name__)[:500]
	frappe.db.set_value("Sugar SMS Log", log.name, {"status": status, "response": response,
		"sent_at": now_datetime() if status != "Failed" else None, "attempts": cint(log.attempts) + 1}, update_modified=False)


def flush_queue(limit: int = 200):
	"""Scheduler: send what is queued (outside quiet hours); a failed message is tried three times."""
	c = cfg()
	if not c.enabled or quiet(c):
		return 0
	rows = frappe.get_all("Sugar SMS Log", filters={"direction": "Out", "status": ["in", ["Queued", "Failed"]], "attempts": ["<", 3]},
		fields=["name", "mobile", "message", "attempts", "reference_doctype", "reference_name"], order_by="queued_at asc", limit=limit)
	for r in rows:
		dispatch(r, c)
	return len(rows)  # the scheduler commits after the job


def safe(fn):
	"""doc_event wrapper: a messaging failure is logged, never raised into the business transaction."""
	def wrapper(doc, method=None):
		try:
			fn(doc)
		except Exception:
			frappe.log_error(title=f"Sugar SMS: {fn.__name__} {doc.doctype} {doc.name}")
	wrapper.__name__ = fn.__name__
	return wrapper


def _grower(name):
	return frappe.db.get_value("Grower", name, ["name", "grower_name", "mobile"], as_dict=True) or frappe._dict()


# ---------------------------------------------------------------- events (hooks.py doc_events)
@safe
def indent_submitted(doc):
	g = _grower(doc.grower)
	send("Indent Issued", g.mobile, {"indent": doc.name, "load_maund": cint(doc.load_maund), "grower_name": doc.grower_name,
		"valid_from": formatdate(doc.valid_from), "valid_to": formatdate(doc.valid_to)},
		grower=doc.grower, party_name=doc.grower_name, reference=(doc.doctype, doc.name), is_demo=doc.is_demo)


@safe
def token_submitted(doc):
	if not doc.grower:
		return
	g = _grower(doc.grower)
	send("Token Issued", g.mobile, {"token": doc.name, "vehicle_no": doc.vehicle_no, "grower_name": doc.grower_name,
		"time": get_datetime(doc.issued_at or now_datetime()).strftime("%H:%M")},
		grower=doc.grower, party_name=doc.grower_name, reference=(doc.doctype, doc.name), is_demo=doc.is_demo)


@safe
def cpr_submitted(doc):
	g = _grower(doc.grower)
	send("CPR Posted", g.mobile, {"cpr": doc.name, "day": formatdate(doc.posting_date), "maund": f"{flt(doc.payable_maund, 2):g}",
		"value": money(doc.govt_value), "amount": money(doc.payable_cpr), "grower_name": doc.grower_name,
		"loan": money(doc.loan_deduction) if flt(doc.loan_deduction) else ""},
		grower=doc.grower, party_name=doc.grower_name, reference=(doc.doctype, doc.name), is_demo=doc.is_demo)


@safe
def bilty_submitted(doc):
	send("Bilty Ready", doc.driver_mobile, {"bilty": doc.name, "vehicle_no": doc.vehicle_no, "maund": f"{flt(doc.payable_maund, 2):g}",
		"rate": f"{flt(doc.tpt_rate):.2f}", "amount": money(doc.amount), "grower_name": doc.grower_name},
		party_name=doc.driver_name, audience="Driver", reference=(doc.doctype, doc.name), is_demo=doc.is_demo)


@safe
def scroll_submitted(doc):
	mode = _("by cheque") if "cheque" in (doc.mode_of_payment or "").lower() else _("by bank transfer")
	for p in doc.payments:
		g = _grower(p.grower)
		iban = (p.iban or "").replace(" ", "")
		bank = " ".join(x for x in (p.bank_name, f"****{iban[-4:]}" if iban else "") if x) or _("your account")
		send("Payment Sent", g.mobile, {"amount": money(p.amount), "cprs": cint(p.cprs),
			"mode": mode, "bank": bank, "day": formatdate(doc.posting_date), "scroll": doc.name, "grower_name": p.grower_name},
			grower=p.grower, party_name=p.grower_name, reference=(doc.doctype, doc.name), is_demo=doc.is_demo)


def loan_disbursed(loan):
	try:
		g = _grower(loan.grower)
		send("Loan Disbursed", g.mobile, {"loan": loan.name, "amount": money(loan.amount), "day": formatdate(loan.disbursed_on),
			"markup": f"{flt(loan.markup_pct):g}", "recovery": f"{flt(loan.recovery_pct):g}", "grower_name": loan.grower_name},
			grower=loan.grower, party_name=loan.grower_name, reference=("Grower Loan", loan.name), is_demo=loan.is_demo)
	except Exception:
		frappe.log_error(title=f"Sugar SMS: loan_disbursed {loan.name}")


def remind_expiring():
	"""Daily: indents that end tomorrow and are still unused get a reminder (once)."""
	day = add_days(nowdate(), 1)
	rows = frappe.get_all("Cane Indent", filters={"docstatus": 1, "status": ["in", ["Authorized", "Printed"]], "valid_to": day},
		fields=["name", "grower", "grower_name", "valid_to", "is_demo"])
	done = set(frappe.get_all("Sugar SMS Log", filters={"event": "Indent Expiring", "reference_doctype": "Cane Indent",
		"reference_name": ["in", [r.name for r in rows] or [""]]}, pluck="reference_name"))
	for r in rows:
		if r.name not in done:
			send("Indent Expiring", _grower(r.grower).mobile, {"indent": r.name, "valid_to": formatdate(r.valid_to), "grower_name": r.grower_name},
				grower=r.grower, party_name=r.grower_name, reference=("Cane Indent", r.name), is_demo=r.is_demo)


# ---------------------------------------------------------------- inbound keywords
def grower_by_mobile(mobile):
	to = normalise(mobile)
	if not to:
		return None
	tail = to[-10:]
	for r in frappe.get_all("Grower", filters={"mobile": ["like", f"%{tail[-7:]}%"], "disabled": 0}, fields=["name", "grower_name", "mobile"]):
		if normalise(r.mobile) == to:
			return r
	return None


def keyword_reply(action: str, grower) -> str:
	mill = cfg().mill
	g = grower.name
	if action == "Balance":
		unpaid = frappe.db.sql("""select count(*) n, coalesce(sum(payable_cpr), 0) amt from `tabCane Purchase Receipt`
			where grower = %s and docstatus = 1 and payment_status = 'Unpaid'""", g, as_dict=True)[0]
		loan = flt(frappe.db.sql("""select coalesce(sum(outstanding), 0) from `tabGrower Loan` where grower = %s and docstatus = 1
			and status = 'Disbursed'""", g)[0][0])
		text = _("{0}: {1}, unpaid Rs {2} on {3} CPR(s).").format(mill, grower.grower_name, money(unpaid.amt), unpaid.n)
		return text + (_(" Loan outstanding Rs {0}.").format(money(loan)) if loan else "")
	if action == "Last CPR":
		c = frappe.get_all("Cane Purchase Receipt", filters={"grower": g, "docstatus": 1}, order_by="posted_at desc, name desc", limit=1,
			fields=["name", "posting_date", "payable_maund", "payable_cpr", "payment_status"])
		if not c:
			return _("{0}: no CPR yet this season.").format(mill)
		c = c[0]
		return _("{0}: CPR {1} {2}: {3} maund, Rs {4}, {5}.").format(mill, c.name, formatdate(c.posting_date), flt(c.payable_maund, 2),
			money(c.payable_cpr), _(c.payment_status).lower())
	if action == "Indent":
		rows = frappe.get_all("Cane Indent", filters={"grower": g, "docstatus": 1, "status": ["in", ["Authorized", "Printed"]],
			"valid_to": [">=", nowdate()]}, fields=["name", "valid_from", "valid_to", "load_maund"], order_by="valid_from asc", limit=3)
		if not rows:
			return _("{0}: no open indent. Your next indent will be sent by SMS.").format(mill)
		return _("{0}: open indents: {1}.").format(mill, "; ".join(
			f"{r.name} {cint(r.load_maund)}md {formatdate(r.valid_from)}-{formatdate(r.valid_to)}" for r in rows))
	if action == "Loan":
		rows = frappe.get_all("Grower Loan", filters={"grower": g, "docstatus": 1, "status": "Disbursed"},
			fields=["name", "outstanding"], order_by="disbursed_on asc")
		if not rows:
			return _("{0}: no loan outstanding.").format(mill)
		return _("{0}: loan outstanding {1}.").format(mill, "; ".join(f"{r.name} Rs {money(r.outstanding)}" for r in rows))
	if action == "Payment":
		p = frappe.db.sql("""select s.name, s.posting_date, p.amount from `tabCane Payment Scroll Payment` p
			join `tabCane Payment Scroll` s on s.name = p.parent where s.docstatus = 1 and p.grower = %s
			order by s.posting_date desc, s.name desc limit 1""", g, as_dict=True)
		if not p:
			return _("{0}: no payment yet this season.").format(mill)
		return _("{0}: last payment Rs {1} on {2}, ref {3}.").format(mill, money(p[0].amount), formatdate(p[0].posting_date), p[0].name)
	return help_text()


def help_text() -> str:
	keys = frappe.get_all("SMS Keyword", filters={"is_active": 1}, pluck="keyword", order_by="keyword asc")
	return _("{0}: send {1}").format(cfg().mill, ", ".join(k for k in keys if k != "HELP") or "BAL")


def receive(mobile, message, is_demo=0) -> dict:
	"""An incoming message: log it, answer its keyword (first word) and log the reply."""
	c = cfg()
	inbound = frappe.get_doc({"doctype": "Sugar SMS Log", "direction": "In", "status": "Sent", "event": "Keyword",
		"mobile": normalise(mobile) or str(mobile or "")[:20], "message": (message or "")[:1000], "queued_at": now_datetime(),
		"sent_at": now_datetime(), "segments": segments(message or ""), "is_demo": cint(is_demo),
		"channel": "WhatsApp" if c.gateway == "WhatsApp" else "SMS"})
	grower = grower_by_mobile(mobile)
	if grower:
		inbound.grower, inbound.party_name = grower.name, grower.grower_name
	inbound.flags.ignore_permissions = True
	inbound.insert()
	word = ((message or "").strip().split() or [""])[0].upper()
	kw = frappe.db.get_value("SMS Keyword", {"keyword": word, "is_active": 1}, ["action", "reply_template"], as_dict=True)
	if not grower:
		reply = _("{0}: this number is not registered. Visit your circle office to update your mobile.").format(c.mill)
	elif not kw:
		reply = help_text()
	else:
		reply = keyword_reply(kw.action, grower)
		if kw.reply_template:
			reply = render(frappe.db.get_value("Sugar SMS Template", kw.reply_template, "body"),
				{"mill": c.mill, "reply": reply, "grower_name": grower.grower_name})
	inbound.db_set("response", (kw.action if kw and grower else "") or "", update_modified=False)
	out = send("Keyword Reply", mobile, text=reply, grower=grower.name if grower else None,
		party_name=grower.grower_name if grower else None, immediate=True, in_reply_to=inbound.name, is_demo=is_demo)
	return {"in": inbound.name, "out": out, "reply": reply, "grower": grower.name if grower else None}
