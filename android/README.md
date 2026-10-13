# MicroMax Sugar — Android field apps

One Gradle project, one module per app plus shared code:

| Module | What |
|---|---|
| `core` | Sign-in session (encrypted), Frappe API client (token + `X-Device-Id`), GPS averaging, geometry (area, point-in-polygon, geofence), photo compression + blur check, PIN hashing |
| `eagleeye` | **EagleEye Survey** — crop surveys with field boundaries, photos, attendance with selfie + geofence, route tracking; offline-first |
| `vehicle-tracking`, `depot-purchase` | Phase 4 |

## Build

Needs JDK 17 and the Android SDK (platform 34, build-tools 34). On the dev machine they live in `~/.local/opt/jdk-17` and `~/Android/Sdk`.

```bash
cd apps/sugarcane/android
export JAVA_HOME=~/.local/opt/jdk-17 ANDROID_HOME=~/Android/Sdk
./gradlew :core:test :eagleeye:assembleDebug          # → eagleeye/build/outputs/apk/debug/eagleeye-debug.apk
./gradlew :eagleeye:assembleRelease -PsugarServer=https://erp.example.com   # release, minified
```

`-PsugarServer` sets the default server shown on the sign-in screen (default `http://sugarcane.local:8006`); users can change it there.
A phone on the same Wi-Fi reaches the dev server at `http://<PC LAN IP>:8006` — plain HTTP is allowed only for `sugarcane.local`,
`localhost`, `10.0.2.2` (emulator) and the dev PC's LAN IP (`res/xml/network_security_config.xml`); production must use HTTPS.

Release builds are signed with the debug key until the mill's keystore exists. To sign properly, create a keystore, add a
`signingConfigs.release` block reading it from `~/.gradle/gradle.properties`, and point `buildTypes.release.signingConfig` at it.
Never commit the keystore.

## How EagleEye works

- **Sign-in**: email + password → `sugarcane.api.v1.survey.login` with the phone's ANDROID_ID. A new phone is registered as a
  *Pending* Survey Device; a Cane Manager approves it on the desk, then sign-in returns an API key/secret (stored encrypted).
  Every later call sends `Authorization: token …` and `X-Device-Id`. Signing in on another phone invalidates the old token.
- **App lock**: a 4–8 digit PIN (PBKDF2 hash only), asked again after 2 minutes in the background; 5 wrong tries sign out.
- **Offline**: masters (circles, villages with boundaries, growers in the user's circles, varieties, diseases, targets) are kept
  in Room and refreshed by delta (`modified` since the last pull). Surveys, photos, attendance and GPS points are written to an
  outbox and sent by WorkManager every 15 minutes when there is a network (or at once from the cloud button). Each record has a
  UUID, so a retried upload never creates duplicates on the server.
- **Field boundary**: walk the corners and press *Add corner from GPS* (6 s averaged fix) or tap them on the satellite map
  (ESRI imagery; tiles seen once are cached for offline use). Area shows in acres/kanal; the server re-measures geodesically,
  checks the village boundary and looks for overlaps with other surveys.
- **Attendance**: check-in = selfie + averaged GPS fix, checked against the surveyor's target circles (+ geofence radius);
  the route is recorded by a foreground service every *tracking interval* seconds until check-out.
- **Photos**: compressed to 1600 px JPEG; a Laplacian-variance sharpness score below 60 asks the user to retake.
