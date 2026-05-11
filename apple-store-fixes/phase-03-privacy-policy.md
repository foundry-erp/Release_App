# Phase 03 — Add Privacy Policy

## Why This Exists
Apple Guideline 5.1.1 requires ALL apps to have a privacy policy accessible both:
1. Within the app itself
2. As a URL in App Store Connect metadata

The Foundry App currently has NO privacy policy anywhere. This is a guaranteed rejection.

## Goal
Create a privacy policy page and add an in-app link to it from the login screen and a new about/legal section.

## Core Architecture Constraint
DO NOT modify WebView logic, module loading, local HTTP server, React bundle handling, or the module list screen's core functionality. Only ADD a privacy policy asset and a minimal link to access it.

## Context — Current App Structure
- **Login screen:** `foundry-app/flutter/lib/screens/login_screen.dart` — email/password form with login button
- **App collects:** email, photos, barcode scans, inspection/inventory data
- **Backend:** `https://foundry-app-rouge.vercel.app` (Vercel serverless)
- **Third-party services:** Firebase (auth only), Supabase (database + storage)
- **Analytics:** NONE (Firebase Analytics is disabled)
- **Tracking:** NONE
- **Ads:** NONE

## What To Build

### Deliverable 1: Privacy Policy HTML File
**Location:** `foundry-app/flutter/assets/legal/privacy-policy.html`

Create a clean, readable HTML privacy policy that covers:

1. **What data is collected:**
   - Email address (for authentication)
   - Photos captured during inspections (uploaded to server)
   - Barcode scan data (product identification)
   - Inspection and inventory report data (form submissions)
   - Device connectivity status (online/offline detection)

2. **How data is used:**
   - Authentication and account management
   - Storing and syncing field inspection/inventory data
   - Generating reports for employer/organization

3. **Third-party services:**
   - Firebase (authentication) — link to Google/Firebase privacy policy
   - Supabase (data storage) — link to Supabase privacy policy
   - Vercel (API hosting) — link to Vercel privacy policy

4. **Data storage and security:**
   - Credentials encrypted via platform keychain (iOS Keychain / Android Keystore)
   - All data transmitted over HTTPS
   - Photos stored locally until synced, then uploaded to secure cloud storage

5. **Data retention and deletion:**
   - Users can request account deletion (Phase 04 will implement this)
   - Upon deletion, all associated data is removed from servers

6. **No tracking, no ads, no analytics:**
   - App does not use advertising SDKs
   - App does not use analytics SDKs
   - App does not track users across apps or websites

7. **Children's privacy:**
   - App is not intended for children under 13
   - No data knowingly collected from children

8. **Contact information:**
   - Company: Colligence (matching bundle ID `in.colligence.foundry.position`)
   - Support email: (use a placeholder like `support@colligence.in` — user will update)

9. **Effective date and updates:**
   - Include today's date as effective date
   - Note that policy may be updated with notice

Style: Clean, professional HTML with inline CSS. Mobile-responsive. Dark theme option to match app aesthetic.

### Deliverable 2: Privacy Policy Screen in Flutter
**Location:** `foundry-app/flutter/lib/screens/privacy_policy_screen.dart`

Create a new Flutter screen that:
- Loads the HTML privacy policy from assets using a WebView OR renders it as a scrollable native Flutter widget
- Has an AppBar with title "Privacy Policy" and a back button
- Matches the app's dark theme (backgroundColor: 0xFF1A1A2E, accent: 0xFF6C63FF)

**Recommended approach:** Use a simple `SingleChildScrollView` with `Text` widgets for the policy content, since adding another WebView just for static content is overkill and could raise 4.2 concerns. Keep it native Flutter.

### Deliverable 3: Add Privacy Policy Link to Login Screen
**File to modify:** `foundry-app/flutter/lib/screens/login_screen.dart`

Add a tappable "Privacy Policy" text link below the login button (or at the bottom of the screen). When tapped, navigate to the PrivacyPolicyScreen.

- Style: Small text, underlined or lighter color, centered below login button
- Text: "Privacy Policy"
- Keep the existing login UI unchanged — only add the link

### Deliverable 4: Register Asset in pubspec.yaml
**File to modify:** `foundry-app/flutter/pubspec.yaml`

Add `assets/legal/` to the assets list so the HTML file is bundled.

## Acceptance Criteria
- [ ] Privacy policy HTML file exists at `assets/legal/privacy-policy.html`
- [ ] Privacy policy covers all 9 sections listed above
- [ ] PrivacyPolicyScreen exists and displays the policy content
- [ ] Login screen has a visible "Privacy Policy" link
- [ ] Tapping the link navigates to the privacy policy screen
- [ ] Back button returns to login screen
- [ ] Privacy policy screen matches app dark theme
- [ ] `pubspec.yaml` includes the legal assets directory
- [ ] `flutter build ios --no-codesign` completes without errors
- [ ] No changes to WebView module loading, local HTTP server, or React bundles

## Out Of Scope
- App Store Connect metadata (done manually by developer)
- Hosting privacy policy on a public URL (developer's responsibility)
- Account deletion implementation (Phase 04)
- Settings screen (Phase 06)
- Any changes to WebView, module loading, or local HTTP server

## Test Commands
```bash
# Verify files exist
test -f foundry-app/flutter/assets/legal/privacy-policy.html && echo "HTML PASS" || echo "HTML FAIL"
test -f foundry-app/flutter/lib/screens/privacy_policy_screen.dart && echo "Screen PASS" || echo "Screen FAIL"

# Verify login screen references privacy
grep -q "privacy" foundry-app/flutter/lib/screens/login_screen.dart && echo "Login link PASS" || echo "Login link FAIL"

# Verify pubspec includes assets
grep -q "legal" foundry-app/flutter/pubspec.yaml && echo "Asset PASS" || echo "Asset FAIL"

# Verify policy content
grep -q "email" foundry-app/flutter/assets/legal/privacy-policy.html && echo "Email coverage PASS" || echo "FAIL"
grep -q "Firebase" foundry-app/flutter/assets/legal/privacy-policy.html && echo "Firebase coverage PASS" || echo "FAIL"
grep -q "delete" foundry-app/flutter/assets/legal/privacy-policy.html && echo "Deletion coverage PASS" || echo "FAIL"

# Verify Flutter build
cd foundry-app/flutter && flutter build ios --no-codesign 2>&1 | tail -5
```
