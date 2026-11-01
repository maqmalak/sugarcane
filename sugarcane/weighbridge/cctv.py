"""CCTV at the mill gate and weighbridges.

- Live tiles: the browser asks the server for the camera's current frame about once a second (`frame`); the server fetches the
  camera's JPEG snapshot URL on the LAN, so cameras never have to be reachable from the internet or the browser.
- Snapshots: when a token is issued (stage Gate) and when gross / tare are taken, every active camera at that place saves a photo
  as a Vehicle Snapshot. A camera that is offline leaves a row with the error instead — it never stops the token or the weight.
- Cameras without a snapshot URL show their demo pictures (loaded / empty vehicle), so the screens work in a demo.
"""

import os
import zlib

import frappe
from frappe import _
from frappe.utils import flt, now_datetime

VIEW_ORDER = ["ANPR", "Front", "Left", "Right", "Rear", "Top", "Cabin"]


def cameras(place: str, terminal: str | None = None, depot: str | None = None) -> list:
	filters = {"is_active": 1, "place": place}
	if place == "Weighbridge":
		filters["terminal"] = terminal or "__none__"
	if place == "Depot Gate":
		filters["depot"] = depot or "__none__"
	rows = frappe.get_all("CCTV Camera", filters=filters, fields=["name", "camera_name", "view", "sort_order", "take_snapshots",
		"snapshot_url", "demo_loaded", "demo_empty"])
	rows.sort(key=lambda r: (r.sort_order or 99, VIEW_ORDER.index(r.view) if r.view in VIEW_ORDER else 99, r.name))
	for r in rows:
		r.demo = not r.snapshot_url
		for k in ("snapshot_url", "demo_loaded", "demo_empty"):
			r.pop(k, None)
	return rows


def _read_local(url: str) -> bytes:
	"""Bytes of a file URL on this server: /assets/<app>/… or /files/… / /private/files/…"""
	if url.startswith("/assets/"):
		app, rest = url[len("/assets/"):].split("/", 1)
		path = frappe.get_app_path(app, "public", *rest.split("/"))
	elif url.startswith("/files/"):
		path = frappe.get_site_path("public", "files", os.path.basename(url))
	elif url.startswith("/private/files/"):
		path = frappe.get_site_path("private", "files", os.path.basename(url))
	else:
		raise ValueError(f"not a local file: {url}")
	with open(path, "rb") as f:
		return f.read()


def frame(camera: str, state: str = "loaded") -> bytes:
	"""Current JPEG from the camera (or its demo picture). Raises on failure."""
	cam = frappe.get_cached_doc("CCTV Camera", camera)
	if cam.snapshot_url:
		import requests
		from requests.auth import HTTPBasicAuth, HTTPDigestAuth

		auth = None
		if cam.auth in ("Basic", "Digest") and cam.username:
			pwd = cam.get_password("password", raise_exception=False) or ""
			auth = (HTTPDigestAuth if cam.auth == "Digest" else HTTPBasicAuth)(cam.username, pwd)
		r = requests.get(cam.snapshot_url, auth=auth, timeout=flt(cam.timeout_s) or 3)
		r.raise_for_status()
		if not r.content or not r.headers.get("content-type", "image/jpeg").startswith("image/"):
			raise ValueError(_("Camera did not return a picture"))
		return r.content
	pic = (cam.demo_empty if state == "empty" else cam.demo_loaded) or cam.demo_loaded or cam.demo_empty
	if not pic:
		raise ValueError(_("Camera {0} has no snapshot URL and no demo picture").format(camera))
	return demo_look(_read_local(pic), cam.camera_name)


# ---------------------------------------------------------------- demo pictures that look like a real camera feed
_FONTS = ("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf", "/usr/share/fonts/truetype/liberation2/LiberationMono-Bold.ttf",
	"/usr/share/fonts/truetype/ubuntu/UbuntuMono-B.ttf")


def _font(size):
	from PIL import ImageFont

	for f in _FONTS:
		if os.path.exists(f):
			return ImageFont.truetype(f, size)
	return ImageFont.load_default(size)


def demo_look(content: bytes, label: str, at=None) -> bytes:
	"""1280x720 CCTV frame from a still: slow drift and breathing zoom (so the live tile moves), a little sensor grain,
	slightly flat colour, and the camera's on-screen text — name top left, date and running clock top right."""
	import io
	import math

	from PIL import Image, ImageDraw, ImageEnhance, ImageOps

	at = at or now_datetime()
	t = at.timestamp()
	W, H = 1280, 720
	im = ImageOps.fit(Image.open(io.BytesIO(content)).convert("RGB"), (int(W * 1.08), int(H * 1.08)), Image.BILINEAR)
	dx = int((math.sin(t / 7.0) + 1) / 2 * (im.width - W))
	dy = int((math.cos(t / 11.0) + 1) / 2 * (im.height - H))
	im = im.crop((dx, dy, dx + W, dy + H))
	im = ImageEnhance.Color(im).enhance(0.82)
	im = ImageEnhance.Contrast(im).enhance(0.93)
	grain = Image.effect_noise((W, H), 22).convert("RGB")
	im = Image.blend(im, grain, 0.06)
	d = ImageDraw.Draw(im)
	f = _font(40)
	def text(xy, s, anchor):
		d.text(xy, s, font=f, fill=(255, 255, 255), anchor=anchor, stroke_width=3, stroke_fill=(0, 0, 0))
	text((26, 20), (label or "CAM").upper(), "la")
	text((W - 26, 20), at.strftime("%d-%m-%Y %a %H:%M:%S").upper(), "ra")
	text((26, H - 20), f"CH{zlib.crc32((label or '').encode()) % 16 + 1:02d}  1280x720  25FPS", "ld")
	out = io.BytesIO()
	im.save(out, "JPEG", quality=72)
	return out.getvalue()


def snap(stage: str, token: str, vehicle_no: str | None, place: str, terminal=None, depot=None, weighment=None, is_demo=0) -> list:
	"""Save one photo per active camera at the place. Never raises: a camera error is stored on its row."""
	from frappe.utils.file_manager import save_file

	state = "empty" if stage == "Tare" else "loaded"
	out = []
	for cam in cameras(place, terminal, depot):
		if not cam.take_snapshots:
			continue
		row = frappe.get_doc({"doctype": "Vehicle Snapshot", "token": token, "weighment": weighment, "stage": stage, "view": cam.view,
			"camera": cam.name, "vehicle_no": vehicle_no, "taken_at": now_datetime(), "is_demo": is_demo})
		try:
			content = frame(cam.name, state)
		except Exception as e:  # camera offline / timeout: keep going, record why
			row.error = str(e)[:500]
			content = None
		row.insert(ignore_permissions=True)
		if content:
			f = save_file(f"{token}-{stage}-{cam.view}.jpg".replace(" ", "_"), content, "Vehicle Snapshot", row.name, is_private=1)
			row.db_set("photo", f.file_url, update_modified=False)
		out.append(row.name)
	return out


def safe_snap(*args, **kwargs) -> list:
	"""snap() inside a savepoint: a bug here must never undo the token or the weight it belongs to."""
	frappe.db.savepoint("cctv_snap")
	try:
		return snap(*args, **kwargs)
	except Exception:
		frappe.db.rollback(save_point="cctv_snap")
		frappe.log_error(title="CCTV snapshot failed")
		return []


def snapshots(token: str) -> dict:
	"""{stage: {view: {photo, taken_at, camera, error}}} for a token."""
	rows = frappe.get_all("Vehicle Snapshot", filters={"token": token}, fields=["name", "stage", "view", "photo", "taken_at", "camera",
		"error"], order_by="taken_at asc")
	out: dict = {}
	for r in rows:
		out.setdefault(r.stage, {})[r.view] = r
	return out
