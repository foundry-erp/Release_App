# Phase 09 — Fix Launch Screen for Flutter Engine Init

## Why This Exists
Flutter apps have a known issue where a white/blank screen appears during engine initialization (1-3 seconds). If an Apple reviewer sees a white screen on launch, they may reject under Guideline 2.1 (App Completeness) thinking the app is broken or incomplete.

The app has a `LaunchScreen.storyboard` but it needs to be verified and enhanced to show a proper branded splash screen that bridges the gap until Flutter renders.

## Goal
Ensure the iOS launch screen shows a branded Foundry splash (logo + background color) instead of a white screen during Flutter engine initialization.

## Core Architecture Constraint
DO NOT modify any Dart code, WebView logic, module loading, local HTTP server, or React bundles. This phase only touches iOS storyboard and asset files.

## Context — Current State
- **LaunchScreen.storyboard:** `foundry-app/flutter/ios/Runner/Base.lproj/LaunchScreen.storyboard`
  - Currently exists but may be default Flutter template (white background)
- **App theme:** Dark theme with background `0xFF1A1A2E` and accent `0xFF6C63FF`
- **App icon:** Configured via `flutter_launcher_icons` package
- **App name:** "Foundry App"

## What To Build

### Deliverable 1: Update LaunchScreen.storyboard
**File to modify:** `foundry-app/flutter/ios/Runner/Base.lproj/LaunchScreen.storyboard`

Update the launch screen storyboard to show:

1. **Background color:** Match app dark theme — RGB(26, 26, 46) which is `0xFF1A1A2E`
   - Set the main view's background color to this dark blue/navy

2. **Centered app name or logo:**
   - Option A (simpler): Add a centered UILabel with text "Foundry" in white, system font bold, size 32
   - Option B (if icon exists): Add a centered UIImageView with the app icon, constrained to 100x100

3. **Auto Layout Constraints:**
   - Center horizontally and vertically in the safe area
   - Works on all iPhone and iPad sizes

The storyboard XML must be valid Interface Builder format.

### Deliverable 2: Verify Launch Image Assets
**Directory:** `foundry-app/flutter/ios/Runner/Assets.xcassets/LaunchImage.imageset/`

Check if launch images exist. If they're placeholder/empty:
- Either remove the imageset (storyboard-only approach is modern and preferred)
- Or add a simple branded image matching the dark theme

**Modern approach (recommended):** Use storyboard only, no LaunchImage assets needed. Ensure `Info.plist` references the storyboard:
```xml
<key>UILaunchStoryboardName</key>
<string>LaunchScreen</string>
```

### Deliverable 3: Verify Flutter Native Splash Compatibility
Ensure there's no conflict between the native launch screen and Flutter's first frame. The transition should be:

```
iOS LaunchScreen.storyboard (dark branded screen)
    → Flutter renders first frame (LoadingScreen with matching dark theme)
        → Seamless transition (same background color)
```

The key is **matching colors**: if LaunchScreen has `0xFF1A1A2E` background and Flutter's LoadingScreen also has `0xFF1A1A2E` background, the transition is invisible to the user.

**Check:** `foundry-app/flutter/lib/screens/loading_screen.dart` — verify its Scaffold backgroundColor matches the launch screen color. If it doesn't, note the mismatch but do NOT change Dart code in this phase (just document it).

## Acceptance Criteria
- [ ] LaunchScreen.storyboard has dark background color (RGB 26, 26, 46)
- [ ] LaunchScreen.storyboard has centered app name or logo
- [ ] Auto Layout constraints work for all device sizes
- [ ] Info.plist references `LaunchScreen` storyboard (verify, should already be set)
- [ ] No white/blank flash on app launch
- [ ] Storyboard XML is valid Interface Builder format
- [ ] No Dart code modified
- [ ] No changes to WebView, module loading, or local HTTP server
- [ ] `flutter build ios --no-codesign` completes without errors

## Out Of Scope
- Flutter-side splash screen packages (flutter_native_splash)
- Android splash screen (separate concern)
- Animated launch screens
- Any Dart code changes
- Any changes to WebView or module system

## Test Commands
```bash
# Verify storyboard exists
test -f "foundry-app/flutter/ios/Runner/Base.lproj/LaunchScreen.storyboard" && echo "Storyboard PASS" || echo "Storyboard FAIL"

# Verify dark background color is set (check for color values in storyboard)
grep -q "0.10196\|1A1A2E\|0.101960" "foundry-app/flutter/ios/Runner/Base.lproj/LaunchScreen.storyboard" && echo "Dark color PASS" || echo "Dark color CHECK MANUALLY"

# Verify some content exists (label or imageview)
grep -q "label\|imageView\|UILabel\|UIImageView" "foundry-app/flutter/ios/Runner/Base.lproj/LaunchScreen.storyboard" && echo "Content PASS" || echo "Content CHECK MANUALLY"

# Verify Info.plist references launch screen
grep -q "LaunchScreen" foundry-app/flutter/ios/Runner/Info.plist && echo "Plist ref PASS" || echo "Plist ref FAIL"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```
