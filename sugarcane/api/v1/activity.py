"""A record's activity as a chain of blocks (React form → Activity tab).

Everything that happened to the document, oldest first: created, every saved change (field old → new, rows added /
removed, submitted / cancelled), comments of all kinds (comment, info, attachment, workflow, assignment, share, like),
emails, and the documents that were later linked to it (a plot's booking, receipts, bills …). Each block carries a
SHA-256 of its content chained to the previous block's hash, so the sequence reads like a ledger and any reordering or
edit of the history would show as a broken link."""

import hashlib
import json

import frappe
from frappe import _
from frappe.utils import cstr, strip_html

LINKED_LIMIT = 80


def _label(meta, fieldname):
	df = meta.get_field(fieldname)
	return _(df.label) if df and df.label else fieldname.replace("_", " ").title()


def _same(old, new) -> bool:
	"""No real change: both empty, or the same number written differently (0 → 0.0, "" → None)."""
	if old in (None, "", 0, "0") and new in (None, "", 0, "0", 0.0, "0.0"):
		return True
	try:
		return float(old) == float(new)
	except (TypeError, ValueError):
		return cstr(old) == cstr(new)


def _plain(value):
	"""Values as text: HTML fields (e.g. the tax breakup table) without their markup."""
	text = cstr(value)
	return " ".join(strip_html(text).split()) if "<" in text else text


def _version_block(meta, v):
	try:
		data = json.loads(v.data or "{}")
	except ValueError:
		data = {}
	changes, kind, title = [], "change", _("Updated")
	for field, old, new in data.get("changed") or []:
		if field == "docstatus":
			kind = "submit" if new == 1 else "cancel" if new == 2 else "change"
			title = {1: _("Submitted"), 2: _("Cancelled")}.get(new, _("Reverted to draft"))
			continue
		if field in ("modified", "modified_by") or _same(old, new):
			continue
		changes.append({"field": _label(meta, field), "old": _plain(old)[:140], "new": _plain(new)[:140]})
	for table, rows in data.get("added") or []:
		changes.append({"field": _label(meta, table), "old": "", "new": _("{0} row(s) added").format(len(rows) if isinstance(rows, list) else 1)})
	for table, rows in data.get("removed") or []:
		changes.append({"field": _label(meta, table), "old": _("{0} row(s) removed").format(len(rows) if isinstance(rows, list) else 1), "new": ""})
	for table, _row, _name, rchanges in data.get("row_changed") or []:
		for field, old, new in rchanges or []:
			if _same(old, new):
				continue
			changes.append({"field": f"{_label(meta, table)} · {field.replace('_', ' ')}", "old": cstr(old)[:100], "new": cstr(new)[:100]})
	if kind == "change" and data.get("added") and not data.get("changed"):
		title = _("Rows added")
	return {"kind": kind, "title": title, "at": cstr(v.creation), "by": v.owner, "changes": changes[:30], "ref": v.name}


COMMENT_KIND = {"Comment": "comment", "Info": "info", "Attachment": "file", "Attachment Removed": "file", "Workflow": "workflow",
				"Assigned": "assign", "Assignment Completed": "assign", "Shared": "share", "Unshared": "share", "Like": "like",
				"Label": "info", "Edit": "info", "Deleted": "info"}


@frappe.whitelist(methods=["GET"])
def get_chain(doctype: str, name: str, linked: int = 1) -> dict:
	doc = frappe.get_doc(doctype, name)
	doc.check_permission("read")
	meta = frappe.get_meta(doctype)
	blocks = [{"kind": "create", "title": _("Created"), "at": cstr(doc.creation), "by": doc.owner, "changes": [], "ref": doc.name}]
	for v in frappe.get_all("Version", {"ref_doctype": doctype, "docname": name}, ["name", "owner", "creation", "data"], order_by="creation asc", limit=200):
		b = _version_block(meta, v)
		if b["changes"] or b["kind"] != "change":
			blocks.append(b)
	for c in frappe.get_all("Comment", {"reference_doctype": doctype, "reference_name": name},
							["name", "comment_type", "content", "comment_email", "owner", "creation"], order_by="creation asc", limit=200):
		kind = COMMENT_KIND.get(c.comment_type, "info")
		text = strip_html(cstr(c.content)).strip()
		blocks.append({"kind": kind, "title": _(c.comment_type), "at": cstr(c.creation), "by": c.comment_email or c.owner,
					   "text": text[:400], "changes": [], "ref": c.name})
	for e in frappe.get_all("Communication", {"reference_doctype": doctype, "reference_name": name, "communication_type": "Communication"},
							["name", "subject", "sender", "recipients", "communication_date", "communication_medium", "sent_or_received"],
							order_by="communication_date asc", limit=100):
		blocks.append({"kind": "email", "title": f"{_(e.communication_medium or 'Email')} {_(e.sent_or_received or '').lower()}".strip(),
					   "at": cstr(e.communication_date), "by": e.sender, "text": cstr(e.subject), "to": e.recipients, "changes": [], "ref": e.name})
	if int(linked):
		from sugarcane.api.v1.connections import _auto_groups

		label_in = _("Linked to this {0}").format(_(doctype))
		seen = 0
		for group, dt, sql, extra in _auto_groups(doctype, name, set()):
			if group != label_in or not frappe.has_permission(dt, "read"):
				continue
			meta_dt = frappe.get_meta(dt)
			try:
				rows = frappe.db.sql(f"""select x.name, x.status, x.detail, coalesce(timestamp(x.date, time(p.creation)), p.creation) at, p.owner
					from ({sql}) x join `tab{dt}` p on p.name = x.name order by at desc limit 25""", {"n": name, **extra}, as_dict=True)
			except Exception:
				continue
			for r in rows:
				blocks.append({"kind": "linked", "title": _("{0} linked").format(_(dt)), "at": cstr(r.at), "by": r.owner,
							   "doctype": dt, "docname": r.name, "status": r.status, "text": cstr(r.detail or ""), "changes": [], "ref": r.name,
							   "submittable": bool(meta_dt.is_submittable)})
				seen += 1
			if seen >= LINKED_LIMIT:
				break
	genesis, rest = blocks[0], sorted(blocks[1:], key=lambda b: b["at"])
	blocks = [genesis, *rest]  # "Created" is always block #0
	prev = "0" * 64
	names = {}
	for i, b in enumerate(blocks):
		b["index"] = i
		b["prev"] = prev
		payload = json.dumps({k: b.get(k) for k in ("kind", "title", "at", "by", "changes", "text", "ref")}, sort_keys=True, default=str)
		b["hash"] = prev = hashlib.sha256((b["prev"] + payload).encode()).hexdigest()
		if b.get("by") and b["by"] not in names:
			names[b["by"]] = frappe.utils.get_fullname(b["by"]) if frappe.db.exists("User", b["by"]) else b["by"]
		b["by_name"] = names.get(b.get("by"), b.get("by"))
	counts = {}
	for b in blocks:
		counts[b["kind"]] = counts.get(b["kind"], 0) + 1
	return {"blocks": blocks, "counts": counts, "head": prev}
