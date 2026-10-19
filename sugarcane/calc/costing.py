"""Process costing with by-product credit (pure functions, no database).

    joint cost      = cane cost (cane price + mill-paid cane costs) + processing cost (elements + packing + off-season share)
    by-product NRV  = quantity (t) × sale rate per t − selling cost
    net sugar cost  = joint cost − by-product credit
    cost per kg     = net sugar cost ÷ sugar produced (kg);  per bag = per kg × bag weight;  per t cane = net ÷ cane crushed (t)

Worked example (the functional design, tested): cane 1,025 m + processing 404 m = joint 1,429 m; molasses 175 m + bagasse 24 m +
press mud 1.75 m = credit 200.75 m; net 1,228.25 m → Rs 122.83 / kg, Rs 6,141 / bag, Rs 12,283 / t cane, cane share 71.7 %.
"""
from dataclasses import dataclass, field

ELEMENTS = ("Chemicals", "Stores and spares", "Salaries and wages", "Power and fuel", "Repair and maintenance", "Depreciation",
	"Factory overheads")


def r2(x) -> float:
	return round(float(x or 0) + 1e-9, 2)


def nrv_per_kg(rate_per_ton, selling_cost_per_ton=0) -> float:
	"""Net realisable value of a by-product per kg: (sale rate − selling and handling cost) per ton ÷ 1,000."""
	return round(max(float(rate_per_ton or 0) - float(selling_cost_per_ton or 0), 0) / 1000, 6)


@dataclass
class ByProduct:
	name: str
	tons: float
	rate_per_ton: float
	selling_cost: float = 0.0  # total for the quantity

	@property
	def credit(self) -> float:
		return r2(self.tons * self.rate_per_ton - self.selling_cost)


@dataclass
class Statement:
	cane_price: float
	cane_other: float  # subsidies, the mill's cess share, depot freight / commission, transit shortage
	elements: dict = field(default_factory=dict)  # element -> amount
	packing: float = 0.0
	off_season: float = 0.0
	by_products: list = field(default_factory=list)
	sugar_kg: float = 0.0
	cane_tons: float = 0.0
	bag_kg: float = 50.0

	@property
	def cane_cost(self):
		return r2(self.cane_price + self.cane_other)

	@property
	def processing(self):
		return r2(sum(self.elements.values()) + self.packing + self.off_season)

	@property
	def joint(self):
		return r2(self.cane_cost + self.processing)

	@property
	def credit(self):
		return r2(sum(b.credit for b in self.by_products))

	@property
	def net(self):
		return r2(self.joint - self.credit)

	@property
	def per_kg(self):
		return round(self.net / self.sugar_kg, 4) if self.sugar_kg else 0.0

	@property
	def per_bag(self):
		return round(self.per_kg * self.bag_kg, 2)

	@property
	def per_ton_cane(self):
		return round(self.net / self.cane_tons, 2) if self.cane_tons else 0.0

	@property
	def cane_share_pct(self):
		return round(100 * self.cane_cost / self.joint, 2) if self.joint else 0.0

	@property
	def recovery_pct(self):
		return round(100 * self.sugar_kg / (self.cane_tons * 1000), 3) if self.cane_tons else 0.0

	def as_dict(self):
		return {"cane_price": r2(self.cane_price), "cane_other": r2(self.cane_other), "cane_cost": self.cane_cost,
			"elements": {k: r2(v) for k, v in self.elements.items()}, "packing": r2(self.packing), "off_season": r2(self.off_season),
			"processing": self.processing, "joint": self.joint,
			"by_products": [{"name": b.name, "tons": b.tons, "rate_per_ton": b.rate_per_ton, "selling_cost": r2(b.selling_cost), "credit": b.credit}
				for b in self.by_products],
			"credit": self.credit, "net": self.net, "sugar_kg": self.sugar_kg, "bags": round(self.sugar_kg / self.bag_kg, 2) if self.bag_kg else 0,
			"cane_tons": self.cane_tons, "per_kg": self.per_kg, "per_bag": self.per_bag, "per_ton_cane": self.per_ton_cane,
			"cane_share_pct": self.cane_share_pct, "recovery_pct": self.recovery_pct}


def allocate(amounts: dict, rules: list) -> tuple[dict, list]:
	"""Move each service cost centre's amount to the production cost centres of its rule.

	amounts  {cost_center: amount}
	rules    [{"service": cc, "basis": "Fixed %" | "Equal" | "Hours", "targets": [{"cost_center": cc, "pct": .., "hours": ..}]}]
	returns  ({cost_center: amount after allocation}, [{"from", "to", "amount"}])
	"""
	out = dict(amounts)
	moves = []
	for rule in rules:
		src = rule["service"]
		amt = out.get(src, 0.0)
		targets = [t for t in rule.get("targets") or [] if t.get("cost_center") and t["cost_center"] != src]
		if not amt or not targets:
			continue
		basis = rule.get("basis") or "Fixed %"
		weights = [float(t.get("hours") or 0) if basis == "Hours" else float(t.get("pct") or 0) if basis == "Fixed %" else 1.0 for t in targets]
		total = sum(weights)
		if total <= 0:
			continue
		moved = 0.0
		for i, (t, w) in enumerate(zip(targets, weights)):
			share = r2(amt - moved) if i == len(targets) - 1 else r2(amt * w / total)
			out[t["cost_center"]] = r2(out.get(t["cost_center"], 0.0) + share)
			moved = r2(moved + share)
			moves.append({"from": src, "to": t["cost_center"], "amount": share})
		out[src] = r2(out.get(src, 0.0) - moved)
		if abs(out[src]) < 0.005:
			out.pop(src)
	return out, moves


def off_season_share(pool, period_tons, season_tons, spread_so_far=0.0, season_close=False) -> float:
	"""The period's share of the off-season pool (overhaul, off-season salaries), spread by cane crushed; season close takes
	what is left."""
	pool, spread_so_far = float(pool or 0), float(spread_so_far or 0)
	left = max(pool - spread_so_far, 0.0)
	if season_close:
		return r2(left)
	if not season_tons:
		return 0.0
	return r2(min(pool * float(period_tons or 0) / float(season_tons), left))


SALARY_WORDS = ("salar", "wage", "eobi", "social security", "gratuity", "bonus", "provident", "payroll", "overtime", "group insurance")
POWER_WORDS = ("electric", "utility", "power", "fuel", "diesel", "furnace", "steam", "coal", "gas")
REPAIR_WORDS = ("repair", "maintenance", "overhaul", "rewinding")


def classify(account_name: str, voucher_type: str | None = None, item_group: str | None = None) -> str:
	"""The cost element of an expense line: stock issues by the item's top group, depreciation entries by their type,
	everything else by the account's name."""
	a = (account_name or "").lower()
	if voucher_type == "Stock Entry" and item_group:
		g = item_group.lower()
		if "chemical" in g:
			return "Power and fuel" if any(w in g for w in ("fuel", "lubric")) else "Chemicals"
		if any(w in g for w in ("fuel", "diesel", "lubric", "grease", "furnace")):
			return "Power and fuel"
		return "Stores and spares"
	if voucher_type == "Depreciation Entry" or "depreciation" in a:
		return "Depreciation"
	if any(w in a for w in SALARY_WORDS):
		return "Salaries and wages"
	if any(w in a for w in POWER_WORDS):
		return "Power and fuel"
	if any(w in a for w in REPAIR_WORDS):
		return "Repair and maintenance"
	if "chemical" in a:
		return "Chemicals"
	if any(w in a for w in ("stores", "spares", "consumable")):
		return "Stores and spares"
	return "Factory overheads"


def mill_extraction(mixed_juice_kg, mj_pol_pct, cane_kg, pol_pct_cane) -> float | None:
	"""Pol in mixed juice ÷ pol in cane × 100."""
	if not (mixed_juice_kg and mj_pol_pct and cane_kg and pol_pct_cane):
		return None
	return round(100 * float(mixed_juice_kg) * float(mj_pol_pct) / (float(cane_kg) * float(pol_pct_cane)), 2)


# ---------------------------------------------------------------- cost structure and price build-up
DIRECT_MATERIAL = ("Chemicals",)


def structure(cane_cost, packing, details: list, off_season=0.0, production_ccs: set | None = None) -> dict:
	"""Prime cost and factory overhead (FOH):
	direct materials = cane + chemicals + packing; direct labour = salaries booked to the production cost centres;
	FOH = power and fuel, stores and spares, repairs, depreciation, factory overheads, service-centre costs allocated in,
	and the off-season share."""
	dm = float(cane_cost or 0) + float(packing or 0)
	dl = foh = 0.0
	foh_lines: dict = {}
	for d in details:
		amt = float(d.get("amount") or 0)
		el = d.get("element")
		if el in DIRECT_MATERIAL:
			dm += amt
		elif el == "Salaries and wages" and not d.get("allocated_from") and (production_ccs is None or d.get("cost_center") in production_ccs):
			dl += amt
		else:
			key = "Service departments (allocated)" if d.get("allocated_from") else el
			foh_lines[key] = foh_lines.get(key, 0.0) + amt
			foh += amt
	if off_season:
		foh_lines["Off-season cost share"] = float(off_season)
		foh += float(off_season)
	return {"direct_material": r2(dm), "direct_labour": r2(dl), "prime_cost": r2(dm + dl), "factory_overhead": r2(foh),
		"foh_lines": {k: r2(v) for k, v in foh_lines.items()}, "cost_of_production": r2(dm + dl + foh)}


def price_build(cost_per_bag, margin_pct=0.0, gst_pct=18.0) -> dict:
	"""Cost per 50 kg bag → + profit margin → ex-mill price before GST → + GST → price after GST
	(and the cost itself with GST added: the GST-inclusive break-even)."""
	cost = float(cost_per_bag or 0)
	profit = r2(cost * float(margin_pct or 0) / 100)
	before = r2(cost + profit)
	gst = r2(before * float(gst_pct or 0) / 100)
	return {"cost_before_tax": r2(cost), "margin_pct": float(margin_pct or 0), "profit": profit, "price_before_gst": before,
		"gst_pct": float(gst_pct or 0), "gst": gst, "price_after_gst": r2(before + gst),
		"cost_after_gst": r2(cost * (1 + float(gst_pct or 0) / 100))}
