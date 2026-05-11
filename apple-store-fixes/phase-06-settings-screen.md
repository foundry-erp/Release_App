# Phase 06 — Add Native Flutter Settings Screen

## Why This Exists
Multiple Apple guidelines require accessible in-app links to privacy policy, account deletion, and support contact. A settings screen is the standard place for all of these. It also adds more native Flutter UI, further reducing Guideline 4.2 (Minimum Functionality) rejection risk.

## Goal
Add a Settings screen accessible from the Dashboard (Phase 05) that consolidates: privacy policy access, account deletion, logout, app version info, and support contact.

## Core Architecture Constraint
DO NOT modify WebView logic, module loading, local HTTP server, React bundle handling, or the IndexedStack module system. This is a new Flutter screen added alongside existing screens.

## Context — Dependencies from Previous Phases
- **Phase 03** created: `lib/screens/privacy_policy_screen.dart` (privacy policy viewer)
- **Phase 04** created: `lib/widgets/delete_account_dialog.dart` (account deletion confirmation)
- **Phase 05** created: `lib/screens/dashboard_screen.dart` (has popup menu with "Settings" placeholder)
- **Existing:** `lib/services/auth_service.dart` (has `logout()` and `deleteAccount()`)

## What To Build

### Deliverable 1: Settings Screen
**Location:** `foundry-app/flutter/lib/screens/settings_screen.dart`

Create a `SettingsScreen` StatelessWidget with these sections:

**1. Account Section**
- User email display (read from FlutterSecureStorage via AuthService)
- "Delete Account" — tappable row with red text, shows DeleteAccountDialog (from Phase 04)
- "Log Out" — tappable row, calls AuthService.logout(), navigates to LoginScreen

**2. Legal Section**
- "Privacy Policy" — tappable row, navigates to PrivacyPolicyScreen (from Phase 03)
- "Terms of Service" — tappable row (can show a placeholder or link to a URL)

**3. About Section**
- "App Version" — show version from package_info or hardcode "1.0.0" for now
- "Contact Support" — show support email (`support@colligence.in`)

**4. Data Section**
- "Clear Local Cache" — clears downloaded module bundles from device storage (re-downloads on next launch)
  - Show confirmation dialog before clearing
  - Call a method to delete files from the app documents directory (module bundles only, NOT auth tokens)
  - This is useful for field workers with storage issues

**UI Style:**
- Standard settings list layout (grouped sections with section headers)
- Dark theme (0xFF1A1A2E background, 0xFF6C63FF accent)
- Each row: icon on left, title, optional subtitle, chevron/arrow on right
- Destructive actions (delete account, logout) in red text

### Deliverable 2: Connect Settings to Dashboard
**File to modify:** `foundry-app/flutter/lib/screens/dashboard_screen.dart`

Update the popup menu "Settings" option (placeholder from Phase 05) to navigate to `SettingsScreen`.

```dart
Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
```

### Deliverable 3: Cache Clearing Service Method
**File to modify:** `foundry-app/flutter/lib/services/module_download_service.dart`

Add a static/instance method `clearLocalCache()` that:
1. Gets the app documents directory via `path_provider`
2. Lists downloaded module bundle directories
3. Deletes them (NOT the auth tokens — those are in FlutterSecureStorage)
4. Returns the amount of space freed (optional, nice-to-have)

**Be careful:** Only delete module bundle files, not the entire documents directory.

## Acceptance Criteria
- [ ] SettingsScreen exists at `lib/screens/settings_screen.dart`
- [ ] Account section shows user email
- [ ] "Delete Account" triggers DeleteAccountDialog from Phase 04
- [ ] "Log Out" calls AuthService.logout() and navigates to LoginScreen
- [ ] "Privacy Policy" navigates to PrivacyPolicyScreen from Phase 03
- [ ] "App Version" displays the version string
- [ ] "Contact Support" shows support email
- [ ] "Clear Local Cache" deletes only module bundles with confirmation
- [ ] Dashboard popup menu navigates to SettingsScreen
- [ ] Back button returns to Dashboard
- [ ] Dark theme consistent with app
- [ ] No changes to WebView, module_webview.dart, local HTTP server, or React bundles
- [ ] `flutter build ios --no-codesign` completes without errors

## Out Of Scope
- Push notification settings (not implemented)
- Theme toggle (app only has dark theme)
- Language settings
- Any changes to WebView or module system

## Test Commands
```bash
# Verify file exists
test -f foundry-app/flutter/lib/screens/settings_screen.dart && echo "Settings PASS" || echo "Settings FAIL"

# Verify key features
grep -q "Delete Account\|deleteAccount\|DeleteAccountDialog" foundry-app/flutter/lib/screens/settings_screen.dart && echo "Delete PASS" || echo "Delete FAIL"
grep -q "Privacy\|privacy_policy" foundry-app/flutter/lib/screens/settings_screen.dart && echo "Privacy PASS" || echo "Privacy FAIL"
grep -q "Log Out\|logout\|Logout" foundry-app/flutter/lib/screens/settings_screen.dart && echo "Logout PASS" || echo "Logout FAIL"
grep -q "version\|Version" foundry-app/flutter/lib/screens/settings_screen.dart && echo "Version PASS" || echo "Version FAIL"

# Verify dashboard integration
grep -q "SettingsScreen\|settings_screen" foundry-app/flutter/lib/screens/dashboard_screen.dart && echo "Dashboard link PASS" || echo "Dashboard link FAIL"

# Verify cache clearing
grep -q "clearLocalCache\|clearCache\|clear.*cache" foundry-app/flutter/lib/services/module_download_service.dart && echo "Cache clear PASS" || echo "Cache clear FAIL"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```
