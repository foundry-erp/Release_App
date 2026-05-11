# Foundry — Store Listing Metadata

> Hand this file to the deploy team. They copy-paste each section into App Store Connect (Apple) and Google Play Console (Google). Nothing else is needed from the app developer side.

---

## App Name

```
Foundry
```

---

## Short Description
*(Google Play — max 80 characters)*

```
Enterprise field operations platform for quality and inventory teams.
```

---

## Long Description
*(Used for both Google Play and Apple App Store — max 4000 characters)*

```
Foundry is an enterprise mobile platform built for field operations teams. It delivers role-specific operational tools to frontline workers — quality inspectors, inventory managers, and site supervisors — through a secure, unified app.

When you log in, Foundry loads only the modules your organization has assigned to your role. Each module is a purpose-built operational workflow: scan a barcode to log inventory, capture a photo to document a defect, submit an inspection form that syncs to your operations system in real time.

KEY CAPABILITIES

• Role-based module access controlled by your organization's admin
• Barcode and QR code scanning for inventory and asset tracking
• Photo capture with automatic upload for defect and quality documentation
• Offline-capable: work continues without internet, syncs automatically when reconnected
• Secure authentication: credentials stored in device secure storage, tokens auto-refreshed
• Always up to date: your IT team can push updated workflows without requiring an app store release

DESIGNED FOR

• Quality inspection teams logging non-conformances on the factory or warehouse floor
• Logistics and inventory teams managing stock movements and cycle counts
• Field service teams submitting job completion and compliance reports

Foundry is an internal enterprise tool. Access requires credentials issued by your organization. Download the app and contact your IT administrator for login access.
```

---

## Keywords
*(Apple App Store — max 100 characters total, comma separated)*

```
enterprise,field ops,quality inspection,inventory,barcode scanner,offline,forms
```

---

## Category

| Store | Primary | Secondary |
|-------|---------|-----------|
| Apple App Store | Business | Productivity |
| Google Play | Business | — |

---

## Age Rating

```
4+  (Apple)
Everyone  (Google Play)
```

No user-generated content, no purchases, no objectionable content.

---

## Privacy Policy URL

> The deploy team needs a live URL before submission. Provide a hosted privacy policy page.
> Minimum content required: what data is collected (email, auth token), how it is stored (encrypted on device), and how users can request deletion.

```
[TO BE PROVIDED — e.g. https://colligence.in/privacy]
```

---

## Notes for Reviewers
*(Paste this into the "Notes for App Review" field in App Store Connect and Google Play)*

```
Foundry is an internal enterprise application. Access requires organization-issued credentials — reviewers can use the test account provided below.

The app downloads HTML and JavaScript web content at runtime to render operational workflows inside a native WKWebView (iOS/macOS) or WebView (Android). No native executable code is downloaded. This is functionally equivalent to a browser loading a web page, with an additional native bridge for camera, barcode scanning, and device secure storage. The downloaded content only extends the app's core enterprise workflow functionality.
```

---

## Test Account for Reviewers

```
Email:    test@foundry.com
Password: test1234
```

> This account must be active and accessible at time of review submission.

---

## Screenshots Required

| Platform | Count | Size |
|----------|-------|------|
| iPhone 6.9" (required) | 3–5 | 1320 × 2868 px |
| iPhone 6.5" (required) | 3–5 | 1242 × 2688 px |
| iPad Pro 13" (if iPad supported) | 3–5 | 2064 × 2752 px |
| Android Phone | 2–8 | min 320px, max 3840px |

> Deploy team captures these from a physical device or simulator. App developer does not need to provide these.

---

## Support URL

```
[TO BE PROVIDED — e.g. https://colligence.in/support or an email link]
```

---

## What the Deploy Team Does With This File

1. Open **App Store Connect** → My Apps → Foundry → App Store → App Information
2. Paste **App Name**, **Description**, **Keywords**, **Support URL**, **Privacy Policy URL**
3. Paste **Notes for Reviewers** into the App Review Information section
4. Enter **Test Account** credentials in App Review Information
5. Upload screenshots
6. Set Age Rating using the questionnaire (answer: no objectionable content, no purchases)
7. Repeat equivalent steps in **Google Play Console** → Store listing

**That is all — the app developer's work ends here.**
