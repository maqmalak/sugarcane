"""Demo CCTV cameras (no snapshot URL → the pictures in /assets/sugarcane/demo_cctv, drawn as a live camera feed).
Added on migrate only to a demo site (one that has demo tokens) that has no cameras yet; real cameras are set up by hand."""

import frappe

PIC = "/assets/sugarcane/demo_cctv/{}_{}.jpg"
GATE = [("ANPR", "CAM 1 ANPR"), ("Cabin", "CAM 2 CABIN"), ("Left", "CAM 3 LEFT"), ("Right", "CAM 4 RIGHT")]
BRIDGE = [("Front", "CAM 1 FRONT"), ("Left", "CAM 2 LEFT"), ("Right", "CAM 3 RIGHT"), ("Rear", "CAM 4 REAR"), ("Top", "CAM 5 TOP")]


def _cam(name, place, view, order, terminal=None):
	if frappe.db.exists("CCTV Camera", name):
		return
	frappe.get_doc({"doctype": "CCTV Camera", "camera_name": name, "place": place, "terminal": terminal, "view": view,
		"sort_order": order, "is_active": 1, "take_snapshots": 1, "auth": "None",
		"demo_loaded": PIC.format(view.lower(), "loaded"), "demo_empty": PIC.format(view.lower(), "empty")}).insert(ignore_permissions=True)


def setup(force=False):
	if not force and (frappe.db.count("CCTV Camera") or not frappe.db.exists("Cane Token", {"is_demo": 1})):
		return
	for i, (view, label) in enumerate(GATE, 1):
		_cam(f"GATE 1 · {label}", "Mill Gate", view, i)
	for t in frappe.get_all("Weighbridge Terminal", filters={"is_active": 1, "depot": ("is", "not set"),
			"allowed_operations": ("!=", "Misc")}, fields=["name", "terminal_name"]):
		if t.name.lower().startswith("test"):
			continue
		tag = (t.terminal_name or t.name).upper()
		for i, (view, label) in enumerate(BRIDGE, 1):
			_cam(f"{tag} · {label}", "Weighbridge", view, i, t.name)
