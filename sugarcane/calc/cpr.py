"""Cane Purchase Receipt (CPR) formula — MicroMax rules.

Weight
	net_kg        = gross_kg − tare_kg
	binding_kg    = net_kg / 100 × binding_kg_per_quintal          (0.265 kg per quintal for 2026-27)
	garbage_kg    = net_kg × garbage_pct / 100 + garbage_fixed_kg
	payable_kg    = net_kg − binding_kg − garbage_kg               (deductions rounded to whole kg)
	payable_maund = payable_kg / 40                                 (shown to 3 decimals)

Amount (computed from kg so maund rounding never leaks into money)
	govt_value         = payable_kg × govt_rate / 40
	road_cess_total    = govt_value × road_cess_pct / 100           (100% deposited to government monthly)
	road_cess_grower   = road_cess_total × grower_cess_share_pct / 100   (50%: deducted from the grower)
	road_cess_mill     = road_cess_total − road_cess_grower              (50%: borne by the mill)
	subsidy            = payable_kg × subsidy_rate / 40             (paid by the mill)
	additional_subsidy = payable_kg × additional_subsidy_rate / 40  (paid by the mill)
	net_amount         = govt_value − road_cess_grower + subsidy + additional_subsidy
	tpt_amount         = payable_kg × tpt_rate / 40                 (TPT per maund, paid to the driver as a Bilty)
	loan_deduction     = min(requested, net_amount − tpt_amount)
	payable_cpr        = net_amount − tpt_amount − loan_deduction

No withholding tax on cane purchase (MicroMax policy).
Each amount is rounded to paisa before it is used in the next step.

Journal Entry (balanced by construction, see journal_lines):
	Dr Cane Purchase Clearing   govt_value
	Dr Subsidy Purchase         subsidy
	Dr Additional Subsidy       additional_subsidy
	Dr Road Cess – Mill Share   road_cess_mill
	Cr Road Cess Payable – Govt road_cess_total
	Cr TPT/Bilty Payable        tpt_amount
	Cr Grower Loan Receivable   loan_deduction
	Cr Grower Payable           payable_cpr
"""

from dataclasses import asdict, dataclass

from sugarcane.calc import ZERO, D, money, whole_kg
from sugarcane.calc.units import MAUND_KG, QUINTAL_KG, kg_to_maund


class CPRError(ValueError):
	pass


@dataclass(frozen=True)
class CPRInput:
	gross_kg: object
	tare_kg: object
	govt_rate: object  # per maund
	road_cess_pct: object = 0
	grower_cess_share_pct: object = 50
	subsidy_rate: object = 0  # per maund
	additional_subsidy_rate: object = 0  # per maund
	tpt_rate: object = 0  # per maund
	binding_kg_per_quintal: object = 0
	garbage_pct: object = 0
	garbage_fixed_kg: object = 0
	loan_deduction: object = 0  # requested; capped so payable_cpr never goes negative
	maund_kg: object = MAUND_KG


@dataclass(frozen=True)
class CPRResult:
	gross_kg: object
	tare_kg: object
	net_kg: object
	binding_kg: object
	garbage_kg: object
	payable_kg: object
	payable_maund: object
	govt_rate: object
	govt_value: object
	road_cess_pct: object
	road_cess_total: object
	grower_cess_share_pct: object
	road_cess_grower: object
	road_cess_mill: object
	subsidy_rate: object
	subsidy: object
	additional_subsidy_rate: object
	additional_subsidy: object
	net_amount: object
	tpt_rate: object
	tpt_amount: object
	loan_deduction: object
	loan_capped: bool
	payable_cpr: object

	def as_dict(self, floats: bool = False) -> dict:
		data = asdict(self)
		if floats:
			data = {k: (float(v) if not isinstance(v, bool) else v) for k, v in data.items()}
		return data


def _per_maund(kg, rate, maund_kg):
	return money(D(kg) * D(rate) / D(maund_kg))


def compute(inp: CPRInput) -> CPRResult:
	gross, tare = whole_kg(inp.gross_kg), whole_kg(inp.tare_kg)
	if gross <= 0:
		raise CPRError("Gross weight must be more than zero")
	if tare < 0:
		raise CPRError("Tare weight can't be negative")
	net = gross - tare
	if net <= 0:
		raise CPRError(f"Net weight must be more than zero (gross {gross} kg, tare {tare} kg)")
	for name in ("govt_rate", "road_cess_pct", "grower_cess_share_pct", "subsidy_rate", "additional_subsidy_rate",
			"tpt_rate", "binding_kg_per_quintal", "garbage_pct", "garbage_fixed_kg", "loan_deduction"):
		if D(getattr(inp, name)) < 0:
			raise CPRError(f"{name} can't be negative")
	if D(inp.grower_cess_share_pct) > 100:
		raise CPRError("Grower share of road cess can't be more than 100%")
	maund_kg = D(inp.maund_kg) or D(MAUND_KG)

	binding = whole_kg(net / D(QUINTAL_KG) * D(inp.binding_kg_per_quintal))
	garbage = whole_kg(net * D(inp.garbage_pct) / 100 + D(inp.garbage_fixed_kg))
	payable_kg = net - binding - garbage
	if payable_kg <= 0:
		raise CPRError(f"Deductions ({binding} + {garbage} kg) leave no payable weight out of {net} kg")

	govt_value = _per_maund(payable_kg, inp.govt_rate, maund_kg)
	cess_total = money(govt_value * D(inp.road_cess_pct) / 100)
	cess_grower = money(cess_total * D(inp.grower_cess_share_pct) / 100)
	cess_mill = cess_total - cess_grower
	subsidy = _per_maund(payable_kg, inp.subsidy_rate, maund_kg)
	additional = _per_maund(payable_kg, inp.additional_subsidy_rate, maund_kg)
	net_amount = govt_value - cess_grower + subsidy + additional
	tpt = _per_maund(payable_kg, inp.tpt_rate, maund_kg)
	if tpt > net_amount:
		raise CPRError(f"TPT ({tpt}) is more than the net amount ({net_amount})")

	requested_loan = money(inp.loan_deduction)
	room = net_amount - tpt
	loan = min(requested_loan, room)
	payable = net_amount - tpt - loan

	return CPRResult(
		gross_kg=gross, tare_kg=tare, net_kg=net, binding_kg=binding, garbage_kg=garbage, payable_kg=payable_kg,
		payable_maund=kg_to_maund(payable_kg, maund_kg),
		govt_rate=money(inp.govt_rate), govt_value=govt_value,
		road_cess_pct=D(inp.road_cess_pct), road_cess_total=cess_total,
		grower_cess_share_pct=D(inp.grower_cess_share_pct), road_cess_grower=cess_grower, road_cess_mill=cess_mill,
		subsidy_rate=money(inp.subsidy_rate), subsidy=subsidy,
		additional_subsidy_rate=money(inp.additional_subsidy_rate), additional_subsidy=additional,
		net_amount=net_amount, tpt_rate=money(inp.tpt_rate), tpt_amount=tpt,
		loan_deduction=loan, loan_capped=loan < requested_loan, payable_cpr=payable,
	)


# account keys match the Sugar Settings fields that hold the account names
JOURNAL_ACCOUNTS = (
	("cane_purchase_clearing_account", "govt_value", "debit"),
	("subsidy_purchase_account", "subsidy", "debit"),
	("additional_subsidy_account", "additional_subsidy", "debit"),
	("road_cess_expense_account", "road_cess_mill", "debit"),
	("road_cess_payable_account", "road_cess_total", "credit"),
	("tpt_payable_account", "tpt_amount", "credit"),
	("grower_loan_account", "loan_deduction", "credit"),
	("grower_payable_account", "payable_cpr", "credit"),
)


def journal_lines(result: CPRResult) -> list[dict]:
	"""[{account_key, debit, credit}] for the CPR Journal Entry, zero lines dropped. Always balances."""
	lines = []
	for key, field, side in JOURNAL_ACCOUNTS:
		amount = getattr(result, field)
		if amount:
			lines.append({"account_key": key, "debit": amount if side == "debit" else ZERO,
				"credit": amount if side == "credit" else ZERO, "source": field})
	return lines
