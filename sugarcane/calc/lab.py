"""Laboratory and manufacturing calculations (pure, unit-tested).

Purity        purity % = pol ÷ brix × 100
CCS           commercial cane sugar % cane from a cane (core / vehicle) sample, the standard formula:
                CCS = 3/2 · S · (1 − (F + 5)/100) − 1/2 · B · (1 − (F + 3)/100)
              S = pol % juice, B = brix % juice, F = fibre % cane. Estimated recovery = CCS × recovery factor.
Cane crushed  opening yard + cane received − closing yard (kg)
Recovery      sugar made ÷ cane crushed × 100
Losses        pol lost in bagasse / press mud / final molasses, % cane = pol % of the stream × stream % cane ÷ 100;
              undetermined = pol % cane − recovery − known losses (when pol % cane is known)
Averages      the day's average of a stream is the plain mean of its samples (one per hour at most); purity of the average
              is recomputed from the average pol and brix, not averaged itself.
"""

from dataclasses import dataclass

from decimal import ROUND_HALF_UP

from sugarcane.calc import D


def r(value, places=3) -> float:
	"""Half-up rounding through Decimal (float round() would make 0.0525 → 0.052)."""
	return float(D(value).quantize(D(1).scaleb(-places), rounding=ROUND_HALF_UP))

PARAMETERS = ("brix", "pol", "purity", "ph", "moisture_pct", "fibre_pct", "colour_icumsa", "temperature_c")


class LabError(ValueError):
	pass


def purity(pol, brix):
	"""Pol ÷ brix × 100, 2 decimals; None when either is missing."""
	if pol in (None, "") or brix in (None, "") or not float(brix):
		return None
	p, b = float(pol), float(brix)
	if p < 0 or b < 0:
		raise LabError("Brix and pol can't be negative")
	if p > b:
		raise LabError(f"Pol {p} can't be more than brix {b}")
	return r(D(p) * 100 / D(b), 2)


def ccs(pol_juice, brix_juice, fibre_pct):
	"""Commercial cane sugar % cane (see module docstring)."""
	s, b, f = float(pol_juice), float(brix_juice), float(fibre_pct)
	if not (0 < s <= b < 40) or not (0 <= f < 40):
		raise LabError(f"Juice pol {s} / brix {b} / fibre {f} are outside what a cane sample can be")
	S, B, F = D(pol_juice), D(brix_juice), D(fibre_pct)
	return r(D("1.5") * S * (1 - (F + 5) / 100) - D("0.5") * B * (1 - (F + 3) / 100), 2)


def recovery_pct(sugar_kg, cane_kg):
	if not cane_kg:
		return 0.0
	if sugar_kg < 0 or cane_kg < 0:
		raise LabError("Sugar and cane can't be negative")
	return r(D(sugar_kg) * 100 / D(cane_kg), 3)


def crushed(opening_kg, received_kg, closing_kg) -> int:
	c = int(opening_kg or 0) + int(received_kg or 0) - int(closing_kg or 0)
	if c < 0:
		raise LabError(f"Closing yard {closing_kg} kg is more than the cane available ({int(opening_kg or 0) + int(received_kg or 0)} kg)")
	return c


def pct_cane(kg, cane_kg):
	return r(D(kg or 0) * 100 / D(cane_kg), 3) if cane_kg else 0.0


def crush_rate_tph(cane_kg, running_minutes):
	return r(D(cane_kg) / 1000 / (D(running_minutes) / 60), 2) if running_minutes else 0.0


def average(samples: list[dict]) -> dict:
	"""Mean of each parameter over the samples that have it; purity recomputed from the mean pol and brix."""
	out = {"samples": len(samples)}
	for p in PARAMETERS:
		# 0 is an empty number field (nothing measured): no stream is ever 0 brix / pol / pH
		vals = [float(s[p]) for s in samples if s.get(p) not in (None, "") and float(s[p]) != 0 and p != "purity"]
		out[p] = r(sum(D(v) for v in vals) / len(vals), 3) if vals else None
	out["purity"] = purity(out["pol"], out["brix"]) if out.get("pol") and out.get("brix") else None
	return out


@dataclass(frozen=True)
class Losses:
	bagasse: float
	press_mud: float
	molasses: float
	known: float
	undetermined: float | None


def losses(cane_kg, bagasse_kg, bagasse_pol, mud_kg, mud_pol, molasses_kg, molasses_pol, recovery, pol_pct_cane=None) -> Losses:
	"""Pol lost in each stream as % cane; undetermined only when pol % cane is known."""
	b = r(D(pct_cane(bagasse_kg, cane_kg)) * D(bagasse_pol or 0) / 100)
	m = r(D(pct_cane(mud_kg, cane_kg)) * D(mud_pol or 0) / 100)
	f = r(D(pct_cane(molasses_kg, cane_kg)) * D(molasses_pol or 0) / 100)
	known = r(D(b) + D(m) + D(f))
	und = r(D(pol_pct_cane) - D(recovery) - D(known)) if pol_pct_cane else None
	return Losses(b, m, f, known, und)


def bag_bom(standard_recovery_pct, bag_kg=50, molasses_pct=4.5, bagasse_pct=30, mud_pct=3.5) -> dict:
	"""Quantities per bag of sugar for the BOM: cane needed at the standard recovery and the by-products it leaves."""
	rec = D(standard_recovery_pct)
	if rec <= 0 or rec >= 25:
		raise LabError("The standard recovery must be between 0 and 25 %")
	cane = D(bag_kg) * 100 / rec
	q = lambda pct: r(cane * D(pct) / 100)  # noqa: E731
	return {"cane_kg": r(cane), "molasses_kg": q(molasses_pct), "bagasse_kg": q(bagasse_pct), "press_mud_kg": q(mud_pct)}
