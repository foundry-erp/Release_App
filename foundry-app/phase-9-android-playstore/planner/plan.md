# Phase 9 — Android Release Build (App Developer Scope)
PHASE_ID: phase-9-android-playstore
PLANNER_DOC_VERSION: 6.2.0
DEPENDS_ON: [phase-8-5-ref-data-products]
PROVIDES_TO: [final]

## Scope Clarification

**App developer's job:** Make the 6 code changes below and push to GitHub.
**Deploy team's job:** Signing keystore, key.properties, `flutter build appbundle --release`, Play Console upload.

Signing (REQ-9.4, REQ-9.5), AAB build (REQ-9.7), and Play Console steps are fully out of scope for the app developer.

## What This Phase Builds

Prepares the Flutter source code for handoff to the deploy team. Covers: updating the application ID to `com.foundry.app`, setting the app label to `"Foundry"`, confirming the version string, adding `flutter_launcher_icons` to pubspec.yaml, and generating Android mipmap icon assets from a 1024×1024 PNG source. All changes are committed to GitHub — the deploy team takes it from there.

## Requirements Covered

- REQ-9.1: Application ID set to `com.foundry.app` in `android/app/build.gradle.kts`
- REQ-9.2: App label set to `"Foundry"` in `android/app/src/main/AndroidManifest.xml`
- REQ-9.3: Version confirmed as `1.0.0+1` in `pubspec.yaml`
- REQ-9.4: `flutter_launcher_icons` added to pubspec.yaml dev_dependencies + config block
- REQ-9.5: App icon generated at all required Android mipmap densities from 1024×1024 PNG source using `flutter_launcher_icons`; generated files committed to GitHub

## Deliverables

- [ ] `android/app/build.gradle.kts`: `applicationId` and `namespace` updated to `com.foundry.app`
- [ ] `android/app/src/main/AndroidManifest.xml`: `android:label` set to `"Foundry"`
- [ ] `pubspec.yaml`: `version: 1.0.0+1` verified (already set — confirm unchanged)
- [ ] `pubspec.yaml`: `flutter_launcher_icons` added to `dev_dependencies` + top-level `flutter_icons:` config block
- [ ] `assets/icon/icon.png`: 1024×1024 PNG — must be confirmed present by operator before Builder runs; Builder must stop and report if missing
- [ ] `android/app/src/main/res/mipmap-*/ic_launcher.png`: Generated mipmap icons at all densities, committed to GitHub

## Inputs From Previous Phase

- `flutter_app_functional_on_android`: Flutter app fully functional on Android device (quality-inspector v1.2.1, inventory-checker v1.1.2, all Milestone D scenarios passing) — functional prerequisite only, no typed code interface

## Outputs To Next Phase

none (final app-developer phase — deploy team takes GitHub repo, handles signing + AAB build + Play Console)

## Acceptance Criteria

- [ ] AC-9.1
      criterion: applicationId in build.gradle.kts is exactly `com.foundry.app`
      test_command: grep -n "applicationId" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/android/app/build.gradle.kts"
      pass_condition: Output contains `applicationId = "com.foundry.app"`
      blocking: true

- [ ] AC-9.2
      criterion: namespace in build.gradle.kts is exactly `com.foundry.app`
      test_command: grep -n "namespace" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/android/app/build.gradle.kts"
      pass_condition: Output contains `namespace = "com.foundry.app"`
      blocking: true

- [ ] AC-9.3
      criterion: AndroidManifest.xml app label is "Foundry"
      test_command: grep -n 'android:label' "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/android/app/src/main/AndroidManifest.xml"
      pass_condition: Output contains `android:label="Foundry"`
      blocking: true

- [ ] AC-9.4
      criterion: pubspec.yaml version is 1.0.0+1
      test_command: grep -n "^version:" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/pubspec.yaml"
      pass_condition: Output contains `version: 1.0.0+1`
      blocking: true

- [ ] AC-9.5
      criterion: flutter_launcher_icons dev dependency present in pubspec.yaml
      test_command: grep -n "flutter_launcher_icons" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/pubspec.yaml"
      pass_condition: At least two matches — one under dev_dependencies, one in flutter_icons config block
      blocking: true

- [ ] AC-9.6
      criterion: Source icon PNG exists at assets/icon/icon.png and is >= 50 KB
      test_command: ls -lh "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/assets/icon/icon.png"
      pass_condition: File listed; size >= 50K
      blocking: true

- [ ] AC-9.7
      criterion: Android mipmap-xxxhdpi directory contains generated launcher icons
      test_command: ls "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/android/app/src/main/res/mipmap-xxxhdpi/"
      pass_condition: Directory contains ic_launcher.png
      blocking: true

## Manual Verification Steps

1. Confirm `assets/icon/icon.png` exists and is 1024×1024 PNG — Expected: file present, >= 50 KB
2. Run `grep applicationId flutter/android/app/build.gradle.kts` → Expected: `com.foundry.app`
3. Run `grep 'android:label' flutter/android/app/src/main/AndroidManifest.xml` → Expected: `"Foundry"`
4. Check `android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png` exists — Expected: file present

## Phase Achievement

Flutter source code is ready for the deploy team. Application ID, label, version, and icon assets are all correctly set and committed to GitHub. Deploy team handles signing and AAB build from here.

## Planner Notes

⚠ UNCLEAR-1: `build.gradle.kts` uses Kotlin DSL (not Groovy). Validator must confirm exact KTS syntax for applicationId/namespace update.

⚠ UNCLEAR-2: `assets/icon/icon.png` must be provided by the app developer before Builder runs. Builder must check for its existence as its first action and stop with a clear message if missing. Validator must write this gate into validated.md explicitly.

⚠ UNCLEAR-3: `flutter_launcher_icons` pubspec.yaml additions — Validator must specify the exact dev_dependencies version and the exact `flutter_icons:` config block content (image_path, adaptive_icon settings).

⚠ NOTE: Signing config (key.properties, foundry-release.jks) is deploy team responsibility. Builder must NOT touch signing config.
