# Copyright (c) 2026, MicroMax and contributors
# For license information, please see license.txt
"""User manuals per role (sugarcane/manuals/*.md), shown in the React app's Help page."""
import os
import re

import frappe
from frappe import _

DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "manuals")
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

	return {"slug": m["slug"], "title": m["title"], "roles": m["roles"], "html": md_to_html(m["body"])}
