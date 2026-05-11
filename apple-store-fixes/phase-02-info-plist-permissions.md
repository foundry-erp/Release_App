# Phase 02 — Add Info.plist Permission Strings

## Why This Exists
The Foundry App uses `image_picker` (camera/photo library) and `mobile_scanner` (barcode scanning via camera) but the iOS `Info.plist` has **ZERO permission usage description strings**. On iOS 14+, the app will **crash immediately** when accessing the camera, leading to instant App Store rejection under Guideline 2.1.

## Goal
Add all required `NS*UsageDescription` keys to `Info.plist` so iOS presents proper permission dialogs instead of crashing.

## Core Architecture Constraint
DO NOT modify any Dart code, WebView logic, module loading, local HTTP server, or React bundle handling. This phase only modifies `Info.plist`.

## Context — Current Info.plist State
**File:** `foundry-app/flutter/ios/Runner/Info.plist`
- Currently has NO permission strings at all
- Has standard Flutter entries: bundle name, display name, orientations, scene delegate, launch screen
- Bundle display name: "Foundry App"

## What To Build

### Deliverable 1: Add Permission Strings to Info.plist
**File to modify:** `foundry-app/flutter/ios/Runner/Info.plist`

Add these keys inside the top-level `<dict>` block:

1. **NSCameraUsageDescription**
   - Value: `"Foundry App needs camera access to scan barcodes and capture photos for quality inspections and inventory reports."`
   - Required by: `image_picker`, `mobile_scanner`

2. **NSPhotoLibraryUsageDescription**
   - Value: `"Foundry App needs photo library access to attach existing photos to inspection and inventory reports."`
   - Required by: `image_picker`

3. **NSPhotoLibraryAddUsageDescription**
   - Value: `"Foundry App needs permission to save captured photos to your photo library."`
   - Required by: `image_picker` (for saving photos)

Do NOT add permissions the app does not use:
- No `NSLocationWhenInUseUsageDescription` (app has no location features)
- No `NSMicrophoneUsageDescription` (app has no audio features)
- No `NSContactsUsageDescription` (app has no contacts features)

## Acceptance Criteria
- [ ] `NSCameraUsageDescription` exists in Info.plist with descriptive text
- [ ] `NSPhotoLibraryUsageDescription` exists in Info.plist with descriptive text
- [ ] `NSPhotoLibraryAddUsageDescription` exists in Info.plist with descriptive text
- [ ] Permission descriptions are user-friendly and explain WHY the app needs access (Apple rejects generic descriptions)
- [ ] No unnecessary permissions added
- [ ] Info.plist remains valid XML
- [ ] `flutter build ios --no-codesign` completes without errors
- [ ] No other files modified

## Out Of Scope
- Android permissions (already configured in AndroidManifest.xml)
- Privacy manifest (Phase 01)
- Any Dart code changes
- Any changes to WebView, module loading, or local HTTP server

## Test Commands
```bash
# Verify permission strings exist
grep -q "NSCameraUsageDescription" foundry-app/flutter/ios/Runner/Info.plist && echo "Camera PASS" || echo "Camera FAIL"
grep -q "NSPhotoLibraryUsageDescription" foundry-app/flutter/ios/Runner/Info.plist && echo "PhotoLib PASS" || echo "PhotoLib FAIL"
grep -q "NSPhotoLibraryAddUsageDescription" foundry-app/flutter/ios/Runner/Info.plist && echo "PhotoAdd PASS" || echo "PhotoAdd FAIL"

# Verify valid plist
plutil -lint foundry-app/flutter/ios/Runner/Info.plist 2>/dev/null || xmllint --noout foundry-app/flutter/ios/Runner/Info.plist

# Verify no unwanted permissions
grep -q "NSLocationWhenInUseUsageDescription" foundry-app/flutter/ios/Runner/Info.plist && echo "FAIL: Location not needed" || echo "No Location PASS"
grep -q "NSMicrophoneUsageDescription" foundry-app/flutter/ios/Runner/Info.plist && echo "FAIL: Microphone not needed" || echo "No Microphone PASS"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```
