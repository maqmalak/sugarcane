# ELP — Electronic Loading Point

## Why

Growers and transporters claim TPT and subsidy for a longer distance than the cane really travelled. They do this by:
- getting one truck's documents stamped at a loading point (LP) or sector office of another mill, then claiming for several trucks
- using fake rubber stamps

ELP proves that a load really left a given loading point or depot. It photographs the load there with GPS, photographs it again at the mill gate, and an independent audit team compares the two sets. TPT (Phase 3) will be paid only on loads whose LP is verified.

## The flow

| Step | Where | What happens |
|---|---|---|
| 1. Register | **ELP phone app** at the loading point or depot, signed in as an **LP Operator** assigned to that point | GPS must be inside the point's geofence (its boundary, or its radius around the pin, plus a buffer). The operator picks the grower's indent (valid today, for the point's circle, not already on another load) and enters the vehicle and driver. Then they take the required photos (Number Plate, Indent, Driver, Body Left by default; optional: Body Right, Front, Back, Chassis No., LP Board, Load). Every photo is checked at once, and a **blurred, dark or faded photo is cancelled automatically** and has to be retaken. Each photo is stamped with the point, date-time, GPS and vehicle. Registrations are saved offline and sent when there is internet. |
| 2. On the way | Server | *Expected at mill* = registration time + the point's standard journey time. A load still on the road after that plus the grace time is **overdue**. A load still on the road after 48 h is listed in *Vehicles Not Arrived*. |
| 3. Arrival | **ELP app in gate mode** (Token Clerk or Yard Supervisor; GPS must be at the mill), or the **React gate page** (camera or file) | The gate finds the vehicle by number, indent or registration and takes arrival photos. Journey time is compared with the point's standard time and with its own average. Status becomes **Arrived (pending verification)**. |
| 4. Verify | **React → ELP → Gate & verification** (ELP Auditor or Cane Manager) | The loading-point and gate photos are shown side by side, with the details as on the report and a map of the start point. The auditor chooses **Accept** (LP verified, indent marked used) or **Reject** (a reason is required). Gate staff cannot decide. |
| 5. Report | Same page, or the desk | The **verification report** PDF shows registration and arrival photos and details, and the verdict. The layout follows the sample you sent. |

**Security:**
- an approved phone only, with a PIN lock
- the user must be assigned to the point
- server-side re-checks of the geofence, photo quality, indent, blacklisted vehicles and duplicates (one open load per indent and per vehicle; vehicle numbers are compared ignoring spaces and hyphens)
- every step and every refusal goes into the insert-only **ELP Event Log**

## Where things are

| Area | Items |
|---|---|
| DocTypes (Vehicle Tracking) | LP Vehicle Registration (+ LP Vehicle Photo) · ELP Event Log · Loading Point → **Users** |
| Settings | Sugar Settings → *ELP*: photo thresholds (sharpness 60, brightness 40–225, contrast 20), required views, geofence buffer (30 m), gate distance from the mill (500 m), indent required, overdue grace (60 min), not-arrived alert (48 h) |
| Roles | **LP Operator** (registers), Token Clerk / Yard Supervisor (gate arrival), **ELP Auditor** (accept / reject), MIS Viewer (read) |
| Phone API | `sugarcane.api.v1.elp.masters / upload (registrations + arrivals) / mine / cancel`. Sign-in is shared with EagleEye (`survey.login`, app *Vehicle Tracking*). |
| React (`/sugar/elp`) | Dashboard (on the way, pending registration / verification, overdue, map of points and vehicles, per point), Loads board, Gate & verification |
| MIS reports | Pending Registrations · Pending Arrival · Pending Verification · Uncleared Registrations · LP Wise Summary · Reconciliation · Total Loads · Registration Audit · Arrival Audit · Vehicles Not Arrived · Journey Time (Report Centre → *ELP*, and the desk *ELP* workspace) |
| Android | Module `android/elp` (reuses `core`: sign-in, PIN, GPS, geofence; new: photo quality + stamp, cell tower id). The APK is at `/assets/sugarcane/downloads/elp.apk`. |
| Desktop / inbox | "Loads waiting for the audit team" and "Vehicles overdue" alerts · the inbox tab *Loads to verify* · the ELP tile shows vehicles on the way |

## Demo

`sc-demo` creates:
- LP operators `lp.north@` (LP Bhalwal 1 and 2, Depot Kot Momin) and `lp.south@` (Shorkot and Sillanwali LPs)
- auditor `elp.auditor@`
- 28 loads: 14 accepted, 3 rejected (the gate photos show another vehicle), 5 pending verification and 6 on the road

The passwords are in `~/.sugarcane-site-secrets`.

## Tested

- **Server:** 6 integration tests (photo quality, registration rules, blacklist, arrive / verify / report / log, roles, board).
- **Phone API over HTTP:**
  - registration at LP Bhalwal 1 accepted
  - a load 5.6 km away refused and logged
  - a resend recognised as a duplicate
  - gate arrival at the mill
- **Emulator, in the app:** sign-in, PIN, home, register screen (GPS detected *At LP Bhalwal 1*), 4 camera photos passing the quality check, Save & send. The load arrived on the server inside the geofence, with photos, serial number, tower id and device.

## Open points

- **Indents and dates:** the demo indents are dated for November, so a phone registering *today* finds no valid indent. Live use starts with the season.
- **Gate entry and TPT:** built in Phase 3 — an accepted load gets an ELP-verified token with its loading point's TPT; see `PHASE_3.md`.
- **Real hardware:** photo thresholds may need tuning on real phones (Sugar Settings → ELP).
