"""ELP demo: LP operators assigned to loading points and a depot, then loads at every stage — on the road (some late),
arrived and waiting for the audit team, accepted (LP verified) and rejected (the gate photos show another vehicle).
Photos are drawn (truck front with its number plate, driver, body, indent slip) and stamped like the phone does."""

import base64
import io
import random

import frappe
from frappe.utils import add_to_date, get_datetime, getdate

SEED = 2028
DOMAIN = "micromaxsugar.example"
ASSIGN = {  # user prefix -> points (type, name)
	"lp.north": (("Loading Point", "LP Bhalwal 1"), ("Loading Point", "LP Bhalwal 2"), ("Cane Depot", "Depot Kot Momin")),
	"lp.south": (("Loading Point", "LP Shorkot 1"), ("Loading Point", "LP Shorkot 2"), ("Loading Point", "LP Sillanwali 1"),
		("Loading Point", "LP Sillanwali 2")),
}
VIEWS = ("Number Plate", "Indent", "Driver", "Body Left")
PLAN = (("Accepted", 14), ("Rejected", 3), ("Arrived", 5), ("In Transit", 6))  # final stage, how many


def _jpeg(rnd: random.Random, vehicle: str, view: str, stamp: str, variant: int = 0) -> bytes:
	from PIL import Image, ImageDraw

	r = random.Random(f"{vehicle}-{view}")  # the same vehicle looks the same at the LP and at the gate
	w, h = 640, 480
	img = Image.new("RGB", (w, h), (196 + variant * 6, 214, 228))
	d = ImageDraw.Draw(img)
	d.rectangle((0, 330, w, h), fill=(150 + variant * 5, 128, 96))
	body = (r.randint(40, 220), r.randint(40, 200), r.randint(40, 220))
	dx = variant * 9
	if view in ("Number Plate", "Body Left", "Front"):
		d.rectangle((90 + dx, 120, 560 + dx, 380), fill=body, outline=(20, 20, 20), width=4)
		for i in range(8):  # painted truck art: bands of colour
			d.rectangle((100 + dx, 135 + i * 16, 550 + dx, 143 + i * 16), fill=(r.randint(0, 255), r.randint(0, 255), r.randint(0, 255)))
		d.ellipse((120 + dx, 340, 200 + dx, 420), fill=(25, 25, 25))
		d.ellipse((450 + dx, 340, 530 + dx, 420), fill=(25, 25, 25))
		d.rectangle((230 + dx, 280, 420 + dx, 330), fill=(250, 250, 250), outline=(0, 0, 0), width=3)
		d.text((248 + dx, 292), vehicle, fill=(0, 0, 0), font_size=26)
	elif view == "Driver":
		d.ellipse((260 + dx, 80, 380 + dx, 200), fill=(198, 150, 110), outline=(60, 40, 20), width=3)
		d.rectangle((230 + dx, 200, 410 + dx, 420), fill=body, outline=(20, 20, 20), width=3)
		d.rectangle((300 + dx, 230, 340 + dx, 300), fill=(240, 240, 240))
	else:  # the paper indent held up to the camera
		d.rectangle((150 + dx, 70, 490 + dx, 410), fill=(252, 252, 246), outline=(30, 30, 30), width=3)
		for i in range(10):
			d.line((175 + dx, 120 + i * 26, 465 + dx, 120 + i * 26), fill=(90, 90, 90), width=2)
		for i in range(30):
			x = 190 + dx + i * 9
			d.rectangle((x, 370, x + (2 if i % 3 else 5), 395), fill=(0, 0, 0))
	d.rectangle((0, h - 40, w, h), fill=(0, 0, 0))
	d.text((10, h - 32), stamp, fill=(255, 255, 0), font_size=16)
	buf = io.BytesIO()
	img.save(buf, "JPEG", quality=88)
	return buf.getvalue()


def users_and_points():
	for prefix, points in ASSIGN.items():
		email = f"{prefix}@{DOMAIN}"
		if not frappe.db.exists("User", email):
			continue
		for dt, name in points:
			if not frappe.db.exists(dt, name):
				continue
			doc = frappe.get_doc(dt, name)
			field = "lp_users" if dt == "Loading Point" else "depot_users"
			if email not in {u.user for u in doc.get(field) or []}:
				doc.append(field, {"user": email, "depot_role": "Operator"})
				doc.save(ignore_permissions=True)


def loads():
	from sugarcane.vehicle_tracking import elp

	if frappe.db.exists("LP Vehicle Registration", {"is_demo": 1}):
		return 0
	rnd = random.Random(SEED)
	s = frappe.get_cached_doc("Sugar Settings")
	mill = (s.mill_latitude, s.mill_longitude)
	vehicles = frappe.get_all("Sugar Vehicle", filters={"is_blacklisted": 0}, fields=["registration_no", "vehicle_type", "driver_name",
		"driver_cnic", "driver_mobile"], order_by="registration_no asc")
	rnd.shuffle(vehicles)
	slots = []
	for prefix, points in ASSIGN.items():
		for dt, name in points:
			if frappe.db.exists(dt, name):
				slots.append((f"{prefix}@{DOMAIN}", elp.point(dt, name)))
	used, made, plan = set(), 0, [stage for stage, n in PLAN for _ in range(n)]
	rnd.shuffle(plan)
	for stage in plan:
		user, p = slots[made % len(slots)]
		f = {"docstatus": 1, "status": ["in", ["Authorized", "Printed"]], "name": ["not in", list(used) or [""]]}
		if p.circle:
			f["circle"] = p.circle
		indent = frappe.get_all("Cane Indent", filters=f, fields=["name", "indent_date", "valid_to"], order_by="indent_date asc", limit=1)
		if not indent or not vehicles:
			made += 1
			continue
		indent = indent[0]
		used.add(indent.name)
		v = vehicles.pop()
		at = add_to_date(get_datetime(f"{indent.indent_date} 06:30:00"), minutes=rnd.randint(0, 600))
		lat, lng = p.latitude + rnd.uniform(-0.0004, 0.0004), p.longitude + rnd.uniform(-0.0004, 0.0004)
		serial = at.strftime("%d%m%Y%H%M%S") + f"{rnd.randint(0, 99):02d}"
		photos = [{"view": view, "latitude": lat, "longitude": lng, "taken_at": str(at),
			"data": base64.b64encode(_jpeg(rnd, v.registration_no, view, f"{p.title} · {at:%d-%m-%Y %H:%M} · {lat:.5f},{lng:.5f}")).decode()}
			for view in VIEWS]
		frappe.set_user(user)
		try:
			name, _st = elp.register({"uuid": frappe.generate_hash(length=20), "point_type": p.type,
				"loading_point": p.name if p.type == "Loading Point" else None, "depot": p.name if p.type == "Cane Depot" else None,
				"indent": indent.name, "vehicle_no": v.registration_no, "vehicle_type": v.vehicle_type, "driver_name": v.driver_name,
				"driver_cnic": v.driver_cnic, "driver_mobile": v.driver_mobile, "latitude": lat, "longitude": lng, "gps_accuracy_m": rnd.randint(4, 15),
				"registered_at": str(at), "serial_no": serial, "cell_id": str(rnd.randint(10000, 65000)), "photos": photos})
		finally:
			frappe.set_user("Administrator")
		frappe.db.set_value("LP Vehicle Registration", name, "is_demo", 1, update_modified=False)
		made += 1
		if stage == "In Transit":
			continue
		journey = (p.journey_min or 90) + rnd.randint(-15, 60 if stage != "Rejected" else 240)
		arrived = add_to_date(at, minutes=journey)
		glat, glng = mill[0] + rnd.uniform(-0.001, 0.001), mill[1] + rnd.uniform(-0.001, 0.001)
		other = vehicles[-1].registration_no if stage == "Rejected" and vehicles else v.registration_no  # rejected: a different vehicle came
		gate = [{"view": view, "latitude": glat, "longitude": glng,
			"data": base64.b64encode(_jpeg(rnd, other, view, f"Mill gate · {arrived:%d-%m-%Y %H:%M} · {glat:.5f},{glng:.5f}", variant=1)).decode()}
			for view in ("Number Plate", "Driver", "Body Left")]
		frappe.set_user(f"token.clerk@{DOMAIN}" if frappe.db.exists("User", f"token.clerk@{DOMAIN}") else "Administrator")
		try:
			elp.arrive(name, gate, glat, glng, str(rnd.randint(10000, 65000)), arrived.strftime("%d%m%Y%H%M%S") + "00", None, str(arrived),
				frappe.generate_hash(length=20))
		finally:
			frappe.set_user("Administrator")
		if stage in ("Accepted", "Rejected"):
			auditor = f"elp.auditor@{DOMAIN}"
			frappe.set_user(auditor if frappe.db.exists("User", auditor) else "Administrator")
			try:
				elp.decide(name, stage == "Accepted", None if stage == "Accepted" else "Gate photos show another vehicle — number plate does not match")
			finally:
				frappe.set_user("Administrator")
	return made


def run():
	frappe.flags.mute_emails = True
	users_and_points()
	n = loads()
	frappe.db.commit()
	return n


def release_indents(names=None):
	"""Indents marked used by registrations that are being removed (or are gone) go back to authorized / printed."""
	f = {"status": "Used", "token": ["like", "ELP-%"]}
	for i in frappe.get_all("Cane Indent", filters=f, fields=["name", "token", "print_count"]):
		if (names and i.token in names) or not frappe.db.exists("LP Vehicle Registration", i.token):
			frappe.db.set_value("Cane Indent", i.name, {"status": "Printed" if i.print_count else "Authorized", "token": None, "used_on": None},
				update_modified=False)


def reset():
	from sugarcane.setup.demo import _purge

	names = frappe.get_all("LP Vehicle Registration", filters={"is_demo": 1}, pluck="name")
	release_indents(names)
	frappe.db.delete("ELP Event Log", {"registration": ["in", names or [""]]})
	_purge("LP Vehicle Registration", names)
	frappe.db.commit()
