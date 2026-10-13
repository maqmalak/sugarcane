"""Pure calculations: no database, no frappe imports. Controllers gather inputs, call these and store the results.

All money and weight maths uses Decimal with ROUND_HALF_UP so a printed slip adds up exactly.
"""

from decimal import ROUND_HALF_UP, Decimal

ZERO = Decimal("0")
KG = Decimal("1")
PAISA = Decimal("0.01")
MILLI = Decimal("0.001")


def D(value) -> Decimal:
	"""Decimal from int / float / str / None (None and "" are 0). Floats go through str() so 0.265 stays 0.265."""
	if value is None or value == "":
		return ZERO
	if isinstance(value, Decimal):
		return value
	return Decimal(str(value))


def round_to(value, step: Decimal) -> Decimal:
	return D(value).quantize(step, rounding=ROUND_HALF_UP)


def money(value) -> Decimal:
	return round_to(value, PAISA)


def whole_kg(value) -> Decimal:
	return round_to(value, KG)
