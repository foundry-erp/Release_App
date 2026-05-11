# Phase 01 — Add iOS Privacy Manifest (PrivacyInfo.xcprivacy)

## Why This Exists
Apple **auto-rejects** any app without a privacy manifest since February 2025. The Foundry App currently has NO `PrivacyInfo.xcprivacy` file. This blocks App Store submission entirely.

## Goal
Add a complete `PrivacyInfo.xcprivacy` file to the iOS Runner target that declares all Required Reason APIs used by the app and its dependencies.

## Core Architecture Constraint
DO NOT modify any existing Dart code, WebView logic, module loading, local HTTP server, or React bundle handling. This phase only adds an iOS config file.

## Context — App Dependencies That Use Required Reason APIs
The Foundry App (Flutter) uses these plugins that access Required Reason APIs:
- `firebase_core` — uses `NSUserDefaults` (API category: NSPrivacyAccessedAPICategoryUserDefaults)
- `firebase_auth` — uses `NSUserDefaults`
- `flutter_secure_storage` — uses Keychain (not a Required Reason API, but declare if applicable)
- `connectivity_plus` — may access system configuration APIs
- `path_provider` — accesses file timestamp APIs (API category: NSPrivacyAccessedAPICategoryFileTimestamp)
- `webview_flutter_wkwebview` — may use disk space or system boot time APIs
- `image_picker` — accesses photo library
- `mobile_scanner` — accesses camera

## What To Build

### Deliverable 1: PrivacyInfo.xcprivacy
**Location:** `foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy`

This is an XML property list file. It must declare:

1. **Privacy Tracking:** `NSPrivacyTracking` = `false` (app does NOT track users)
2. **Tracking Domains:** `NSPrivacyTrackingDomains` = empty array (no tracking domains)
3. **Collected Data Types:** `NSPrivacyCollectedDataTypes` — declare:
   - Email address (collected for app functionality, linked to user identity)
   - Photos (collected for app functionality, not linked to user identity)
   - Product interaction data (collected for app functionality, linked to user identity)
4. **Accessed API Types:** `NSPrivacyAccessedAPITypes` — declare each Required Reason API:
   - **UserDefaults** (category: `NSPrivacyAccessedAPICategoryUserDefaults`, reason: `CA92.1` — app's own data access)
   - **File Timestamp** (category: `NSPrivacyAccessedAPICategoryFileTimestamp`, reason: `C617.1` — accessing file timestamps within app container)
   - **Disk Space** (category: `NSPrivacyAccessedAPICategoryDiskSpace`, reason: `E174.1` — checking available disk space for downloads)
   - **System Boot Time** (category: `NSPrivacyAccessedAPICategorySystemBootTime`, reason: `35F9.1` — measuring elapsed time for performance)

### Deliverable 2: Add to Xcode Project
The `PrivacyInfo.xcprivacy` file must be added to the Runner target's **Build Resources** in `project.pbxproj` so Xcode includes it in the app bundle.

**File to modify:** `foundry-app/flutter/ios/Runner.xcodeproj/project.pbxproj`
- Add the file reference to PBXFileReference section
- Add it to PBXBuildFile section
- Add it to PBXResourcesBuildPhase section
- Add it to the Runner group in PBXGroup section

## Acceptance Criteria
- [ ] `PrivacyInfo.xcprivacy` exists at `ios/Runner/PrivacyInfo.xcprivacy`
- [ ] File is valid XML property list format
- [ ] All 4 Required Reason API categories are declared with valid reason codes
- [ ] `NSPrivacyTracking` is set to `false`
- [ ] Collected data types include email and photos
- [ ] File is included in Xcode project build resources
- [ ] `flutter build ios --no-codesign` completes without errors
- [ ] No existing files modified except `project.pbxproj` (for the resource reference)

## Out Of Scope
- Android privacy configurations
- Modifying any Dart source code
- Modifying Info.plist (that is Phase 02)
- Privacy policy web page (that is Phase 03)
- Any changes to WebView, module loading, or local HTTP server

## Test Commands
```bash
# Verify file exists
test -f foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy && echo "PASS" || echo "FAIL"

# Verify valid XML
xmllint --noout foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy && echo "VALID XML" || echo "INVALID XML"

# Verify key sections exist in the file
grep -q "NSPrivacyAccessedAPITypes" foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy && echo "API Types declared" || echo "MISSING API Types"
grep -q "NSPrivacyTracking" foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy && echo "Tracking declared" || echo "MISSING Tracking"
grep -q "NSPrivacyCollectedDataTypes" foundry-app/flutter/ios/Runner/PrivacyInfo.xcprivacy && echo "Data Types declared" || echo "MISSING Data Types"

# Verify project.pbxproj references the file
grep -q "PrivacyInfo" foundry-app/flutter/ios/Runner.xcodeproj/project.pbxproj && echo "Xcode ref PASS" || echo "Xcode ref FAIL"

# Verify Flutter build still works
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```
