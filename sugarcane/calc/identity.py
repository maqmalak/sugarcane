"""CNIC and grower-ID formats.

CNIC: #####-#######-# (13 digits). Accepts digits with or without dashes/spaces and returns the dashed form.
Grower ID: <circle code>-<village code>-<serial in village>, e.g. 001-001-0001 (3, 3 and 4 digits).
"""

import re

CNIC_PATTERN = re.compile(r"^\d{5}-\d{7}-\d$")
CIRCLE_CODE_LEN = 3
VILLAGE_CODE_LEN = 3
GROWER_SERIAL_LEN = 4


class FormatError(ValueError):
	pass


def normalize_cnic(value: str | None) -> str | None:
	"""'3520212345671' / '35202 1234567 1' / '35202-1234567-1' → '35202-1234567-1'. Raises FormatError otherwise."""
	if not value:
		return None
	digits = re.sub(r"[\s-]", "", str(value))
	if not re.fullmatch(r"\d{13}", digits):
		raise FormatError(f"CNIC must be 13 digits in the form #####-#######-# (got {value!r})")
	return f"{digits[:5]}-{digits[5:12]}-{digits[12]}"


def is_valid_cnic(value: str | None) -> bool:
	return bool(value) and bool(CNIC_PATTERN.match(value))


def normalize_code(value, length: int, what: str = "Code") -> str:
	"""'1' → '001' for length 3. Only digits allowed; longer than `length` is an error."""
	text = str(value or "").strip()
	if not text.isdigit():
		raise FormatError(f"{what} must be digits only (got {value!r})")
	if len(text) > length:
		raise FormatError(f"{what} can have at most {length} digits (got {value!r})")
	if int(text) == 0:
		raise FormatError(f"{what} can't be zero")
	return text.zfill(length)


def grower_id_prefix(circle_code, village_code) -> str:
	return (
		f"{normalize_code(circle_code, CIRCLE_CODE_LEN, 'Circle code')}-"
		f"{normalize_code(village_code, VILLAGE_CODE_LEN, 'Village code')}-"
	)


def grower_id(circle_code, village_code, serial: int) -> str:
	if serial < 1 or serial >= 10**GROWER_SERIAL_LEN:
		raise FormatError(f"Grower serial must be 1–{10**GROWER_SERIAL_LEN - 1} (got {serial})")
	return f"{grower_id_prefix(circle_code, village_code)}{serial:0{GROWER_SERIAL_LEN}d}"


def _iban_mod97(text: str) -> int:
	digits = "".join(str(int(ch, 36)) for ch in text)
	return int(digits) % 97


def normalize_iban(value: str | None) -> str | None:
	"""Strips spaces, uppercases and checks the ISO 13616 mod-97 checksum (Pakistani IBANs are 24 characters)."""
	if not value:
		return None
	iban = re.sub(r"\s", "", str(value)).upper()
	if not re.fullmatch(r"[A-Z]{2}\d{2}[A-Z0-9]{8,30}", iban):
		raise FormatError(f"IBAN {value!r} is not in the right format")
	if iban.startswith("PK") and len(iban) != 24:
		raise FormatError(f"A Pakistani IBAN has 24 characters (got {len(iban)})")
	if _iban_mod97(iban[4:] + iban[:4]) != 1:
		raise FormatError(f"IBAN {value!r} has a wrong check digit")
	return iban


def normalize_mobile(value: str | None) -> str | None:
	"""Pakistani mobile → '03XXXXXXXXX' (11 digits). Accepts 0300-7212058, 0300 7212058, +92 300 7212058, 0092…, 923…
	Raises FormatError for anything else (wrong length, landline, not starting 03)."""
	if not value:
		return None
	d = re.sub(r"[\s\-().+]", "", str(value))
	if not d.isdigit():
		raise FormatError(f"Mobile {value!r} must contain digits only")
	if d.startswith("0092"):
		d = "0" + d[4:]
	elif d.startswith("92") and len(d) == 12:
		d = "0" + d[2:]
	elif d.startswith("3") and len(d) == 10:
		d = "0" + d
	if not re.fullmatch(r"03\d{9}", d):
		raise FormatError(f"Mobile {value!r} is not valid. Use 11 digits starting 03, e.g. 03007212058")
	return d


def make_iban(country: str, bban: str) -> str:
	"""IBAN with correct check digits for a country code and BBAN (used for demo data and tests)."""
	check = 98 - _iban_mod97(bban.upper() + country.upper() + "00")
	return f"{country.upper()}{check:02d}{bban.upper()}"
