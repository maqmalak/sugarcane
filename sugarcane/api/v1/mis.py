# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""MIS wall (/sugar/mis) and the messaging page (/sugar/messages)."""
import frappe
from frappe import _
from frappe.utils import cint, getdate

from sugarcane import sms
from sugarcane.sugar_mis import live

VIEW = {"System Manager", "Cane Admin", "Cane Manager", "MIS Viewer", "Cane Accountant", "Production Manager", "Lab Chemist", "Yard Supervisor"}
MSG = {"System Manager", "Cane Admin", "Cane Manager"}


def _need(roles, what):
	if not roles & set(frappe.get_roles()):
		frappe.throw(_("You are not allowed to {0}").format(what), frappe.PermissionError)


@frappe.whitelist(methods=["GET"])
def snapshot(day: str | None = None) -> dict:
	_need(VIEW, _("see the MIS"))
	return live.snapshot(day)


@frappe.whitelist(methods=["GET"])
def circles(season: str | None = None) -> list:
	_need(VIEW, _("see the MIS"))
	from sugarcane.cane_procurement.procurement import settings

	return live.circle_performance(season or settings().season)


# ---------------------------------------------------------------- messages
def _settings():
	c = sms.cfg()
	s = frappe.get_cached_doc("Sugar Settings")
	return {"enabled": c.enabled, "gateway": c.gateway, "sender": c.sender, "language": c.language,
		"test_number": s.get("sms_test_number") or "", "quiet_from": c.quiet_from, "quiet_to": c.quiet_to, "cap": c.cap,
		"quiet_now": sms.quiet(c), "has_token": bool(s.get_password("sms_inbound_token", raise_exception=False)),
		"whatsapp_installed": bool(frappe.db.exists("DocType", "WhatsApp Message"))}


@frappe.whitelist(methods=["GET"])
def messages(status: str | None = None, event: str | None = None, direction: str | None = None, q: str | None = None,
		limit: int = 100) -> dict:
	_need(VIEW, _("see messages"))
	f = {k: v for k, v in (("status", status), ("event", event), ("direction", direction)) if v}
	or_f = [["mobile", "like", f"%{q}%"], ["party_name", "like", f"%{q}%"], ["reference_name", "like", f"%{q}%"],
		["grower", "like", f"%{q}%"]] if q else None
	rows = frappe.get_all("Sugar SMS Log", filters=f, or_filters=or_f, fields=["name", "direction", "status", "event", "mobile", "grower",
		"party_name", "reference_doctype", "reference_name", "channel", "language", "queued_at", "sent_at", "message", "segments",
		"response", "in_reply_to"], order_by="queued_at desc, creation desc", limit=cint(limit) or 100)
	stats = frappe.db.sql("""select event, status, count(*) n, sum(segments) parts from `tabSugar SMS Log` where direction = 'Out'
		group by event, status""", as_dict=True)
	templates = frappe.get_all("Sugar SMS Template", fields=["name", "event", "language", "channel", "audience", "is_active", "body",
		"chars", "segments"], order_by="event asc, language asc")
	keywords = frappe.get_all("SMS Keyword", fields=["name", "keyword", "action", "is_active", "description", "reply_template"],
		order_by="keyword asc")
	return {"rows": rows, "stats": stats, "templates": templates, "keywords": keywords, "settings": _settings(),
		"events": list(sms.EVENTS), "defaults": {k: v[0] for k, v in sms.DEFAULTS.items()}, "sample": sms.SAMPLE}


@frappe.whitelist(methods=["POST"])
def preview(body: str, event: str | None = None) -> dict:
	_need(VIEW, _("see messages"))
	text = sms.render(body, {**sms.SAMPLE, "mill": sms.cfg().mill})
	return {"text": text, "chars": len(text), "segments": sms.segments(text)}


@frappe.whitelist(methods=["POST"])
def save_template(event: str, language: str, body: str, name: str | None = None, audience: str | None = None,
		channel: str | None = None, is_active: int = 1) -> dict:
	_need(MSG, _("change message templates"))
	doc = frappe.get_doc("Sugar SMS Template", name) if name else frappe.new_doc("Sugar SMS Template")
	if not name:
		doc.template_name = f"{event} - {language}" + (f" - {audience}" if audience and audience != "Grower" else "")
	doc.update({"event": event, "language": language, "body": body, "audience": audience or "Grower", "channel": channel or "SMS",
		"is_active": cint(is_active)})
	doc.save()
	return doc.as_dict()


@frappe.whitelist(methods=["POST"])
def test_send(mobile: str, event: str | None = None, text: str | None = None) -> dict:
	_need(MSG, _("send test messages"))
	if not sms.normalise(mobile):
		frappe.throw(_("{0} is not a Pakistani mobile number").format(mobile))
	name = sms.send(event or "Custom", mobile, {**sms.SAMPLE}, text=text if not event else None, party_name=_("Test"),
		immediate=True)
	if not name:
		frappe.throw(_("Messaging is off in Sugar Settings"))
	return frappe.get_doc("Sugar SMS Log", name).as_dict()


@frappe.whitelist(methods=["POST"])
def simulate_inbound(mobile: str, message: str) -> dict:
	"""The keyword simulator: as if the grower had texted the mill."""
	_need(MSG, _("simulate incoming messages"))
	return sms.receive(mobile, message)


@frappe.whitelist(methods=["POST"])
def flush() -> dict:
	_need(MSG, _("send queued messages"))
	return {"sent": sms.flush_queue()}


@frappe.whitelist(methods=["POST"])
def save_settings(**values) -> dict:
	_need(MSG, _("change message settings"))
	s = frappe.get_doc("Sugar Settings")
	keys = {"enabled": "sms_enabled", "gateway": "sms_gateway", "sender": "sms_sender", "language": "sms_language",
		"test_number": "sms_test_number", "quiet_from": "sms_quiet_from", "quiet_to": "sms_quiet_to", "cap": "sms_daily_cap",
		"inbound_token": "sms_inbound_token"}
	for k, f in keys.items():
		if k in values and (k != "inbound_token" or values[k]):
			s.set(f, values[k])
	s.save()
	return _settings()
