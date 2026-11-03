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
GUIDES = [  # in the order the work flows: the big picture, setup, survey, ELP, gate, counter, payments, loans, production, prints
	{"slug": "process-flow-dfd", "stage": "Start here", "title": "Process flow & DFD", "kind": "Guide",
		"summary": "The whole ERP in DFD level 0 and 1, the cane accounting process flow, and the DFDs for setup, e-survey, indenting (with the indent generation flow), ELP and grower payments.",
		"pdf": "help/process-flow-dfd.pdf", "video": None, "roles": ["all"], "manuals": ["getting-started", "management"]},
	{"slug": "setup", "stage": "Start here", "title": "Setup — company, site, areas, growers", "kind": "Guide",
		"summary": "Sugar Settings and the season, sources, loading points, depots, weighbridges and cameras, zone / circle / village, growers, passbooks and the Excel import.",
		"pdf": "help/setup.pdf", "video": "12-Setup-company-site-zone-circle-village-grower.mp4",
		"roles": ["Cane Admin", "Cane Manager", "Cane Staff"], "manuals": ["setup", "management"]},
	{"slug": "e-survey", "stage": "Survey & cane intake", "title": "EagleEye e-survey", "kind": "Guide",
		"summary": "The surveyor's phone (device approval, PIN, check-in, field boundary, photos), then devices, attendance, overlaps, quotas and insights in the office.",
		"pdf": "help/e-survey.pdf", "video": "01-EagleEye-e-survey.mp4",
		"roles": ["Surveyor", "Circle Officer", "Cane Manager"], "manuals": ["surveyor", "circle-officer"]},
	{"slug": "indenting", "stage": "Survey & cane intake", "title": "Indenting — quota, rules, ranges, batches", "kind": "Guide",
		"summary": "What the quota and quota rules are and how to set them, indent ranges and numbering, generating a week of indents in batches, authorizing, printing, look up and expired indents.",
		"pdf": "help/indenting.pdf", "video": "15-Indenting-quota-rules-ranges-batches.mp4",
		"roles": ["Indent Clerk", "Cane Manager", "Cane Admin", "Circle Officer"], "manuals": ["indenting"]},
	{"slug": "elp", "stage": "Survey & cane intake", "title": "ELP — electronic loading point", "kind": "Guide",
		"summary": "A load registered on the phone at the loading point with ten photos, tracked on the road, photographed at the gate and verified by the ELP auditor.",
		"pdf": "help/elp.pdf", "video": "02-ELP-electronic-loading-point.mp4", "roles": ["LP Operator", "ELP Auditor", "Cane Manager"], "manuals": ["elp"]},
	{"slug": "gate-gross-tare", "stage": "Survey & cane intake", "title": "Gate, gross & tare", "kind": "Guide",
		"summary": "Token at the gate (driver code), Gross · 1st weight and Tare · 2nd weight with CCTV, platform sensors, auto-weigh and the grower display.",
		"pdf": "help/gate-gross-tare.pdf", "video": "07-Gate-token-gross-tare-with-CCTV.mp4",
		"roles": ["Token Clerk", "Gross Weighman", "Tare Weighman", "Yard Supervisor"], "manuals": ["gate", "weighbridge"]},
	{"slug": "video-one-indent", "stage": "Survey & cane intake", "title": "One indent — token to payment", "kind": "Video",
		"summary": "One indent end to end: token, 1st and 2nd weight with sensors and the grower display, CPR, bilty, and payment at the counter.",
		"pdf": None, "video": "08-One-indent-token-to-payment-with-grower-display-and-sensors.mp4",
		"roles": ["Token Clerk", "Gross Weighman", "Tare Weighman", "Cane Cashier"], "manuals": ["gate", "weighbridge", "cashier"]},
	{"slug": "video-gate-circles", "stage": "Survey & cane intake", "title": "Gate purchase, circles and depot receipts", "kind": "Video", "summary": "Gate purchase across circles and receiving depot trucks.",
		"pdf": None, "video": "04-Gate-purchase-circles-and-depot-receipts.mp4", "roles": ["Token Clerk", "Depot User"], "manuals": []},
	{"slug": "video-depot", "stage": "Survey & cane intake", "title": "Depot purchase to CPR", "kind": "Video", "summary": "Depot purchase, then token → gross → tare → CPR.",
		"pdf": None, "video": "03-Depot-purchase-and-token-gross-tare-CPR.mp4", "roles": ["Depot User"], "manuals": ["depot"]},
	{"slug": "cash-counter", "stage": "Payments & loans", "title": "TPT cash counter", "kind": "Guide",
		"summary": "Open a counter for the shift, cash from the strong room, scan one or several bilties, cash or JazzCash, payee display, close with the note count, X / Z reports.",
		"pdf": "help/cash-counter.pdf", "video": "09-TPT-cash-counter-bilty-payment-with-payee-display.mp4",
		"roles": ["Cane Cashier", "Cane Accountant"], "manuals": ["cashier", "cane-accountant"]},
	{"slug": "grower-payments", "stage": "Payments & loans", "title": "Grower payments", "kind": "Guide",
		"summary": "Bank balances available, the unpaid scroll, the payment scroll and its bank check, bank payment schedule and letters, loan adjustments in CPRs.",
		"pdf": "help/grower-payments.pdf", "video": "11-Grower-payments-bank-balances-scroll-schedule-letters-loan-adjustments.mp4",
		"roles": ["Cane Accountant", "Accounts Manager"], "manuals": ["cane-accountant", "management", "finance"]},
	{"slug": "video-bank", "stage": "Payments & loans", "title": "Bank payment and bilty payment", "kind": "Video", "summary": "Growers paid through the bank, transporters at the counter.",
		"pdf": None, "video": "05-Bank-payment-and-bilty-payment.mp4", "roles": ["Cane Accountant", "Cane Cashier"], "manuals": []},
	{"slug": "grower-loans", "stage": "Payments & loans", "title": "Grower loans", "kind": "Guide",
		"summary": "Eligibility criteria, the request with the grower's history, the loan field survey, approval or rejection, disbursement and recovery.",
		"pdf": "help/grower-loans.pdf", "video": "10-Grower-loan-eligibility-request-survey-approval-disbursement.mp4",
		"roles": ["Cane Accountant", "Circle Officer", "Surveyor"], "manuals": ["cane-accountant", "surveyor", "circle-officer", "management"]},
	{"slug": "laboratory", "stage": "Mill: lab, production & costing", "title": "Laboratory & production", "kind": "Guide",
		"summary": "Lab setup (streams, limits, norms, plant points), hourly and vehicle samples, mill stoppages, the daily manufacturing report and its A4 sheet, production.",
		"pdf": "help/laboratory.pdf", "video": "13-Laboratory-setup-hourly-samples-DMR-production.mp4",
		"roles": ["Lab Chemist", "Production Manager"], "manuals": ["laboratory"]},
	{"slug": "costing", "stage": "Mill: lab, production & costing", "title": "Costing — cost of production", "kind": "Guide",
		"summary": "By-product rates (NRV), cost allocation rules, budgeted processing cost, the provisional cost per bag and the month-end costing run with price per bag.",
		"pdf": "help/costing.pdf", "video": "14-Costing-byproducts-allocation-costing-run.mp4",
		"roles": ["Cost Accountant", "Accounts Manager"], "manuals": ["cost-accountant", "management"]},
	{"slug": "video-production", "stage": "Mill: lab, production & costing", "title": "Production, costing and lab", "kind": "Video", "summary": "From hourly lab samples to the cost of a 50 kg bag.",
		"pdf": None, "video": "06-Production-costing-and-lab.mp4", "roles": ["Lab Chemist", "Production Manager", "Cost Accountant"], "manuals": ["laboratory", "cost-accountant"]},
	{"slug": "print-documents", "stage": "Printed documents", "title": "Printed documents", "kind": "Guide",
		"summary": "What every printed slip, letter and bill looks like: indent, token, CPR, bilty, payment schedule, bank letter, unloading contract, contractor bills.",
		"pdf": "help/print-documents.pdf", "video": None, "roles": ["all"], "manuals": []},
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
		out.append({**{k: g[k] for k in ("slug", "title", "kind", "summary", "roles")}, "stage": g.get("stage", "More"), "order": len(out) + 1,
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
