"""Seasonal rate resolution: the most specific level that sets a value wins.

Order (most specific first): Loading Point → Source → Circle → Season. A level that leaves a field empty (None / "")
falls through to the next. Zero is a real value ("no subsidy here") and does not fall through.
"""

RATE_FIELDS = (
	"govt_rate",
	"road_cess_pct",
	"grower_cess_share_pct",
	"subsidy_rate",
	"additional_subsidy_rate",
	"tpt_rate",
	"binding_kg_per_quintal",
	"garbage_pct",
	"garbage_fixed_kg",
)

LEVELS = ("loading_point", "source", "circle", "season")


def resolve(season: dict, circle: dict | None = None, source: dict | None = None,
		loading_point: dict | None = None, fields=RATE_FIELDS) -> dict:
	"""Returns {field: value} plus {field + "_level": level name} saying where each value came from."""
	by_level = {"loading_point": loading_point, "source": source, "circle": circle, "season": season}
	out = {}
	for field in fields:
		out[field], out[f"{field}_level"] = None, None
		for level in LEVELS:
			values = by_level[level] or {}
			value = values.get(field)
			if value is not None and value != "":
				out[field], out[f"{field}_level"] = value, level
				break
	return out
