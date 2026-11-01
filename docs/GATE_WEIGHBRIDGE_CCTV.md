# Gate, gross & tare with CCTV

Operator guide (PDF, with screenshots): `deliverables/MicroMax-Gate-Gross-Tare-CCTV-Guide.pdf` · demo video:
`deliverables/videos/07-Gate-token-gross-tare-with-CCTV.mp4`.

## Flow
| Station | Scan | What happens |
|---|---|---|
| Gate (`/sugar/procurement/gate`) | indent, ELP slip or vehicle no. | Token form fills; vehicle + driver (code, or name + CNIC → new **Cane Driver**); *Issue token & print*. Each gate camera saves a **Vehicle Snapshot** (stage Gate). |
| Gross (`/sugar/procurement/weighbridge`) | indent, token or vehicle no. | Live indicator weight; *Take Gross weight* saves the weighment + one snapshot per bridge camera (stage Gross) and prints the **gross slip** (`WGT-…`, A6, barcode). |
| Tare (same screen) | gross slip, token, indent or vehicle no. | Gross photos beside the live cameras per view; *Same vehicle* tick is required (`Cane Weighment.tare_body_match`) before *Take Tare weight* → CPR + bilty; tare snapshots saved. |

## Setup
- **Sugar Setup → CCTV Cameras**: place (Mill Gate / Weighbridge + terminal / Depot Gate), view (ANPR, Front, Left, Right, Rear, Top, Cabin),
  snapshot URL (HTTP JPEG, e.g. Hikvision `/ISAPI/Streaming/channels/101/picture`, Dahua `/cgi-bin/snapshot.cgi`), Basic/Digest login.
  Give the gross and tare bridges the same views — the tare check pairs photos by view.
- The server fetches frames (`sugarcane.api.v1.cctv.live`, ~1 per 1.5 s per tile) — cameras stay on the LAN.
- No snapshot URL → the camera's demo pictures (`/assets/sugarcane/demo_cctv/<view>_<loaded|empty>.jpg`) drawn as a camera feed
  (name, running clock, grain, drift). `sugarcane.setup.demo_cctv.setup()` adds 4 gate + 5 per-bridge demo cameras on migrate, only on a
  site with demo tokens and no cameras.
- An offline camera never blocks a token or weight: its snapshot row keeps the error. Back-dated/demo tokens and weights (`issued_at` / `at`
  passed) take no snapshots.

## Code
`sugarcane/weighbridge/cctv.py` (frames, snapshots), `sugarcane/api/v1/cctv.py`, `procurement.scan` (scanner → token),
`printing.KINDS["gross"]`, `frontend/src/sc/components/Cctv.tsx` (CameraWall, GrossVsTare, SnapshotStrip). Tests: `sugarcane/tests/test_cctv.py`.
