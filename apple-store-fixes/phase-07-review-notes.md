# Phase 07 — Prepare App Store Review Notes & Metadata

## Why This Exists
Apple reviewers use "Notes for Review" to understand non-obvious app architecture. Without clear notes, a reviewer seeing WebView content may immediately reject under 4.2. Well-written review notes are the difference between "this is a web wrapper" and "this is an enterprise field tool with embedded interactive forms."

Also, the app requires login, so demo credentials MUST be provided (Guideline 2.1).

## Goal
Create a comprehensive review notes document and metadata checklist that the developer can copy-paste into App Store Connect.

## Core Architecture Constraint
This phase creates DOCUMENTATION ONLY. No code changes. No architecture changes.

## What To Build

### Deliverable 1: App Store Review Notes Document
**Location:** `foundry-app/flutter/app-store-review-notes.md`

Create a markdown document containing ready-to-paste content for App Store Connect "Notes for Review" field:

```
DEMO ACCOUNT:
Email: test@foundry.com
Password: test1234

IMPORTANT: Please ensure you are connected to the internet for the initial login. After login, the app works fully offline.

APP DESCRIPTION:
Foundry is an enterprise field data collection platform used by quality inspectors and inventory checkers in manufacturing and warehousing environments. Workers use this app to:

1. Scan product barcodes using the device camera (native barcode scanner)
2. Capture photos of products for quality inspection reports (native camera)
3. Fill out structured inspection/inventory forms
4. Work completely offline in environments with poor connectivity
5. Automatically sync collected data when connectivity returns

ARCHITECTURE NOTES:
The app uses a Flutter native shell that provides:
- Native authentication with encrypted credential storage (iOS Keychain)
- Native barcode scanning (MLKit-based scanner)
- Native camera integration for photo capture
- Offline-first data queuing with automatic sync
- Real-time connectivity monitoring and status display
- Dashboard with sync status and module management

The interactive data collection forms are rendered as embedded web content served from the device's local storage (not from a remote website). This approach allows the enterprise to update form templates without requiring app updates — similar to how enterprise MDM tools deliver form configurations.

All form content is pre-loaded and bundled with the app. The forms integrate with native device features (camera, barcode scanner) through a JavaScript bridge.

HOW TO TEST:
1. Login with the demo credentials above
2. On the Dashboard, observe: user greeting, connectivity status, module cards
3. Tap "Quality Inspector" module — scan a barcode or manually enter a product
4. Tap camera icon to capture a photo
5. Fill out the inspection form and submit
6. Toggle airplane mode — notice the offline indicator
7. Toggle airplane mode off — data syncs automatically
8. Go to Settings — view Privacy Policy, app version, support contact
9. Settings > Delete Account demonstrates account deletion (do not actually delete the demo account)
```

### Deliverable 2: App Store Metadata Checklist
**Location:** `foundry-app/flutter/app-store-metadata-checklist.md`

Create a checklist of everything needed in App Store Connect:

```markdown
# App Store Connect Metadata Checklist

## Required Fields
- [ ] App Name: "Foundry" (or "Foundry - Field Inspector")
- [ ] Subtitle: "Offline Field Data Collection" (max 30 chars)
- [ ] Category: Primary = "Business", Secondary = "Productivity"
- [ ] Age Rating: 4+ (no objectionable content)
- [ ] Privacy Policy URL: https://[your-domain]/privacy-policy
- [ ] Support URL: https://[your-domain]/support
- [ ] Marketing URL: https://[your-domain] (optional)

## Screenshots Required (minimum per device)
- [ ] 6.7" iPhone (iPhone 15 Pro Max) — minimum 3 screenshots
- [ ] 6.5" iPhone (iPhone 14 Plus) — minimum 3 screenshots  
- [ ] 12.9" iPad Pro — minimum 3 screenshots (if supporting iPad)

### Recommended Screenshots (in order):
1. Dashboard screen showing modules and sync status
2. Barcode scanning in action
3. Quality inspection form with photo attached
4. Offline mode indicator with pending sync items
5. Settings screen showing privacy and account options

## App Review Information
- [ ] Demo account email: test@foundry.com
- [ ] Demo account password: test1234
- [ ] Notes for Review: (copy from app-store-review-notes.md)
- [ ] Contact email for reviewer questions
- [ ] Contact phone for reviewer questions

## Content Rights
- [ ] Confirm: "Does your app contain, show, or access third-party content?" — Yes (Firebase, Supabase)
- [ ] Confirm: "Do you have rights to this content?" — Yes

## Privacy
- [ ] Privacy policy URL provided
- [ ] App Privacy "nutrition labels" filled out:
  - Contact Info: Email Address (collected, linked to user)
  - Photos or Videos: Photos (collected, not linked to user)
  - Usage Data: Product Interaction (collected, linked to user)
  - Data NOT collected: Location, Contacts, Browsing History, Search History, Identifiers, Purchases, Financial Info, Health, Diagnostics

## Export Compliance
- [ ] Does your app use encryption? — Yes (HTTPS, but exempt under standard exemptions)
- [ ] Is it exempt? — Yes (uses standard OS encryption / HTTPS only)

## Build Settings
- [ ] Built with latest stable Xcode
- [ ] Privacy manifest included (PrivacyInfo.xcprivacy)
- [ ] Dart obfuscation enabled for release build
- [ ] Version number and build number set correctly
```

### Deliverable 3: Keywords and Description
**Location:** Include in `app-store-metadata-checklist.md`

**App Store Description (max 4000 chars):**
```
Foundry is a powerful offline-first field data collection platform designed for quality inspectors, inventory checkers, and field workers in manufacturing and warehousing environments.

KEY FEATURES:
• Barcode Scanning — Instantly scan 1D and 2D barcodes using your device camera
• Photo Capture — Attach photos to inspection reports and inventory counts
• Offline-First — Work without internet. Data syncs automatically when you reconnect
• Real-Time Sync — See sync status on your dashboard. Never lose collected data
• Secure — Enterprise-grade encryption for credentials and data transmission
• Multiple Modules — Access quality inspection, inventory checking, and more

DESIGNED FOR THE FIELD:
Foundry is built for workers who operate in environments with unreliable connectivity. Warehouses, factories, and field sites often lack stable internet — Foundry ensures your work is never lost.

Collect data offline. Sync when ready. Simple.
```

**Keywords (max 100 chars):**
```
inspection,inventory,barcode,scanner,field,data,collection,offline,sync,quality
```

## Acceptance Criteria
- [ ] `app-store-review-notes.md` exists with complete review notes including demo credentials
- [ ] Review notes explain architecture as "embedded interactive forms," NOT "web views"
- [ ] Review notes include step-by-step testing instructions
- [ ] `app-store-metadata-checklist.md` exists with all required fields
- [ ] App description is compelling and within 4000 char limit
- [ ] Keywords are relevant and within 100 char limit
- [ ] Privacy "nutrition labels" section accurately reflects data collection
- [ ] No code files modified in this phase

## Out Of Scope
- Actually uploading to App Store Connect (developer's manual task)
- Creating screenshots (developer takes these from simulator/device)
- Any code changes
- Any changes to WebView or module system

## Test Commands
```bash
# Verify files exist
test -f foundry-app/flutter/app-store-review-notes.md && echo "Review notes PASS" || echo "Review notes FAIL"
test -f foundry-app/flutter/app-store-metadata-checklist.md && echo "Metadata PASS" || echo "Metadata FAIL"

# Verify key content
grep -q "test@foundry.com" foundry-app/flutter/app-store-review-notes.md && echo "Demo account PASS" || echo "Demo account FAIL"
grep -q "test1234" foundry-app/flutter/app-store-review-notes.md && echo "Demo password PASS" || echo "Demo password FAIL"
grep -q "offline" foundry-app/flutter/app-store-review-notes.md && echo "Offline mention PASS" || echo "FAIL"
grep -q "barcode" foundry-app/flutter/app-store-review-notes.md && echo "Barcode mention PASS" || echo "FAIL"
grep -q "Privacy" foundry-app/flutter/app-store-metadata-checklist.md && echo "Privacy section PASS" || echo "FAIL"
```
