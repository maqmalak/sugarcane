# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""User manuals per role (sugarcane/manuals/*.md), shown in the React app's Help page."""
import os
import re

import frappe
from frappe import _

DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "manuals")
PUBLIC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "public")

# Guides (A4 PDFs with screenshots, in public/help — in git) and demo videos (public/downloads/videos — copied to each server by hand,
# like the Android APKs). A video is listed only when its file is on this server. "manuals": shown at the top of those manuals.
GUIDES = [
	{"slug": "gate-gross-tare", "title": "Gate, gross & tare", "kind": "Guide",
		"summary": "Token at the gate (driver code), Gross · 1st weight and Tare · 2nd weight with CCTV, platform sensors, auto-weigh and the grower display.",
		"pdf": "help/gate-gross-tare.pdf", "video": "08-One-indent-token-to-payment-with-grower-display-and-sensors.mp4",
		"roles": ["Token Clerk", "Gross Weighman", "Tare Weighman", "Yard Supervisor"], "manuals": ["gate", "weighbridge"]},
	{"slug": "cash-counter", "title": "TPT cash counter", "kind": "Guide",
		"summary": "Open a counter for the shift, cash from the strong room, scan one or several bilties, cash or JazzCash, payee display, close with the note count, X / Z reports.",
		"pdf": "help/cash-counter.pdf", "video": "09-TPT-cash-counter-bilty-payment-with-payee-display.mp4",
		"roles": ["Cane Cashier", "Cane Accountant"], "manuals": ["cashier", "cane-accountant"]},
	{"slug": "grower-loans", "title": "Grower loans", "kind": "Guide",
		"summary": "Eligibility criteria, the request with the grower's history, the loan field survey, approval or rejection, disbursement and recovery.",
		"pdf": "help/grower-loans.pdf", "video": "10-Grower-loan-eligibility-request-survey-approval-disbursement.mp4",
		"roles": ["Cane Accountant", "Circle Officer", "Surveyor"], "manuals": ["cane-accountant", "surveyor", "circle-officer", "management"]},
	{"slug": "grower-payments", "title": "Grower payments", "kind": "Guide",
		"summary": "Bank balances available, the unpaid scroll, the payment scroll and its bank check, bank payment schedule and letters, loan adjustments in CPRs.",
		"pdf": "help/grower-payments.pdf", "video": "11-Grower-payments-bank-balances-scroll-schedule-letters-loan-adjustments.mp4",
		"roles": ["Cane Accountant", "Accounts Manager"], "manuals": ["cane-accountant", "management", "finance"]},
	{"slug": "process-flow-dfd", "title": "Process flow & DFD", "kind": "Guide",
		"summary": "The cane accounting process flow (grower code to bank transfer), the ELP flow, and the data flow diagrams level 0 and 1.",
		"pdf": "help/process-flow-dfd.pdf", "video": None, "roles": ["all"], "manuals": ["getting-started", "management"]},
	{"slug": "print-documents", "title": "Printed documents", "kind": "Guide",
		"summary": "What every printed slip, letter and bill looks like: indent, token, CPR, bilty, payment schedule, bank letter, contractor bills.",
		"pdf": "help/print-documents.pdf", "video": None, "roles": ["all"], "manuals": []},
	{"slug": "video-esurvey", "title": "EagleEye e-survey", "kind": "Video", "summary": "The Android crop survey, start to finish.",
		"pdf": None, "video": "01-EagleEye-e-survey.mp4", "roles": ["Surveyor", "Circle Officer"], "manuals": ["surveyor", "circle-officer"]},
	{"slug": "video-elp", "title": "ELP — electronic loading point", "kind": "Video", "summary": "A load traced from the loading point to the gate.",
		"pdf": None, "video": "02-ELP-electronic-loading-point.mp4", "roles": ["LP Operator", "ELP Auditor"], "manuals": ["elp"]},
	{"slug": "video-depot", "title": "Depot purchase to CPR", "kind": "Video", "summary": "Depot purchase, then token → gross → tare → CPR.",
		"pdf": None, "video": "03-Depot-purchase-and-token-gross-tare-CPR.mp4", "roles": ["Depot User"], "manuals": ["depot"]},
	{"slug": "video-gate-circles", "title": "Gate purchase, circles and depot receipts", "kind": "Video", "summary": "Gate purchase across circles and receiving depot trucks.",
		"pdf": None, "video": "04-Gate-purchase-circles-and-depot-receipts.mp4", "roles": ["Token Clerk", "Depot User"], "manuals": []},
	{"slug": "video-bank", "title": "Bank payment and bilty payment", "kind": "Video", "summary": "Growers paid through the bank, transporters at the counter.",
		"pdf": None, "video": "05-Bank-payment-and-bilty-payment.mp4", "roles": ["Cane Accountant", "Cane Cashier"], "manuals": []},
	{"slug": "video-production", "title": "Production, costing and lab", "kind": "Video", "summary": "From hourly lab samples to the cost of a 50 kg bag.",
		"pdf": None, "video": "06-Production-costing-and-lab.mp4", "roles": ["Lab Chemist", "Production Manager", "Cost Accountant"], "manuals": ["laboratory", "cost-accountant"]},
]


def _guides(mine: set, manual: str | None = None) -> list:
	out = []
	for g in GUIDES:
		if manual and manual not in g["manuals"]:
			continue
		if not ("all" in g["roles"] or EVERYONE & mine or set(g["roles"]) & mine or manual):
			continue
		video = g["video"] if g["video"] and os.path.exists(os.path.join(PUBLIC, "downloads", "videos", g["video"])) else None
		if not g["pdf"] and not video:
			continue
		out.append({**{k: g[k] for k in ("slug", "title", "kind", "summary", "roles")},
			"pdf_url": f"/assets/sugarcane/{g['pdf']}" if g["pdf"] else None,
			"video_url": f"/assets/sugarcane/downloads/videos/{video}" if video else None,
			"mine": bool(set(g["roles"]) & mine)})
	return out
EVERYONE = {"System Manager", "Cane Admin", "Cane Manager"}


def _read(slug):
	path = os.path.join(DIR, f"{slug}.md")
	if not re.fullmatch(r"[a-z0-9-]+", slug or "") or not os.path.exists(path):
		frappe.throw(_("No such manual"), frappe.DoesNotExistError)
	text = open(path, encoding="utf-8").read()
	meta, body = {}, text
	m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
	if m:
		body = text[m.end():]
		for line in m.group(1).splitlines():
			k, _sep, v = line.partition(":")
			meta[k.strip()] = v.strip()
	roles = {r.strip() for r in meta.get("roles", "").split(",") if r.strip()}
	return {"slug": slug, "title": meta.get("title") or slug, "roles": sorted(roles), "order": int(meta.get("order") or 99), "body": body}


def _allowed(m, mine):
	return "all" in m["roles"] or EVERYONE & mine or set(m["roles"]) & mine


@frappe.whitelist(methods=["GET"])
def manuals() -> list:
	mine = set(frappe.get_roles())
	out = []
	for f in sorted(os.listdir(DIR)):
		if f.endswith(".md"):
			m = _read(f[:-3])
			out.append({"slug": m["slug"], "title": m["title"], "roles": m["roles"], "order": m["order"], "mine": bool(set(m["roles"]) & mine),
				"allowed": bool(_allowed(m, mine))})
	return sorted([m for m in out if m["allowed"]], key=lambda m: (m["order"], m["title"]))


@frappe.whitelist(methods=["GET"])
def manual(slug: str) -> dict:
	m = _read(slug)
	if not _allowed(m, set(frappe.get_roles())):
		frappe.throw(_("This manual is for another role"), frappe.PermissionError)
	from frappe.utils import md_to_html

	return {"slug": m["slug"], "title": m["title"], "roles": m["roles"], "html": md_to_html(m["body"]),
		"guides": _guides(set(frappe.get_roles()), slug)}


@frappe.whitelist(methods=["GET"])
def guides() -> list:
	"""Guides (PDF) and videos for the signed-in person's roles; managers see all."""
	return _guides(set(frappe.get_roles()))
