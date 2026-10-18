"""Demo masters for MicroMax Sugar Mills Ltd. (fictional people, fictional CNICs and accounts).

	bench --site sugarcane.local sc-demo          # create (idempotent; re-running adds nothing twice)
	bench --site sugarcane.local sc-reset-demo    # delete every is_demo record, then create again

Geography is the Sargodha / Khushab / Jhang cane belt; villages are named in the local "Chak" style. Demo staff log
in as <role>@micromaxsugar.example with the password in ~/.sugarcane-site-secrets (STAFF_DEMO_PASSWORD).
"""

import os
import random

import frappe
from frappe.utils import cint

from sugarcane.calc.identity import make_iban
from sugarcane.setup.company import ensure_company

SEED = 2026
SEASON = "2026-27"
EMAIL_DOMAIN = "micromaxsugar.example"
CENTRE = (32.083, 72.671)  # Sargodha

ZONES = (  # zone, district, division
	("North Zone", "Sargodha", "Sargodha"),
	("West Zone", "Khushab", "Sargodha"),
	("South Zone", "Jhang", "Faisalabad"),
)
CIRCLES = (  # name, zone, affiliation, quality, distance, (lat, lng) ≈ the town it is named after
	("Bhalwal", "North Zone", "Own", "A", 18, (32.265, 72.899)), ("Phularwan", "North Zone", "Own", "A", 26, (32.385, 73.010)),
	("Kot Momin", "North Zone", "Affiliated", "B", 34, (32.190, 73.030)), ("Midh Ranjha", "North Zone", "Own", "B", 22, (32.330, 73.160)),
	("Sillanwali", "West Zone", "Own", "A", 30, (31.825, 72.540)), ("Sahiwal", "West Zone", "Affiliated", "B", 41, (31.970, 72.330)),
	("Jauharabad", "West Zone", "Free", "C", 55, (32.290, 72.280)), ("Quaidabad", "West Zone", "Affiliated", "C", 62, (32.330, 71.910)),
	("Shorkot", "South Zone", "Own", "B", 48, (30.830, 72.080)), ("Ahmedpur Sial", "South Zone", "Free", "C", 70, (30.680, 71.740)),
	("Athara Hazari", "South Zone", "Affiliated", "B", 58, (31.150, 72.120)), ("Chiniot Road", "South Zone", "Own", "A", 38, (31.720, 72.980)),
)
VARIETIES = (  # name, maturity, yield maund/acre, recovery %, colour
	("CPF-246", "Early", 950, 10.8, "#2f9e44"), ("CPF-247", "Mid", 900, 10.5, "#1971c2"),
	("CPF-249", "Early", 980, 11.0, "#e8590c"), ("CPF-250", "Mid", 920, 10.6, "#9c36b5"),
	("CPF-251", "Late", 1000, 10.2, "#c2255c"), ("CPF-253", "Early", 1010, 11.2, "#0c8599"),
	("HSF-240", "Mid", 870, 10.1, "#e67700"), ("SPF-234", "Late", 840, 9.8, "#5c940d"),
	("CP-77-400", "Mid", 800, 9.6, "#495057"), ("HoSF-1", "Late", 860, 9.9, "#862e9c"),
)
DISEASES = (("Red Rot", "High", "#c92a2a"), ("Smut", "High", "#5f3dc4"), ("Pokkah Boeng", "Medium", "#e67700"),
	("Sugarcane Mosaic", "Medium", "#2b8a3e"), ("Top Borer", "Medium", "#a61e4d"), ("Root Borer", "Low", "#795548"),
	("Pyrilla", "Low", "#868e96"), ("Whip Smut", "High", "#343a40"))
VEHICLE_TYPES = (  # name, min/max gross, min/max tare, lane
	("Tractor Trolley", 4000, 22000, 2200, 5500, "Lane 1 - Trolley"),
	("Double Trolley", 8000, 36000, 4000, 8500, "Lane 1 - Trolley"),
	("Truck", 10000, 42000, 6500, 13000, "Lane 2 - Truck"),
	("Mini Truck", 2500, 9000, 1500, 3200, "Lane 2 - Truck"),
	("Bullock Cart", 400, 3000, 150, 700, "Lane 3 - Cart"),
)
LANES = (("Lane 1 - Trolley", "Gate 1", 10), ("Lane 2 - Truck", "Gate 1", 20), ("Lane 3 - Cart", "Gate 2", 30))
SOURCES = (  # name, type, distance, (lat, lng) offset
	("Mill Gate", "Factory Gate", 0, (0, 0)), ("Check Post Bhalwal", "Check Post", 18, (0.12, 0.05)),
	("Check Post Sillanwali", "Check Post", 30, (-0.18, -0.20)), ("Check Post Shorkot", "Check Post", 48, (-0.42, 0.10)),
	("Depot Kot Momin", "Depot", 34, (0.08, 0.30)), ("Depot Quaidabad", "Depot", 62, (0.05, -0.55)),
	("Depot Ahmedpur Sial", "Depot", 70, (-0.62, -0.05)),
)
CONTRACTORS = ("Al-Noor Goods Transport", "Madina Cane Carriers", "Sial Brothers Loading", "Ranjha Loaders & Co.",
	"Haider Transport Company", "Chenab Logistics")
FIRST = ("Muhammad", "Ghulam", "Allah", "Abdul", "Haji", "Rana", "Malik", "Chaudhry", "Mian", "Syed")
NAMES = ("Aslam", "Akram", "Arshad", "Ashraf", "Bashir", "Iqbal", "Nawaz", "Sarwar", "Rasool", "Hussain", "Ramzan",
	"Shafi", "Yousaf", "Riaz", "Tariq", "Khalid", "Javed", "Zafar", "Nazir", "Latif", "Hanif", "Sadiq", "Rafiq",
	"Imran", "Asif", "Shahid", "Saleem", "Anwar", "Qadir", "Ditta", "Bakhsh", "Din", "Ahmad", "Ali", "Abbas", "Hassan")
LAST = ("Ranjha", "Sial", "Gondal", "Bhatti", "Tiwana", "Awan", "Cheema", "Warraich", "Joiya", "Noon", "Lak", "Mekan",
	"Khokhar", "Bharwana", "Kharal", "Wattoo", "Jappa", "Sipra", "Baloch", "Arain")
WOMEN = ("Bibi", "Begum", "Khatoon", "Sughran", "Rasheedan", "Nusrat", "Parveen", "Shamim")
BANKS = (("HBL", "HABB"), ("MCB Bank", "MUCB"), ("UBL", "UNIL"), ("Allied Bank", "ABPA"), ("Bank Alfalah", "ALFH"),
	("National Bank of Pakistan", "NBPA"), ("Meezan Bank", "MEZN"))
ROLE_USERS = {  # email prefix: (first, last, roles)
	"cane.manager": ("Tahir", "Mehmood", ["Cane Manager"]),
	"cane.admin": ("Kashif", "Raza", ["Cane Admin"]),
	"circle.north": ("Waseem", "Abbas", ["Circle Officer"]),
	"circle.south": ("Naveed", "Akhtar", ["Circle Officer"]),
	"surveyor": ("Adeel", "Haider", ["Surveyor"]),
	"indent.clerk": ("Faisal", "Iqbal", ["Indent Clerk"]),
	"token.clerk": ("Usman", "Ghani", ["Token Clerk"]),
	"gross.weighman": ("Sajid", "Mahmood", ["Gross Weighman"]),
	"tare.weighman": ("Zeeshan", "Ali", ["Tare Weighman"]),
	"yard.supervisor": ("Rizwan", "Ahmad", ["Yard Supervisor"]),
	"cane.cashier": ("Imtiaz", "Hussain", ["Cane Cashier"]),
	"lab.chemist": ("Ayesha", "Siddiqa", ["Lab Chemist"]),
	"production": ("Farhan", "Saeed", ["Production Manager"]),
	"cane.accountant": ("Nadia", "Rehman", ["Cane Accountant", "Accounts User"]),
	"depot.user": ("Shahbaz", "Nasir", ["Depot User"]),
	"mis": ("Omer", "Farooq", ["MIS Viewer"]),
	"lp.north": ("Ghulam", "Murtaza", ["LP Operator"]),
	"lp.south": ("Asif", "Javed", ["LP Operator"]),
	"elp.auditor": ("Sana", "Malik", ["ELP Auditor"]),
}
SCOPES = {  # user prefix -> circles they may see
	"circle.north": ("Bhalwal", "Phularwan", "Kot Momin", "Midh Ranjha"),
	"circle.south": ("Shorkot", "Ahmedpur Sial", "Athara Hazari", "Chiniot Road"),
}
GROWERS = 500
DEMO_DOCTYPES = (  # deletion order for reset (children first)
	"Grower Passbook", "Grower", "Sugar Vehicle", "Loading Point", "Cane Depot", "Cane Source", "Cane Village",
	"Cane Sector", "Cane Circle", "Sugar Zone", "Sugar District", "Sugar Division", "Vehicle Type", "Vehicle Lane",
	"Cane Variety", "Crop Disease", "Crushing Shift", "Crushing Season",
)


def run(growers: int = GROWERS):
	rnd = random.Random(SEED)
	frappe.flags.mute_emails = True
	frappe.flags.sugar_sms_off = True  # replayed with their own dates by demo_messages
	company = ensure_company()
	_season(company)
	_shifts()
	_hierarchy(rnd)
	_crop()
	_vehicle_masters()
	contractors = _contractors(company)
	_sources(rnd, contractors)
	_terminals()
	_growers(rnd, cint(growers))
	_vehicles(rnd, contractors)
	_users()
	frappe.db.commit()
	from sugarcane.setup import demo_survey

	demo_survey.run(_staff_password())
	from sugarcane.setup import demo_accounts, demo_elp, demo_indent, demo_lab, demo_procurement

	demo_indent.run()
	demo_elp.run()
	demo_accounts.loans()
	demo_procurement.run()
	demo_lab.run()
	demo_accounts.payments()
	from sugarcane.setup import demo_messages

	demo_messages.run()
	counts = {dt: frappe.db.count(dt) for dt in ("Cane Circle", "Cane Village", "Grower", "Grower Passbook", "Sugar Vehicle",
		"Cane Survey", "Survey Overlap Review", "Surveyor Attendance", "Surveyor Location Log", "Indent Batch", "Cane Indent", "Cane Token", "Cane Purchase Receipt", "TPT Bilty", "Daily Cane Purchase")}
	print("Demo ready:", counts)
	return counts


LINKED_TABLES = (  # rows that point at a record by (doctype field, name field); cleared with the record
	("Version", "ref_doctype", "docname"), ("Comment", "reference_doctype", "reference_name"),
	("DocShare", "share_doctype", "share_name"), ("ToDo", "reference_type", "reference_name"),
	("View Log", "reference_doctype", "reference_name"), ("Document Follow", "ref_doctype", "ref_docname"),
	("Activity Log", "reference_doctype", "reference_name"),
)


def _purge(doctype, names):
	"""Delete records and everything hanging off them in bulk (no per-record delete jobs), including their files."""
	if not names:
		return
	import os

	for f in frappe.get_all("File", filters={"attached_to_doctype": doctype, "attached_to_name": ["in", names]},
			fields=["name", "file_url", "is_private"]):
		path = frappe.get_site_path(f.file_url.lstrip("/")) if f.file_url and f.is_private else (
			frappe.get_site_path("public", f.file_url.lstrip("/")) if f.file_url else None)
		if path and os.path.exists(path):
			os.remove(path)
	frappe.db.delete("File", {"attached_to_doctype": doctype, "attached_to_name": ["in", names]})
	for i in range(0, len(names), 500):
		chunk = names[i:i + 500]
		for df in frappe.get_meta(doctype).get_table_fields():
			frappe.db.delete(df.options, {"parent": ["in", chunk], "parenttype": doctype})
		for table, dt_field, name_field in LINKED_TABLES:
			frappe.db.delete(table, {dt_field: doctype, name_field: ["in", chunk]})
		frappe.db.delete(doctype, {"name": ["in", chunk]})


def reset():
	from sugarcane.setup import demo_accounts, demo_elp, demo_indent, demo_lab, demo_procurement, demo_survey

	from sugarcane.setup import demo_messages

	demo_messages.reset()
	demo_accounts.reset_payments()
	demo_lab.reset()
	demo_procurement.reset()
	demo_accounts.reset_loans()
	demo_elp.reset()
	demo_indent.reset()
	demo_survey.reset()
	for dt in DEMO_DOCTYPES:
		names = frappe.get_all(dt, filters={"is_demo": 1}, pluck="name")
		if dt == "Grower" and names:
			_purge("Bank Account", frappe.get_all("Bank Account",
				filters={"party_type": "Grower", "party": ["in", names]}, pluck="name"))
			for prefix in {n.rsplit("-", 1)[0] + "-" for n in names}:
				frappe.db.delete("Series", {"name": prefix})
		_purge(dt, names)
		frappe.db.commit()
	settings = frappe.get_single("Sugar Settings")
	if settings.active_season and not frappe.db.exists("Crushing Season", settings.active_season):
		settings.db_set("active_season", None)
	frappe.clear_cache()
	run()


def _insert(doc: dict):
	"""Insert unless a record with that name / unique key already exists. Marks it as demo."""
	doc = frappe.get_doc({**doc, "is_demo": 1})
	doc.flags.ignore_permissions = True
	doc.insert()
	return doc


def _exists(dt, name_or_filters):
	return frappe.db.exists(dt, name_or_filters)


def _season(company):
	if not _exists("Crushing Season", SEASON):
		_insert({"doctype": "Crushing Season", "season_name": SEASON, "company": company, "status": "Open",
			"start_date": "2026-11-01", "end_date": "2027-03-31", "crushing_target_maund": 18_000_000,
			"govt_rate": 425, "road_cess_pct": 1, "grower_cess_share_pct": 50, "tpt_rate": 30,
			"subsidy_rate": 10, "additional_subsidy_rate": 5, "binding_kg_per_quintal": 0.265, "garbage_pct": 0,
			"standard_recovery_pct": 10, "bag_weight_kg": 50,
			"molasses_nrv_per_kg": 32, "bagasse_nrv_per_kg": 9, "press_mud_nrv_per_kg": 2.5})


def _shifts():
	for name, start, end in (("Shift A", "07:00:00", "15:00:00"), ("Shift B", "15:00:00", "23:00:00"),
			("Shift C", "23:00:00", "07:00:00")):
		if not _exists("Crushing Shift", name):
			_insert({"doctype": "Crushing Shift", "shift_name": name, "start_time": start, "end_time": end})


def _square(lat, lng, half):
	ring = [[lng - half, lat - half], [lng + half, lat - half], [lng + half, lat + half], [lng - half, lat + half],
		[lng - half, lat - half]]
	return frappe.as_json({"type": "FeatureCollection", "features": [
		{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}]})


def _hierarchy(rnd):
	for zone, district, division in ZONES:
		if not _exists("Sugar Division", division):
			_insert({"doctype": "Sugar Division", "division_name": division})
		if not _exists("Sugar District", district):
			_insert({"doctype": "Sugar District", "district_name": district, "division": division})
		if not _exists("Sugar Zone", zone):
			_insert({"doctype": "Sugar Zone", "zone_name": zone, "district": district, "is_free_area": 0})

	chak = 1
	for i, (name, zone, affiliation, quality, distance, (clat, clng)) in enumerate(CIRCLES, start=1):
		code = f"{i:03d}"
		if not _exists("Cane Circle", name):
			_insert({"doctype": "Cane Circle", "circle_name": name, "circle_code": code, "zone": zone,
				"affiliation": affiliation, "quality_grade": quality, "distance_km": distance,
				"quota_maund": rnd.choice((1_200_000, 1_500_000, 1_800_000)),
				"cane_incentive_rate": 0 if affiliation == "Free" else rnd.choice((0, 2, 3, 5)),
				"polygon": _square(clat, clng, 0.06)})
		sectors = []
		for s in (1, 2, 3):
			sector_name = f"{name} {('East', 'West', 'Central')[s - 1]}"
			sector = f"{code}-S{s:02d}"
			if not _exists("Cane Sector", sector):
				_insert({"doctype": "Cane Sector", "sector_name": sector_name, "sector_code": str(s), "circle": name})
			sectors.append(sector)
		villages = 12 if i % 2 else 13
		for v in range(1, villages + 1):
			suffix = ("NB", "SB", "JB", "MB")[(i + v) % 4]
			if not _exists("Cane Village", f"{code}-{v:03d}"):
				vlat, vlng = clat + rnd.uniform(-0.05, 0.05), clng + rnd.uniform(-0.05, 0.05)
				_insert({"doctype": "Cane Village", "village_name": f"Chak {chak} {suffix}", "village_code": str(v),
					"circle": name, "sector": sectors[(v - 1) % 3], "distance_km": distance + rnd.randint(-6, 8),
					"latitude": round(vlat, 6), "longitude": round(vlng, 6),
					"cane_incentive_rate": rnd.choice((0, 0, 1, 2)), "tpt_subsidy_rate": rnd.choice((0, 0, 2)),
					"polygon": _square(vlat, vlng, 0.008)})
			chak += 1


def _crop():
	for name, maturity, yld, recovery, color in VARIETIES:
		if not _exists("Cane Variety", name):
			_insert({"doctype": "Cane Variety", "variety_name": name, "variety_code": name.replace("-", ""),
				"maturity": maturity, "ratoon_allowed": 1, "expected_yield": yld, "expected_recovery_pct": recovery,
				"map_color": color})
	for name, severity, color in DISEASES:
		if not _exists("Crop Disease", name):
			_insert({"doctype": "Crop Disease", "disease_name": name, "severity": severity, "map_color": color})


def _vehicle_masters():
	for name, gate, priority in LANES:
		if not _exists("Vehicle Lane", name):
			_insert({"doctype": "Vehicle Lane", "lane_name": name, "gate": gate, "priority": priority})
	for name, gmin, gmax, tmin, tmax, lane in VEHICLE_TYPES:
		if not _exists("Vehicle Type", name):
			_insert({"doctype": "Vehicle Type", "vehicle_type_name": name, "min_gross_kg": gmin, "max_gross_kg": gmax,
				"min_tare_kg": tmin, "max_tare_kg": tmax, "default_lane": lane})


def _contractors(company):
	group = frappe.db.get_single_value("Sugar Settings", "contractor_supplier_group") or "Cane Contractor"
	out = []
	for name in CONTRACTORS:
		existing = frappe.db.get_value("Supplier", {"supplier_name": name}, "name")
		if not existing:
			sup = frappe.get_doc({"doctype": "Supplier", "supplier_name": name, "supplier_group": group,
				"supplier_type": "Company", "country": "Pakistan"})
			sup.insert(ignore_permissions=True)
			existing = sup.name
		out.append(existing)
	return out


def _sources(rnd, contractors):
	circle_of = {"Bhalwal": "Bhalwal", "Sillanwali": "Sillanwali", "Shorkot": "Shorkot", "Kot Momin": "Kot Momin",
		"Quaidabad": "Quaidabad", "Ahmedpur Sial": "Ahmedpur Sial"}
	tpt = {"Tractor Trolley": 30, "Double Trolley": 28, "Truck": 26, "Mini Truck": 32, "Bullock Cart": 0}
	for name, kind, distance, (dlat, dlng) in SOURCES:
		lat, lng = CENTRE[0] + dlat, CENTRE[1] + dlng
		if not _exists("Cane Source", name):
			bump = 0 if kind == "Factory Gate" else round(distance / 10)
			_insert({"doctype": "Cane Source", "source_name": name, "source_type": kind, "distance_km": distance,
				"latitude": lat, "longitude": lng,
				"tpt_rates": [{"vehicle_type": vt, "tpt_rate": rate + bump if rate else 0} for vt, rate in tpt.items()]})
		town = name.split(" ", 2)[-1] if kind != "Factory Gate" else None
		circle = circle_of.get(town)
		if kind == "Depot":
			if not _exists("Cane Depot", name):
				_insert({"doctype": "Cane Depot", "depot_name": name, "source": name, "circle": circle,
					"contractor": rnd.choice(contractors), "depot_rate": 12 + round(distance / 10),
					"target_maund": rnd.choice((600_000, 800_000, 1_000_000)), "latitude": lat, "longitude": lng,
					"geofence_radius_m": 250, "geofence": _square(lat, lng, 0.002)})
		elif kind == "Check Post":
			for n in (1, 2):
				lp = f"LP {town} {n}"
				if not _exists("Loading Point", lp):
					plat, plng = lat + rnd.uniform(-0.03, 0.03), lng + rnd.uniform(-0.03, 0.03)
					_insert({"doctype": "Loading Point", "loading_point_name": lp, "source": name, "circle": circle,
						"contractor": rnd.choice(contractors), "loading_rate": rnd.choice((6, 7, 8)),
						"target_maund": rnd.choice((300_000, 400_000, 500_000)), "latitude": plat, "longitude": plng,
						"geofence_radius_m": 150, "geofence": _square(plat, plng, 0.0015)})


def _terminals():
	for name, no, ops, ip in (("WB-1 Gross", "1", "Gross", "127.0.0.1"), ("WB-2 Tare", "2", "Tare", "192.168.10.12"),
			("WB-3 Misc", "3", "Misc", "192.168.10.13")):
		if not _exists("Weighbridge Terminal", name):
			doc = frappe.get_doc({"doctype": "Weighbridge Terminal", "terminal_name": name, "weighbridge_no": no,
				"allowed_operations": ops, "ip_address": ip, "indicator_protocol": "Simulator", "lane": "Lane 1 - Trolley"})
			doc.insert(ignore_permissions=True)


def _person(rnd):
	woman = rnd.random() < 0.06
	if woman:
		name = f"{rnd.choice(WOMEN)} {rnd.choice(('Bibi', 'Begum', 'Mai'))}"
	else:
		name = f"{rnd.choice(FIRST)} {rnd.choice(NAMES)}"
		if rnd.random() < 0.5:
			name += f" {rnd.choice(LAST)}"
	father = f"{rnd.choice(FIRST)} {rnd.choice(NAMES)} {rnd.choice(LAST)}"
	return name, father, woman


def _growers(rnd, count):
	have = frappe.db.count("Grower", {"is_demo": 1})
	if have >= count:
		return
	villages = frappe.get_all("Cane Village", filters={"is_demo": 1}, fields=["name", "circle", "village_code"],
		order_by="name")
	district_prefix = {"North Zone": "38403", "West Zone": "38201", "South Zone": "33202"}
	zone_of = dict(frappe.get_all("Cane Circle", fields=["name", "zone"], as_list=True))
	used = set(frappe.get_all("Grower", pluck="cnic"))
	for n in range(have, count):
		v = villages[n % len(villages)]
		name, father, woman = _person(rnd)
		while True:
			last = rnd.choice("24680") if woman else rnd.choice("13579")
			cnic = f"{district_prefix[zone_of[v.circle]]}-{rnd.randint(1000000, 9999999)}-{last}"
			if cnic not in used:
				used.add(cnic)
				break
		has_bank = rnd.random() < 0.82
		bank, code = rnd.choice(BANKS)
		account_no = f"{rnd.randint(10**15, 10**16 - 1)}"
		grower = _insert({"doctype": "Grower", "grower_name": name, "father_name": father, "cnic": cnic,
			"mobile": f"03{rnd.choice('0123456')}{rnd.randint(10_000_000, 99_999_999)}",
			"circle": v.circle, "village": v.name, "filer_status": "Filer" if rnd.random() < 0.15 else "Non-Filer",
			**({"bank_name": bank, "branch_name": v.circle, "branch_code": f"{rnd.randint(1, 9999):04d}",
				"account_title": name, "account_no": account_no, "iban": make_iban("PK", f"{code}{account_no}")}
				if has_bank else {})})
		holdings = [{"murabba_no": str(rnd.randint(1, 180)), "killa_no": str(rnd.randint(1, 25)),
			"acres": rnd.choice((1, 1.5, 2, 2.5, 3, 4, 5, 6.25, 8, 12.5)),
			"ownership": rnd.choice(("Owned", "Owned", "Owned", "Leased", "Shared"))} for _ in range(rnd.randint(1, 3))]
		_insert({"doctype": "Grower Passbook", "passbook_no": f"PB-{grower.name}", "grower": grower.name,
			"issue_season": SEASON, "issue_date": "2026-09-15", "land_holdings": holdings})
		if n % 100 == 99:
			frappe.db.commit()


def _vehicles(rnd, contractors):
	if frappe.db.count("Sugar Vehicle", {"is_demo": 1}):
		return
	types = [t[0] for t in VEHICLE_TYPES]
	weights = (55, 10, 15, 12, 8)
	for _ in range(120):
		reg = f"{rnd.choice(('SGD', 'KHB', 'JNG', 'MBD', 'CHT'))}-{rnd.randint(100, 9999)}"
		if _exists("Sugar Vehicle", reg):
			continue
		driver, _f, _w = _person(rnd)
		owner, _f, _w = _person(rnd)
		_insert({"doctype": "Sugar Vehicle", "registration_no": reg,
			"vehicle_type": rnd.choices(types, weights=weights)[0],
			"contractor": rnd.choice(contractors) if rnd.random() < 0.4 else None,
			"vehicle_owner_name": owner, "driver_name": driver,
			"driver_cnic": f"38403-{rnd.randint(1000000, 9999999)}-{rnd.choice('13579')}",
			"driver_mobile": f"03{rnd.choice('0123456')}{rnd.randint(10_000_000, 99_999_999)}"})


def _staff_password():
	path = os.path.expanduser("~/.sugarcane-site-secrets")
	try:
		with open(path) as fh:
			for line in fh:
				if line.startswith("STAFF_DEMO_PASSWORD="):
					return line.split("=", 1)[1].strip()
	except OSError:
		return None
	return None


def _users():
	password = _staff_password()
	for prefix, (first, last, roles) in ROLE_USERS.items():
		email = f"{prefix}@{EMAIL_DOMAIN}"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc({"doctype": "User", "email": email, "first_name": first, "last_name": last,
				"send_welcome_email": 0, "user_type": "System User", "time_zone": "Asia/Karachi"})
			user.flags.no_welcome_mail = True
			user.insert(ignore_permissions=True)
			if password:
				from frappe.utils.password import update_password

				update_password(email, password)
		user = frappe.get_doc("User", email)
		missing = [r for r in roles if r not in {x.role for x in user.roles}]
		if missing:
			user.add_roles(*missing)
	for prefix, circles in SCOPES.items():
		email = f"{prefix}@{EMAIL_DOMAIN}"
		for circle in circles:
			if not frappe.db.exists("User Permission", {"user": email, "allow": "Cane Circle", "for_value": circle}):
				frappe.get_doc({"doctype": "User Permission", "user": email, "allow": "Cane Circle", "for_value": circle,
					"apply_to_all_doctypes": 1}).insert(ignore_permissions=True)
			frappe.db.set_value("Cane Circle", circle, "circle_officer", email)
