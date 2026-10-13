# EagleEye E-Survey Management System — overview and where each feature lives

EagleEye controls field-force crop surveying. It is a key planning component for sugarcane procurement and competitive
benchmarking. It has two parts:
- a **web portal** for setup, dashboards and reports: the React app at `/sugar` plus the Frappe desk
- an **Android app** for recording field surveys: `android/eagleeye`

## Key features

| Feature | Web portal | Android app |
|---|---|---|
| Users management, dashboards, reporting | **Field Force** (`/sugar/field-force` insights, `/sugar/field-force/users`): add surveyors and circle officers, assign circles, enable or disable logins, approve or block phones. **Survey Insights** (`/sugar/survey`). 10 reports in the React **Report Centre** (`/sugar/reports`, Excel / PDF) and on the desk | — |
| Field force tracking | Survey Map → *Attendance* + *GPS tracks* layers (pick a day); Field Force → today's status, last GPS time | Foreground service records the route every *tracking interval* while checked in |
| Crop surveys and grower data | Survey Map drawer; desk `Cane Survey` | Survey form (grower search, land, crop, boundary, photos) |
| Offline surveys and grower data import on the phone | — | Masters (growers, villages with boundaries, varieties, diseases, competitor mills, targets) are downloaded to the phone; surveys are saved offline and sent when there is internet |
| Competitor information on survey maps | **Competitor Mill** master (pin, premises, capacity, colour); competitor fields linked to a mill; map layers *Mills* + *Competitor fields*, filter and colour by competitor mill | Survey → *Competitor cane* → choose the mill |
| Surveyor targets | `Surveyor Target` (acres / fields per circle); Field Force and Dashboard show target vs done; *Surveyor Performance* report | Home → season target progress |
| Land area from geo-coordinates | Measured on the server (geodesic, WGS84) in acres and kanal; declared vs measured % | Live area while capturing corners (GPS walk or tap on satellite map) |
| Crop types and varieties, crop diseases | `Cane Variety` (map colour, yield), `Crop Disease`; colour the map by variety or disease | Variety, plant/ratoon (+ ratoon no.), condition, disease + % |
| Survey area overlapping controls | `Survey Overlap Review` opened automatically above Sugar Settings → overlap tolerance (default 5 %); *Re-check overlaps* on the lists; Accept both / Reject one | Overlap status shown on each survey after sync |
| Attendance with photos and time in/out coordinates on maps | Survey Map → *Attendance* layer: click a check-in / check-out point for the selfie, time, coordinates and geofence result | Check in / out = selfie + averaged GPS; geofence check against the target circles |
| Role-based access and authentication | 15 roles; circle scoping by User Permission (web and phone); device approval | Email + password sign-in, approved device only, app PIN lock |

## System setup and process flow

1. **Company setup and mill coordinates on the maps.** Sugar Settings → *Mill Location*, or React **Area Map** → *Company mill*.
   Pin and premises are shown on the Survey Map *Mills* layer.
2. **Roles and user access rights.** Desk → Role / User; React **Field Force** for field users and their circles.
3. **Circle setup and geo-tagging.** Desk `Cane Circle`, or React **Area Map** → circle → boundary + pin. Division,
   District, Zone and Sector get pins and boundaries the same way.
4. **Village setup.** `Cane Village` (code, sector, pin, boundary); Area Map.
5. **Grower profile and land.** `Grower` (ID circle-village-serial, CNIC, father, bank, **photo**) + `Grower Passbook` (land holdings); Excel import.
6. **CNIC- and passbook-based grower definition.**
   - Passbook growers come from the registry.
   - Non-passbook growers are surveyed by CNIC (*No passbook (CNIC)* on the phone, *Grower Type* on the desk). On submit the grower is registered without a passbook. If that CNIC is already registered, the existing grower is linked.
7. **Crop varieties.** `Cane Variety`, `Crop Disease`.
8. **Field survey.** Each survey records:
   - grower details
   - circle and village
   - murabba / killa
   - total, empty and cane acres
   - crop type and variety
   - disease and %
   - field boundary
   - **grower photo** (with its coordinates; the first one becomes the grower's profile photo)
   - field photos (each with coordinates and time)
9. **Offline save and sync.** The phone keeps an outbox; WorkManager sends it when online. UUIDs mean nothing is ever duplicated.
10. **Individual survey details.** Click a field on the Survey Map. The drawer shows:
    - the grower photo
    - measured and declared area
    - crop details
    - field centre (opens Google Maps)
    - surveyor and device
    - overlaps
    - photos with GPS and time

    The desk form `Cane Survey` holds the same details.
11. **Survey Map, a bird's-eye view.** `/sugar/survey/map`, with:
    - satellite / streets
    - hierarchy layers
    - company and competitor fields and mills
    - attendance and tracks
    - filters and colour-by
12. **Field-force attendance on the maps.** Check-in/out points with selfies, inside/outside the geofence, hours, km.

## Reports (desk → EagleEye Survey workspace)

| Requested | Report |
|---|---|
| Cane survey detail | Cane Survey Detail |
| Cane Survey (Circle wise) | Circle Wise Survey Summary |
| Cane Survey (Variety wise) | Variety Wise Survey Summary |
| Cane Survey (Grower & Circle wise) | Grower and Circle Wise Survey |
| Cane Survey (Grower wise) | Grower Wise Survey Summary |
| Cane Survey (Circle & Village wise) | Circle and Village Wise Survey |
| Cane surveyors attendance detail | Surveyor Attendance Report |
| (extra) | Sector Wise Survey Summary, Survey vs Actual Yield, Surveyor Performance |

## How a user signs in and sees coordinates and pictures

| Who | Where | Sign in |
|---|---|---|
| Managers, circle officers, MIS | Web portal: `http://sugarcane.local:5179/sugar` (dev) or `http://sugarcane.local:8006/sugar` (built). Desk: `http://sugarcane.local:8006/app/eagleeye-survey` | Email + password |
| Surveyors | EagleEye app (APK `android/eagleeye/build/outputs/apk/debug/eagleeye-debug.apk`) → server URL, email, password → a manager approves the phone in **Field Force** → set a PIN | Email + password + approved phone |

Demo users: `cane.manager@`, `circle.north@`, `circle.south@`, `surveyor@`, `surveyor.kot@`, `surveyor.sillanwali@`,
`surveyor.jauharabad@`, `surveyor.shorkot@`, `surveyor.athara@micromaxsugar.example`. The password is
`STAFF_DEMO_PASSWORD` in `~/.sugarcane-site-secrets`.

To see coordinates and pictures:
- **Field photos and grower photo:** Survey Map → click a field → drawer. Each photo shows its GPS coordinates (click to open Google Maps) and the time taken.
- **Attendance selfies:** Survey Map → tick *Attendance* (and *GPS tracks*), pick the day → click a purple (check-in) or grey (check-out) point.
- **Field boundary coordinates:** the drawer's *Field centre*, or the desk `Cane Survey` → Map tab (the boundary polygon).
- **API for other systems:** `sugarcane.api.v1.survey_map.surveys` (GeoJSON of every field), `…survey_detail?name=`, `…tracks?date=`. They need the same login.
