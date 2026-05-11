# Phase 9 — Builder Output
PHASE_ID: phase-9-android-playstore
BUILDER_DOC_VERSION: 6.2.0
CYCLE: 1
STATUS: COMPLETE

## Pre-Flight Gate
icon.png: 1024×1024 RGB PNG, 1.4 MB — PASS

## Changes Made

### 1. flutter/android/app/build.gradle.kts
- Line 17: `namespace` changed from `"com.example.foundry_app"` → `"com.foundry.app"`
- Line 32: `applicationId` changed from `"com.example.foundry_app"` → `"com.foundry.app"`
- Signing config block: UNTOUCHED (deploy team responsibility)

### 2. flutter/android/app/src/main/AndroidManifest.xml
- Line 9: `android:label` changed from `"foundry_app"` → `"Foundry"`

### 3. flutter/pubspec.yaml
- Added `flutter_launcher_icons: ^0.13.1` under dev_dependencies
- Added `- assets/icon/` to flutter assets list
- Added `flutter_icons:` config block at end of file (android: true, ios: false, image_path: assets/icon/icon.png)

### 4. flutter/assets/icon/icon.png
- Placed by operator: 1024×1024 PNG, 1.4 MB

### 5. Mipmap icons generated
- Command: `dart run flutter_launcher_icons` — exit 0
- Output: "Successfully generated launcher icons"
- Generated at all densities: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi

## Acceptance Criteria Results

| AC | Result | Evidence |
|---|---|---|
| AC-9.1 | PASS | `applicationId = "com.foundry.app"` at line 32 |
| AC-9.2 | PASS | `namespace = "com.foundry.app"` at line 17 |
| AC-9.3 | PASS | `android:label="Foundry"` at line 9 |
| AC-9.4 | PASS | `version: 1.0.0+1` at line 3 |
| AC-9.5 | PASS | 2 matches: line 47 (dev_dependencies) + flutter_icons block |
| AC-9.6 | PASS | 1.4M >= 50K |
| AC-9.7 | PASS | ic_launcher.png present in mipmap-xxxhdpi |

## Confidence

| Deliverable | Confidence | Notes |
|---|---|---|
| build.gradle.kts changes | HIGH | Exact lines confirmed before edit |
| AndroidManifest.xml label | HIGH | Exact attribute confirmed before edit |
| pubspec.yaml version | HIGH | Already 1.0.0+1, untouched |
| flutter_launcher_icons config | HIGH | Spec was exact |
| Mipmap generation | HIGH | dart run flutter_launcher_icons exit 0 |

## Deviations
None. Built exactly to validated.md spec.

## What Deploy Team Receives
- `android/app/build.gradle.kts` — applicationId + namespace = com.foundry.app; signing scaffold intact
- `android/app/src/main/AndroidManifest.xml` — label = "Foundry"
- `pubspec.yaml` — version 1.0.0+1, flutter_launcher_icons configured
- `android/app/src/main/res/mipmap-*/ic_launcher.png` — Foundry icon at all densities
- Deploy team provides: key.properties + foundry-release.jks → runs flutter build appbundle --release
