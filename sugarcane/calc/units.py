"""Weight and area units used in Pakistani cane procurement.

Weight: the weighbridge records kg; rates are per maund (40 kg, Sugar Settings → maund_kg); 1 quintal = 100 kg.
Area: 1 acre = 8 kanal; 1 murabba ≈ 25 acres.
"""

from sugarcane.calc import MILLI, D, round_to

MAUND_KG = 40
QUINTAL_KG = 100
KANAL_PER_ACRE = 8
ACRES_PER_MURABBA = 25
SQ_M_PER_ACRE = 4046.8564224


def kg_to_maund(kg, maund_kg=MAUND_KG):
	return round_to(D(kg) / D(maund_kg), MILLI)


def maund_to_kg(maund, maund_kg=MAUND_KG):
	return D(maund) * D(maund_kg)


def kg_to_quintal(kg):
	return D(kg) / D(QUINTAL_KG)


def acres_to_kanal(acres):
	return D(acres) * KANAL_PER_ACRE


def kanal_to_acres(kanal):
	return D(kanal) / KANAL_PER_ACRE


def acres_to_murabba(acres):
	return D(acres) / ACRES_PER_MURABBA


def sq_m_to_acres(sq_m):
	return D(sq_m) / D(SQ_M_PER_ACRE)
