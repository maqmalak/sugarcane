"""Indent numbers come from pre-allotted Indent Ranges: the circle's own active range first, else a mill-wide one.
A number is taken under a row lock and never handed out twice — a cancelled or deleted draft keeps its gap, as with
pre-printed permit books."""

import frappe
from frappe import _

from sugarcane.calc.indent import format_no


def _ranges(season, circle):
	return frappe.db.sql("""select name, prefix, digits, next_no, to_no from `tabIndent Range`
		where season=%s and ifnull(circle, '')=%s and status='Active' and next_no <= to_no
		order by from_no asc for update""", (season, circle or ""), as_dict=True)


def allocate(season: str, circle: str | None) -> str:
	rows = _ranges(season, circle) or (_ranges(season, None) if circle else [])
	if not rows:
		frappe.throw(_("No active indent range with numbers left for {0} in season {1}. Add one under Indent Range.").format(
			circle or _("the mill"), season), title=_("Indent range needed"))
	r = rows[0]
	number = r.next_no
	left = r.to_no - number
	frappe.db.set_value("Indent Range", r.name, {"next_no": number + 1, "remaining": max(left, 0),
		**({"status": "Exhausted"} if left <= 0 else {})}, update_modified=False)
	return format_no(r.prefix, number, r.digits)


def numbers_left(season: str, circle: str | None) -> int:
	"""Numbers still free for a circle (its own ranges, or the mill-wide ones when it has none)."""
	def left(c):
		return sum(max(r.to_no - r.next_no + 1, 0) for r in frappe.get_all("Indent Range", filters={
			"season": season, "status": "Active", "circle": c or ["is", "not set"]}, fields=["next_no", "to_no"]))
	own = left(circle) if circle else 0
	return own or left(None)
