# Foundry — App Store Submission Record

> This file records exactly what was submitted. If Apple rejects, update the "Rejection" section and note what to change next time.

---

## Submission Date
2026-04-13 (Attempt 1) → 2026-04-15 (Attempt 2)

## Build Version
1.0.0+3

## Bundle ID
in.colligence.foundry.position

---

## App Store Listing Fields

| Field | Value |
|-------|-------|
| App Name | Foundry |
| Subtitle | (blank) |
| Primary Category | Business |
| Secondary Category | Productivity |
| Age Rating | 4+ |
| Privacy Policy URL | https://vijaybhatcolligence.github.io/Foundry/privacy |
| Support URL | https://colligence.in |
| Marketing URL | (blank) |
| Copyright | 2025 Colligence |

---

## Description Fields

**Promotional Text (170 chars max):**
> Your organization's field tools, always in your pocket. Offline-ready, role-based, and synced automatically when you're back online.

**Keywords:**
> enterprise,field ops,quality inspection,inventory,barcode scanner,offline,forms

**Long Description:** see STORE_LISTING.md

---

## App Review Information

| Field | Value |
|-------|-------|
| Sign-in required | Yes |
| Test username | test@foundry.com |
| Test password | test1234 |
| Contact email | support@colligence.in |

**Review Notes (Attempt 2 — updated to address Guideline 4.7):**
```
Foundry is an internal enterprise application. Access requires
organization-issued credentials. Use the test account below to sign in:

Email: test@foundry.com
Password: test1234

After signing in, the Dashboard shows 2 modules: Quality Inspector
and Inventory Checker. Tap either to open.

--- GUIDELINE 4.7 COMPLIANCE ---

This app operates under the Guideline 4.7 mini app framework:

4.7.1 — Content moderation: All module content is published
exclusively by the organization's IT administrator via a credentialed
backend. There is no public content channel, no user-generated content,
and no mechanism for end users to publish anything. Abuse moderation
requirements do not apply to closed enterprise content systems.

4.7.2 — Native API exposure: The JavaScript bridge exposes exactly
5 named capabilities to downloaded modules: capturePhoto, scanBarcode,
getAuthToken, getNetworkState, readFile. No raw platform APIs are
exposed. No new capabilities can be added post-submission without
an app update. The bridge is tightly scoped by design.

4.7.4 — Module index: The app serves 2 modules at submission time:
  1. Quality Inspector (slug: quality-inspector, v1.2.1) —
     logs product non-conformances with photo capture
  2. Inventory Checker (slug: inventory-checker, v1.1.2) —
     records stock counts by SKU and location

All modules are HTML + JavaScript rendered in WKWebView. No native
executable code is downloaded at any point.
```

---

## Content Rights
- Contains third-party content: **No**

---

## Encryption
- ITSAppUsesNonExemptEncryption = false (set in Info.plist)
- Uses only standard HTTPS/TLS, Firebase Auth (TLS), and OS keychain

---

## Screenshots Submitted

| Slot | File | Size |
|------|------|------|
| iPhone 6.5" | sc1_dashboard.png | 1242×2688 |
| iPhone 6.5" | sc2_settings.png | 1242×2688 |
| iPhone 6.5" | sc3_login.png | 1242×2688 |
| iPhone 6.5" | sc4_quality_inspector.png | 1242×2688 |
| iPhone 6.5" | sc5_inventory_checker.png | 1242×2688 |
| iPad 13" | ipad_sc1_dashboard.png | 2064×2752 |
| iPad 13" | ipad_sc2_settings.png | 2064×2752 |
| iPad 13" | ipad_sc3_quality.png | 2064×2752 |

---

## App Store Version Release
- Setting: **Automatically release this version**

---

## Pre-Submission Audit (Attempt 2)
Conducted against official Apple App Store Review Guidelines. Overall passing likelihood: **72%**

| Guideline | Status | Notes |
|-----------|--------|-------|
| 1.x Safety | PASS | B2B app, no objectionable content possible |
| 2.1 App Completeness | PASS | iPad login loop fixed (post-frame callback) |
| 2.3.8 Icons/Metadata | PASS | 21 icon sizes regenerated from source, nested folder bug fixed |
| 2.4 Hardware Compatibility | PASS | iPhone + iPad supported |
| 4.2 Minimum Functionality | PASS | Camera, barcode, offline queue, secure auth — not just a web wrapper |
| 4.7 Mini Apps / Dynamic JS | RISK | Review notes updated to address 4.7.1, 4.7.2, 4.7.4 explicitly |
| 4.8 Login Services | PASS | Enterprise email/password auth, exempt from Sign in with Apple |
| 5.1 Privacy | PASS | PrivacyInfo.xcprivacy present, NSPrivacyTracking = false |
| 5.1.2 Data Sharing | PASS | No third-party data sharing |

**Biggest remaining risk:** Guideline 4.7.2 — native API bridge exposure. Mitigated by review notes explaining the 5-method scoped bridge.

---

## Blockers Fixed

| Blocker | Fix | Attempt |
|---------|-----|---------|
| Missing iPad screenshots | Generated at 2064×2752 | 1 |
| Primary category not set | Set to Business | 1 |
| Privacy Policy URL missing | GitHub Pages hosted | 1 |
| Content Rights not set | Answered No | 1 |
| Age Rating not answered | All None/No → 4+ | 1 |
| Encryption compliance | ITSAppUsesNonExemptEncryption=false | 1 |
| Placeholder icon (2.3.8) | Regenerated 21 sizes from source image, fixed nested folder | 2 |
| iPad login redirect (2.1) | post-frame callback on LoadingScreen._checkAuth | 2 |
| Review notes missing 4.7 | Added explicit 4.7.1/4.7.2/4.7.4 compliance language | 2 |

---

## Rejection History

### Attempt 1 — 2026-04-13
**Status:** Rejected — 2026-04-14

| # | Guideline | Issue | Fix Applied |
|---|-----------|-------|-------------|
| 1 | 2.3.8 | App icon was placeholder (ios: false in pubspec) | ios: true, regenerated all 21 sizes, fixed nested folder |
| 2 | 2.1(a) | iPad login redirect after sign-in | post-frame callback on LoadingScreen |

### Attempt 2 — 2026-04-15
**Status:** Submitted — awaiting review

**If rejected, record here:**
- Rejection reason:
- Guideline number:
- What to change:
- Resubmit date:
