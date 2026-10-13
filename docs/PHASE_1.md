# Phase 1 — EagleEye Survey Management (+ Android app)

Built 2026-10-13 on `sugarcane.local`.

## What was built

### Pins and boundaries on the whole hierarchy
Division → District → Zone → Circle → Sector → Village each have **latitude / longitude** (pin), **polygon** (Geolocation
boundary) and **area_acres** (geodesic, read-only). On save (`sugarcane.geo.validate_geo`, hooked on all six DocTypes):
- the polygon is checked (Leaflet circles and self-intersecting shapes are repaired) and measured on the WGS84 ellipsoid (`pyproj`);
- an empty pin is set to a point inside the boundary;
- a pin outside its own boundary, or a boundary less than 90 % inside its parent's, gives an orange warning (never blocks).

Edit on the desk (Geolocation field) or in React → **Area Map** (`/sugar/geo`): a tree of the hierarchy with pin and boundary
flags, plus the real-estate app's `LocationCapture`, ported. It sets a pin on the map, from averaged GPS or from a pasted
Google Maps link, or a boundary by tapping or walking the corners. It shows the parent boundary (dashed yellow) and the
children for orientation.

### DocTypes (module EagleEye Survey)
| DocType | Notes |
|---|---|
| **Cane Survey** (submittable) | grower / CNIC / passbook, circle → village (must match), murabba / killa, total / empty / cane acres, variety, plant / ratoon, condition, disease + %, **field boundary**, measured acres + kanal, declared vs measured %, centroid, inside-village flag, expected production (area × variety yield × (1 − disease %)), photos (child table), device, GPS accuracy, survey UUID (unique). Company or **Competitor** (competitor mill; mapped, never indented). Submit needs a boundary. |
| **Survey Overlap Review** | Opened automatically on submit when two submitted surveys of the season overlap by more than Sugar Settings → overlap tolerance (5 %, of the smaller field). Candidate fields come from an indexed bounding box, then shapely + geodesic areas. Decide: Accept both / Reject one (cancels that survey). Each survey's `overlap_status` is Clear / Under Review / Accepted / Rejected. |
| **Surveyor Attendance** (submittable) | Check-in = submit (time, GPS, selfie); check-out updates the submitted record. Geofence = the surveyor's target circle boundary + the geofence radius. Status Present / Half Day (< 4 h, settable) / Out of Area; hours; km from the GPS track. One per surveyor per day. |
| **Surveyor Location Log** | GPS points from the app (bulk-inserted, UUID-deduplicated, indexed on surveyor + time). |
| **Surveyor Target** | Season, surveyor, circle (also the attendance geofence), target acres / fields, dates. |
| **Survey Device** | ANDROID_ID, assigned user, Pending / Approved / Blocked (Approve / Block buttons). |

Sugar Settings gained: approve new devices automatically (off), max photo size (5 MB), half-day hours (4).

### Sync API (`sugarcane.api.v1.survey`)
- `login(usr, pwd, android_id, …)`: rate-limited (10/min). Uses Frappe's own credential check, so lock-out tracking and the auth log apply, but no web session starts. An unknown phone becomes a *Pending* device bound to that user. A phone registered to someone else is refused. When approved, it returns an API key/secret. A new secret on each sign-in revokes the old phone.
- Every other call needs `Authorization: token …` and an **approved `X-Device-Id` bound to the caller**.
- `masters(since)`: settings, season, circles and villages with boundaries, varieties, diseases, growers (scoped by the user's circle User Permissions), targets, the user's own surveys. Changes since the last pull use `modified`.
- `upload(surveys, attendance, locations)`: per-item results. Re-sending a UUID returns `duplicate` with the existing name. A bad item is rolled back on its own and doesn't stop the batch. Photos come inline as base64 (size-checked, real images only). Attendance is check-in, then check-out on the same UUID.

### React (`/sugar`)
- **Survey Map** (`/survey`): MapLibre on ESRI satellite or OSM streets.
  - Layers: zones, circles, sectors, villages, company fields, competitor fields, attendance check-ins/outs (geofence status) and GPS tracks for a chosen day.
  - Colour fields by variety (the variety's map colour), disease, plant/ratoon, overlap status or company/competitor, with a live legend.
  - Filters: season, circle, village, variety, disease, plant/ratoon, overlap, dates, surveyor.
  - Live totals. Click a field for a drawer with every detail, photos and its overlap reviews. `?focus=<survey>` zooms to a survey; the desk's "Open on Survey Map" button uses it.
- **Survey Dashboard** (`/survey/dashboard`):
  - KPI tiles: area, expected maunds, growers surveyed, ratoon / diseased / competitor area, open overlaps, present today.
  - Charts: area by circle, by variety, fields per day, surveyor target vs done.
- **Area Map** (`/geo`): see above.
- Styling: the real-estate app's `globals.css` and UI kit (Button, Card, Input / Select / Label with `.field`, Badge, Sheet,
  Tabs, Skeleton), Tailwind config and MapLibre theming.

### Desk
- **EagleEye Survey** workspace, with its sidebar and desktop icon.
- 5 number cards: surveyed area, fields, competitor area, open overlaps, surveyors in today.
- 4 charts: area by variety, area by circle, daily surveys, plant vs ratoon.
- Form buttons: survey → open on the map; review → Accept / Reject; device → Approve / Block.

**Reports** (Script Reports):
- Cane Survey Detail
- Circle Wise Survey Summary (with quota)
- Variety Wise Survey Summary
- Grower Wise Survey Summary
- Grower and Circle Wise Survey
- Circle and Village Wise Survey
- Sector Wise Survey Summary
- Survey vs Actual Yield (by variety; actual comes from CPRs, Phase 3)
- Surveyor Attendance Report (with summary)
- Surveyor Performance (target vs done)

The grouped reports have filters for season, dates, zone, circle, village, variety, plant/ratoon and company/competitor, plus
a correct total row (averages are recomputed, not summed).

### Android — EagleEye (`android/`, Kotlin + Compose + Room + WorkManager)
- Gradle project with a shared **`core`** module and the **`eagleeye`** app. `core` holds:
  - encrypted session
  - Frappe client
  - GPS averaging
  - geometry: area, point-in-polygon, geofence distance
  - photo compression + Laplacian blur check
  - PIN hashing
- Screens:
  - Sign-in, including the device approval flow.
  - PIN set-up and lock: re-locks after 2 min in the background; 5 wrong tries sign out.
  - Home: attendance card, season target progress, survey list with sync state, sync button with a pending badge.
  - Survey form: grower search, circle → village, land and crop fields, satellite field map (osmdroid + ESRI). Corners come from averaged GPS or by tapping, are draggable, and the area shows live with an outside-village warning. Photos are blur-checked.
  - Settings.
- Offline-first: masters in Room. An outbox for surveys, photos, attendance and GPS points is uploaded by WorkManager every 15 min on a network, or at once. UUIDs keep retries idempotent. Map tiles are cached for offline use.
- Attendance: selfie + averaged GPS, client-side geofence check against the target circles; a foreground service records the route every *tracking interval* while checked in.
- Builds: `./gradlew :core:testDebugUnitTest :eagleeye:assembleDebug` → `eagleeye-debug.apk`; 7 JVM geometry tests pass.
  See `android/README.md`.

### Demo data (`sc-demo` / `sc-reset-demo`)
- Every hierarchy level has a pin and a boundary. Circles sit near the towns they're named after; zones, districts and divisions get the outline around their children.
- 6 surveyors (`surveyor@`, `surveyor.kot@`, `surveyor.sillanwali@`, `surveyor.jauharabad@`, `surveyor.shorkot@`, `surveyor.athara@micromaxsugar.example`, demo password), each with 2 circles: User Permissions, targets and an approved device.
- 551 submitted surveys:
  - 506 company fields, about 1,545 acres, 401 of the 500 growers
  - 45 competitor fields
  - 6 deliberate overlaps; 17 open overlap reviews in total
- 13 days of attendance (today = checked in, not out) with about 6,600 GPS points.
- The reset deletes in bulk (no per-record background jobs).

### Additions after the EagleEye overview (2026-10-13)
See `docs/EAGLEEYE_OVERVIEW.md` for the feature-by-feature map.
- **Company mill location:** Sugar Settings → Mill Location (pin and premises), also editable on the Area Map. Shown on the Survey Map *Mills* layer.
- **Competitor Mill** master: pin, premises, capacity in TCD, colour. Competitor fields link to it; the map can filter and colour by it. Demo mills are fictional.
- **Non-passbook growers (CNIC-based survey):** *Grower Type* on the survey. The CNIC and name are checked. An existing grower with that CNIC is linked; otherwise a grower is registered without a passbook on submit. The phone has a *No passbook (CNIC)* option.
- **Grower photo** on the survey, with its coordinates and time. The first one becomes the grower's profile photo (`Grower.grower_photo`). It shows in the drawer, the Growers list and on the phone.
- **Field Force** page (`/sugar/field-force`):
  - field users with circles, today's attendance, last GPS point and target progress
  - add a field user, assign circles, enable or disable a login (disabling also blocks their phones)
  - approve or block devices
- **Demo:** about one field in three has geo-stamped photos and a grower photo; every attendance day has selfies; 25 non-passbook surveys; 3 competitor mills.
- **Android database v2** (Room auto-migration, tested on the emulator over v1 data). Two fixes found on the emulator:
  - the CNIC field now uses a display mask; inserting the dashes while typing moved the cursor and scrambled digits
  - camera and GPS callbacks now update the latest form state; an old copy used to wipe the grower photo

## How to test

```bash
bench --site sugarcane.local run-tests --app sugarcane        # 67 tests (27 unit + 40 integration)
bench --site sugarcane.local sc-reset-demo                     # fresh demo, ~20 s
cd apps/sugarcane/android && ./gradlew :core:testDebugUnitTest :eagleeye:assembleDebug
```
The new Phase 1 tests cover:
- geodesic area (1 acre, 100 m square), Feature / FeatureCollection / Leaflet-circle input, repairing a bow-tie polygon
- overlap %, buffered containment, distances
- hierarchy area and pin; the save-geo API
- survey measuring, expected production with disease, the submit-needs-boundary rule, the land-split rule, village-in-circle
- the full overlap review flow (reject cancels a survey, statuses update), small overlaps tolerated, cancel closes reviews
- attendance geofence, hours, half day, one per day
- sync API: upload idempotency with a photo, a bad item not stopping a batch, check-in then check-out, GPS point dedupe, device binding, the login pending → approved flow with a wrong password refused, master deltas

**On an Android 14 emulator** (headless, `eagleeye_test` AVD, server `http://10.0.2.2:8006`), checked end to end on 2026-10-13:
- sign-in from a new phone → "Ask the Cane Manager to approve device DEV-00318" (device registered with model, app and OS version)
- approve → sign in → PIN set-up → home with the season target (Bhalwal) from the masters
- check-in (selfie skipped) with an emulated GPS fix → "inside your area" on the phone; ATT-2026-00319 Present, inside the geofence, on the server; tracking points arriving
- new survey: only the user's circle offered; village list; offline grower search by ID prefix; variety; 4 corners tapped on the ESRI satellite map → 5.88 acres
- submit → synced as SRV-26-01655. The server re-measured it (5.88 acres, inside the village) and found an overlap with a demo field, and "Overlap: Under Review" came back down to the phone

In the browser (cane.manager@ / demo password):
- http://sugarcane.local:5179/sugar/survey: switch colour-by, layers and filters; tick Attendance + GPS tracks; click a field.
- `/sugar/survey/dashboard` and `/sugar/geo`: pick Cane Circle → Bhalwal, drag a corner, Save boundary.
- On the desk: EagleEye Survey workspace → open a Survey Overlap Review → Decide; reports in the workspace.

## Known gaps

1. **Actual yield** in *Survey vs Actual Yield* is empty until CPRs exist (Phase 3). The report reads it automatically when it can.
2. **Delta masters** don't send deletions. A grower that is disabled is removed from the phone, but a record deleted on the
   server stays on the phone until *Download all masters again*.
3. **Selfie camera:** the app asks the camera app for the front lens, but some camera apps ignore the request.
4. **Map tiles:** ESRI imagery is free to view, but large production use needs an ArcGIS account (or switch to another provider in `lib/map.ts` / `FieldMap.kt`).
5. **Release signing:** the release APK is signed with the debug key until the mill's keystore exists (Phase 9 / `android/README.md`).
6. **Map labels:** the web map draws boundaries without text labels (the raster style has no glyph server). Names show on click.
7. **Surveyor list on the map** is every user with the Surveyor role; it isn't scoped to the viewer's circles.
8. A boundary drawn only by tapping the map has no GPS accuracy (stored as 0). Only corners captured from GPS record it.
9. The default Android map pins are large at field scale; smaller corner markers would be clearer.
10. Emulator test records (user `surveyor.emulator@…`, device DEV-00318) are tagged as demo, so `sc-reset-demo` removes them.
