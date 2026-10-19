# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""Incoming SMS / WhatsApp from the gateway: POST /api/method/sugarcane.api.v1.sms.inbound?token=…&from=…&text=…"""
import hmac

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

from sugarcane import sms


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=300, seconds=60)  # a gateway posts in bursts; a guesser is stopped
def inbound(token: str | None = None, mobile: str | None = None, message: str | None = None, **kw) -> dict:
	"""The gateway's callback. The shared token (Sugar Settings → Inbound Token) must match; gateways name the fields
	differently, so from / sender / msisdn and text / body / msg are also taken."""
	secret = frappe.get_cached_doc("Sugar Settings").get_password("sms_inbound_token", raise_exception=False)
	if not secret or not token or not hmac.compare_digest(str(token), str(secret)):
		frappe.throw(_("Not allowed"), frappe.PermissionError)
	mobile = mobile or kw.get("from") or kw.get("sender") or kw.get("msisdn")
	message = message or kw.get("text") or kw.get("body") or kw.get("msg")
	if not mobile or not message:
		frappe.throw(_("mobile and message are required"))
	frappe.set_user("Administrator")
	try:
		out = sms.receive(mobile, message)
	finally:
		frappe.set_user("Guest")
	return {"reply": out["reply"]}
