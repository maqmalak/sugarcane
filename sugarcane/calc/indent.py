"""Cane indenting, pure functions (no database): which quota rule applies to a surveyed field, how many loads a grower
is entitled to, the ideal supply dates for those loads, and fitting them into the mill's daily intake capacity.

An indent is a permit for one vehicle load of cane on a given day. A grower's loads come from the surveyed cane:

    entitled maund = Σ expected maund of their surveyed fields × quota % of the matching rule  (capped by circle quota)
    loads          = ⌊entitled ÷ load maund⌋, plus one more when the remainder is ≥ partial-load %
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, timedelta

RULE_KEYS = ("circle", "grower_category", "crop_type", "maturity")


@dataclass(frozen=True)
class Rule:
	name: str
	quota_pct: float = 100.0
	circle: str | None = None
	grower_category: str | None = None
	crop_type: str | None = None
	maturity: str | None = None
	from_date: date | None = None
	to_date: date | None = None
	priority: int = 0

	def matches(self, line: dict) -> bool:
		return all(getattr(self, k) in (None, "", "All") or getattr(self, k) == line.get(k) for k in RULE_KEYS)

	@property
	def specificity(self) -> int:
		# a circle-specific rule beats any combination of the other conditions
		return sum((4 if k == "circle" else 1) for k in RULE_KEYS if getattr(self, k) not in (None, "", "All"))


def match_rule(rules: list[Rule], line: dict) -> Rule | None:
	"""The most specific matching rule (a circle counts most), then the higher priority, then the name."""
	hits = [r for r in rules if r.matches(line)]
	if not hits:
		return None
	return sorted(hits, key=lambda r: (-r.specificity, -r.priority, r.name))[0]


def loads_for(entitled_maund: float, load_maund: float, partial_pct: float = 50) -> int:
	"""Whole loads for an entitlement; a part load counts when it is at least `partial_pct` % of a load."""
	if entitled_maund <= 0 or load_maund <= 0:
		return 0
	full = math.floor(entitled_maund / load_maund + 1e-9)
	rest = entitled_maund - full * load_maund
	return full + (1 if rest > 1e-9 and rest >= load_maund * partial_pct / 100 else 0)


def circle_factor(entitled: float, quota: float) -> float:
	"""Scale-down applied to every grower of a circle whose entitlement exceeds its season quota (no quota = no cap)."""
	if quota and quota > 0 and entitled > quota:
		return quota / entitled
	return 1.0


def ideal_dates(n: int, start: date, end: date) -> list[date]:
	"""n loads spread evenly over [start, end] (each in the middle of its share of the window)."""
	if n <= 0:
		return []
	days = (end - start).days + 1
	if days <= 0:
		raise ValueError("The supply window ends before it starts")
	return [start + timedelta(days=min(days - 1, int((i + 0.5) * days / n))) for i in range(n)]


@dataclass
class Demand:
	key: str
	ideal: date
	start: date
	end: date
	priority: int = 0
	meta: dict = field(default_factory=dict)


def place(demands: list[Demand], capacity: dict[date, int], default_capacity: int) -> tuple[dict[str, date], list[str]]:
	"""Give each load a day: its ideal day if there is room, else the nearest day inside its window with room (a later
	day first, then an earlier one). `capacity` holds what is already used / left per day; days not in it have
	`default_capacity` loads. Returns ({key: day}, [keys that found no day])."""
	left = dict(capacity)
	placed, unplaced = {}, []
	for d in sorted(demands, key=lambda x: (x.ideal, -x.priority, x.key)):
		day = None
		span = (d.end - d.start).days
		for step in range(span + 1):
			for cand in ((d.ideal + timedelta(days=step)),) + (((d.ideal - timedelta(days=step)),) if step else ()):
				if d.start <= cand <= d.end and left.get(cand, default_capacity) > 0:
					day = cand
					break
			if day:
				break
		if day is None:
			unplaced.append(d.key)
			continue
		left[day] = left.get(day, default_capacity) - 1
		placed[d.key] = day
	return placed, unplaced


def daily_capacity_loads(capacity_maund: float, load_maund: float) -> int:
	return int(capacity_maund // load_maund) if load_maund > 0 and capacity_maund > 0 else 0


def derive_capacity(target_maund: float, start: date, end: date) -> float:
	"""Daily intake (maund) when the season sets none: the crushing target spread over the season's days."""
	days = (end - start).days + 1
	return target_maund / days if target_maund and days > 0 else 0.0


def format_no(prefix: str, number: int, digits: int = 6) -> str:
	return f"{prefix or ''}{int(number):0{max(int(digits or 0), 1)}d}"
