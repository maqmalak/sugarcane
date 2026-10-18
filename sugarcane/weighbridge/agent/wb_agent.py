#!/usr/bin/env python3
"""Weighbridge indicator agent — runs on the weighbridge PC, next to the indicator.

Reads the indicator's continuous output (serial ASCII, e.g. "ST,GS,+0018450kg" or "US,GS,+0018390kg") and sends each
change (and a heartbeat every second) to the ERP:

    POST /api/method/sugarcane.api.v1.procurement.reading  {weight_kg, stable, raw}

The ERP accepts it only from the IP registered on a Weighbridge Terminal (Sugar Settings → weighbridge_ip_check) and, if the
terminal names an API user, only from that user. The weighbridge screen then takes the latest *stable* reading — the weight
is never typed in.

    pip install pyserial requests
    python wb_agent.py --url http://erp:8006 --key API_KEY --secret API_SECRET --port /dev/ttyUSB0 --baud 9600
    python wb_agent.py --url http://erp:8006 --key ... --secret ... --simulate          # no indicator: random loads

Frame format differs by indicator make; adjust FRAME below (status token, then a signed weight with unit).
"""

import argparse
import random
import re
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
	a = ap.parse_args()
	http = requests.Session()
	http.headers["Authorization"] = f"token {a.key}:{a.secret}"
	endpoint = a.url.rstrip("/") + "/api/method/sugarcane.api.v1.procurement.reading"
	last, last_sent = None, 0.0
	for raw in frames_simulated() if a.simulate else frames_serial(a.port, a.baud):
		got = parse(raw)
		if not got:
			continue
		now = time.time()
		if got == last and now - last_sent < 1.0:
			continue  # unchanged: a heartbeat each second is enough
		try:
			r = http.post(endpoint, data={"weight_kg": got[0], "stable": int(got[1]), "raw": raw[:140]}, timeout=3)
			if r.status_code != 200:
				print("ERP refused:", r.status_code, r.text[:200], file=sys.stderr)
				time.sleep(2)
			last, last_sent = got, now
		except requests.RequestException as e:
			print("ERP not reachable:", e, file=sys.stderr)
			time.sleep(2)


if __name__ == "__main__":
	main()
