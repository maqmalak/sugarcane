"""Standard laboratory sample types (with normal ranges) and plant points, created once when none exist. They are masters the
mill edits, not demo data."""

import frappe

SAMPLE_TYPES = [  # name, code, stage, every hours, {parameter: (min, max, target)}
	("Primary Juice", "PJ", "Juice", 2, {"brix": (16, 23, 20), "pol": (13, 20, 17.5), "purity": (80, 92, 87)}),
	("Mixed Juice", "MJ", "Juice", 1, {"brix": (12, 18, 15), "pol": (9.5, 15.5, 13), "purity": (78, 90, 85), "ph": (5.0, 5.8, 5.4)}),
	("Clear Juice", "CJ", "Juice", 2, {"brix": (12, 18, 15), "pol": (10, 16, 13.2), "purity": (80, 91, 86), "ph": (6.8, 7.2, 7.0)}),
	("Syrup", "SY", "Syrup", 2, {"brix": (55, 68, 62), "pol": (45, 58, 53), "purity": (80, 91, 86)}),
	("A Massecuite", "AM", "Massecuite", 4, {"brix": (90, 95, 93), "purity": (82, 88, 85)}),
	("C Massecuite", "CM", "Massecuite", 4, {"brix": (96, 100, 98), "purity": (55, 62, 58)}),
	("Final Molasses", "FM", "Molasses", 4, {"brix": (85, 92, 88), "pol": (28, 36, 31), "purity": (30, 40, 35)}),
	("Bagasse", "BG", "Bagasse", 2, {"pol": (1.2, 2.6, 1.8), "moisture_pct": (46, 52, 49)}),
	("Press Mud", "PM", "Press Mud", 4, {"pol": (0.8, 2.5, 1.5), "moisture_pct": (65, 78, 72)}),
	("Sugar", "SG", "Sugar", 4, {"pol": (99.5, 99.95, 99.8), "moisture_pct": (0, 0.06, 0.04), "colour_icumsa": (0, 150, 90)}),
]
PLANT_POINTS = [  # name, section, unit, min, max, capacity
	("Cane Crush Rate", "Mill", "t/h", 380, 560, 600),
	("Imbibition Water", "Mill", "% fibre", 180, 260, 300),
	("Mixed Juice Tank", "Juice", "%", 20, 85, 100),
	("Clear Juice Tank", "Juice", "%", 20, 85, 100),
	("Syrup Tank", "Evaporation", "%", 15, 85, 100),
	("Final Molasses Tank", "Molasses", "%", 0, 90, 100),
	("Boiler Steam Pressure", "Boiler", "kg/cm²", 38, 46, 50),
	("Exhaust Steam Pressure", "Power House", "kg/cm²", 1.2, 1.8, 2.5),
	("Power Generation", "Power House", "MW", 9, 16, 18),
	("Bagasse Stock", "Boiler", "t", 200, 4000, 6000),
]


def ensure():
	if not frappe.db.count("Lab Sample Type"):
		for i, (name, code, stage, every, limits) in enumerate(SAMPLE_TYPES, 1):
			frappe.get_doc({"doctype": "Lab Sample Type", "sample_type_name": name, "code": code, "stage": stage, "every_hours": every,
				"sequence": i, "is_active": 1, "limits": [{"parameter": p, "min_value": a, "max_value": b, "target": t}
					for p, (a, b, t) in limits.items()]}).insert(ignore_permissions=True)
	if not frappe.db.count("Plant Point"):
		for i, (name, section, unit, lo, hi, cap) in enumerate(PLANT_POINTS, 1):
			frappe.get_doc({"doctype": "Plant Point", "point_name": name, "section": section, "unit": unit, "min_value": lo, "max_value": hi,
				"capacity": cap, "sequence": i, "is_active": 1}).insert(ignore_permissions=True)
