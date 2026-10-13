"""Circle cane quotas per crushing season. A season's Circle Quotas table overrides the quota on the circle;
a circle without a row keeps the circle's own quota."""

import frappe
from frappe.utils import flt


def season_quotas(season: str | None) -> dict[str, float]:
	"""{circle: quota_maund} for every circle, the season's figure where it has one."""
	quotas = {c.name: flt(c.quota_maund) for c in frappe.get_all("Cane Circle", fields=["name", "quota_maund"])}
	if season:
		for r in frappe.get_all("Season Circle Quota", filters={"parent": season, "parenttype": "Crushing Season"},
				fields=["circle", "quota_maund"]):
			quotas[r.circle] = flt(r.quota_maund)
	return quotas


def quota_of(season: str | None, circle: str) -> float:
	if season:
		row = frappe.db.get_value("Season Circle Quota", {"parent": season, "parenttype": "Crushing Season", "circle": circle},
			"quota_maund")
		if row is not None:
			return flt(row)
	return flt(frappe.db.get_value("Cane Circle", circle, "quota_maund"))
