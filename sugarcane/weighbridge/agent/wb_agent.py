#!/usr/bin/env python3
"""Weighbridge indicator agent — runs on the weighbridge PC, next to the indicator.

Reads the indicator's continuous output (serial ASCII, e.g. "ST,GS,+0018450kg" or "US,GS,+0018390kg") and sends each
change (and a heartbeat every second) to the ERP:

    POST /api/method/sugarcane.api.v1.procurement.reading  {weight_kg, stable, raw, platform_ok}

The ERP accepts it only from the IP registered on a Weighbridge Terminal (Sugar Settings → weighbridge_ip_check) and, if the
terminal names an API user, only from that user. The weighbridge screen then takes the latest *stable* reading — the weight
is never typed in.

    pip install pyserial requests
    python wb_agent.py --url http://erp:8006 --key API_KEY --secret API_SECRET --port /dev/ttyUSB0 --baud 9600
    python wb_agent.py --url http://erp:8006 --key ... --secret ... --simulate          # no indicator: random loads

Frame format differs by indicator make; adjust FRAME below (status token, then a signed weight with unit).

Fraud prevention — platform position sensors (the cat-eye beams across both ends of the deck, and the 5 ft pole beams), through a
GPIO or I/O module: one --sensor NAME=SOURCE per beam. SOURCE is a file that reads 1 when the beam is clear (e.g.
/sys/class/gpio/gpio17/value) or cmd:<command> printing 1/0. platform_ok = 1 only when every beam is clear; --sensor-invert if
your inputs read 0 when clear. Each beam's state goes to the ERP (the screen shows which one is cut), and the red warning light
(--beacon FILE or --beacon-on/--beacon-off commands) is switched on while there is weight on the deck but a beam is cut.
The ERP refuses a weight while platform_ok is 0 (Weighbridge Terminal → Platform position sensors fitted).

    python wb_agent.py ... --sensor Entry-1=/sys/class/gpio/gpio17/value --sensor Entry-2=/sys/class/gpio/gpio18/value \
        --sensor Entry-3=/sys/class/gpio/gpio22/value --sensor Exit-1=/sys/class/gpio/gpio23/value \
        --sensor Exit-2=/sys/class/gpio/gpio24/value --sensor Exit-3=/sys/class/gpio/gpio25/value \
        --sensor Pole-L=/sys/class/gpio/gpio5/value --sensor Pole-R=/sys/class/gpio/gpio6/value \
        --beacon /sys/class/gpio/gpio26/value
"""

import argparse
import json
import random
import re
import subprocess
import sys
import time

import requests

FRAME = re.compile(r"(?P<st>ST|US|OL)?\W*(?:GS|NT)?\W*(?P<w>[+-]?\s*\d+(?:\.\d+)?)\s*(?P<u>kg|t)?", re.I)


def parse(line: str):
	m = FRAME.search(line or "")
	if not m:
		return None
	w = float(m.group("w").replace(" ", ""))
	if (m.group("u") or "kg").lower() == "t":
		w *= 1000
	return int(round(w)), (m.group("st") or "ST").upper() == "ST"


def read_sensors(sensors, invert=False):
	"""({name: 1 clear / 0 cut}, platform_ok) — platform_ok None without sensors."""
	if not sensors:
		return {}, None
	states = {}
	for k, spec in enumerate(sensors, 1):
		name, _, src = spec.partition("=") if "=" in spec else (f"S{k}", "", spec)
		try:
			if src.startswith("cmd:"):
				val = subprocess.run(src[4:], shell=True, capture_output=True, text=True, timeout=1).stdout.strip()
			else:
				with open(src) as f:
					val = f.read().strip()
			clear = (val[:1] == "1") != invert
		except Exception as e:  # unreadable sensor = cut (fail safe)
			print("sensor", name, e, file=sys.stderr)
			clear = False
		states[name] = int(clear)
	return states, int(all(states.values()))


def beacon(a, on: bool, _last=[None]):
	"""Red warning light: on while there is a vehicle on the deck that is not fully inside the platform."""
	if on == _last[0] or not (a.beacon or a.beacon_on):
		return
	_last[0] = on
	try:
		if a.beacon:
			with open(a.beacon, "w") as f:
				f.write("1" if on else "0")
		else:
			cmd = a.beacon_on if on else a.beacon_off
			if cmd:
				subprocess.run(cmd, shell=True, timeout=2)
	except Exception as e:
		print("beacon", e, file=sys.stderr)


def frames_serial(port, baud):
	import serial  # pyserial

	with serial.Serial(port, baud, timeout=1) as s:
		while True:
			line = s.readline().decode("ascii", "ignore").strip()
			if line:
				yield line


def frames_simulated():
	"""An empty bridge, then a vehicle drives on, settles, unloads elsewhere and comes back empty — forever."""
	while True:
		for target in (0, random.randint(9000, 26000), 0, random.randint(3000, 9000), 0):
			w = 0
			for _ in range(random.randint(8, 14)):  # moving
				w += (target - w) * 0.5 + random.randint(-80, 80)
				yield f"US,GS,{int(w):+08d}kg"
				time.sleep(0.25)
			for _ in range(random.randint(20, 40)):  # stable
				yield f"ST,GS,{target:+08d}kg"
				time.sleep(0.25)


def main():
	ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	ap.add_argument("--url", required=True)
	ap.add_argument("--key", required=True)
	ap.add_argument("--secret", required=True)
	ap.add_argument("--port", default="/dev/ttyUSB0")
	ap.add_argument("--baud", type=int, default=9600)
	ap.add_argument("--simulate", action="store_true")
	ap.add_argument("--sensor", action="append", default=[], help="NAME=SOURCE: a file reading 1 when the beam is clear, or cmd:<command>")
	ap.add_argument("--sensor-invert", action="store_true", help="sensors read 0 when clear")
	ap.add_argument("--beacon", help="file to write 1/0 to switch the red warning light (e.g. a GPIO value)")
	ap.add_argument("--beacon-on", help="command that switches the red light on")
	ap.add_argument("--beacon-off", help="command that switches the red light off")
	ap.add_argument("--min-kg", type=int, default=200, help="weight above which a vehicle is on the deck (for the light)")
	a = ap.parse_args()
	http = requests.Session()
	http.headers["Authorization"] = f"token {a.key}:{a.secret}"
	endpoint = a.url.rstrip("/") + "/api/method/sugarcane.api.v1.procurement.reading"
	last, last_sent = None, 0.0
	for raw in frames_simulated() if a.simulate else frames_serial(a.port, a.baud):
		got = parse(raw)
		if not got:
			continue
		if a.simulate:  # a simulated vehicle is "fully on" once it has settled
			plat = int(got[1] and got[0] > 0)
			states = {}
		else:
			states, plat = read_sensors(a.sensor, a.sensor_invert)
		beacon(a, plat == 0 and got[0] >= a.min_kg)
		got = (*got, plat, json.dumps(states, sort_keys=True) if states else None)
		now = time.time()
		if got == last and now - last_sent < 1.0:
			continue  # unchanged: a heartbeat each second is enough
		try:
			data = {"weight_kg": got[0], "stable": int(got[1]), "raw": raw[:140]}
			if got[2] is not None:
				data["platform_ok"] = got[2]
			if got[3]:
				data["sensors"] = got[3]
			r = http.post(endpoint, data=data, timeout=3)
			if r.status_code != 200:
				print("ERP refused:", r.status_code, r.text[:200], file=sys.stderr)
				time.sleep(2)
			last, last_sent = got, now
		except requests.RequestException as e:
			print("ERP not reachable:", e, file=sys.stderr)
			time.sleep(2)


if __name__ == "__main__":
	main()
