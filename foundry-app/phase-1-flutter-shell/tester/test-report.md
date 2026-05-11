# Test Report — Phase 1

PHASE_ID: phase-1-flutter-shell
CYCLE: 1
OVERALL_STATUS: PASS
FAILURE_TYPE: none
TESTED_AT: 2026-04-02T00:00:00Z
DEVICE: 2201116PI — Android 12 (API 31) — arm64

---

## HOW_TO_RUN

```bash
cd foundry-app/flutter
flutter run -d e9c95df08d7b --debug
# App launches → React quality-inspector module loads
# Tap "Capture Photo" → bridge response appears in UI
# Tap "Ping Bridge" → { pong: true } appears in UI
```

---

## TEST RESULTS

| # | AC | Result | Method |
|---|----|----|--------|
| AC-1 | Flutter app builds and runs on device | ✅ PASS | flutter run — app launched on Android 12 |
| AC-2 | Local HTTP server starts on port 8080 | ✅ PASS | React module loaded from localhost (cleartext fix applied) |
| AC-3 | WebView loads React module from localhost | ✅ PASS | Quality-inspector UI visible on device |
| AC-4 | Bridge receives capturePhoto call | ✅ PASS | User tapped button — bridge response confirmed received |
| AC-5 | Bridge returns response to JS UI | ✅ PASS | UI displayed bridge response — confirmed by user |
| AC-6 | webpack build produces dist/bundle.js + index.html | ✅ PASS | Automated — webpack exit 0, 139 KiB bundle |
| AC-7 | bridge_helper.js is valid JavaScript | ✅ PASS | Automated — node --input-type=module exit 0 |

Passed: 7 / 7
Failed: 0 / 7

---

## ISSUES FOUND AND FIXED DURING TEST

### ISSUE-1: sentry_flutter Kotlin version incompatibility
- Symptom: `Gradle build failed — Language version 1.6 is no longer supported`
- Fix: Removed sentry_flutter from Phase 1 pubspec (add back in Phase 5)
- Classification: DETERMINISTIC — fixed inline

### ISSUE-2: Android cleartext HTTP blocked
- Symptom: `net::ERR_CLEARTEXT_NOT_PERMITTED` — WebView refused http://localhost:8080
- Fix: Added `android/app/src/main/res/xml/network_security_config.xml` allowing cleartext to localhost/127.0.0.1
- Referenced in AndroidManifest.xml via `android:networkSecurityConfig`
- Classification: DETERMINISTIC — fixed inline

### OBSERVATION: Camera did not open on capturePhoto
- This is CORRECT Phase 1 behavior — stub returns `{ success: true, path: 'test.jpg' }`
- Real camera implemented in Phase 4
- Not a failure

---

## MILESTONE A STATUS

```
✅ Flutter app runs on real Android device
✅ WebView loads React quality-inspector module from localhost HTTP server
✅ FoundryBridge (shellBridge channel) receives JS calls
✅ Bridge returns stub response — displayed correctly in React UI
✅ No JS errors blocking functionality
✅ No Flutter crashes
```

**MILESTONE A: PASSED**
