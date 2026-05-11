# Foundry Position — Native App Architecture
### Senior Architect Review | April 2026

---

## 1. The Problem

> **"Every client needs a different app. We cannot build, maintain, and release a separate app for every client."**

We serve multiple enterprise clients. Each client has field workers doing different jobs — quality inspectors, inventory managers, warehouse staff, site supervisors. Each client wants their own branded, role-specific tool on their workers' phones.

The traditional approach breaks immediately:

```
Client A → Quality Inspector App     → Build → Sign → App Store → Maintain
Client B → Inventory Checker App     → Build → Sign → App Store → Maintain
Client C → Field Report App          → Build → Sign → App Store → Maintain
...
Client N → [Their workflow]          → Build → Sign → App Store → Maintain
```

**Every new client = a new app. Every workflow change = a new App Store release. Every release = 1–2 weeks of review delay.**

10 clients means 10 apps to build, sign, release, and maintain forever. At 50 clients this becomes a full engineering team just managing releases — before a single line of business logic is written.

---

## 2. Why This Research Was Required

Before committing to this architecture, two fundamental questions had no proven answer:

**Question 1 — Does the theory work technically?**
> Can a Flutter native shell host a React web application inside a WebView, and can that web app call native device features (camera, barcode scanner) as if it were a fully native app?

This had never been validated for our use case. If the bridge between Flutter and the React layer did not work reliably, the entire platform falls apart.

**Question 2 — Will Apple and Google accept this architecture?**
> Both app stores have policies against apps that download and execute code at runtime. Our entire model depends on OTA module delivery — downloading JavaScript bundles after install. If the stores reject this, the platform cannot be published.

These two unknowns made this a research effort, not just a build effort. The architecture had to be proven before it could be scaled.

---

## 3. Goals

1. **One app, any workflow** — a single binary in the App Store serves all clients
2. **Zero-release updates** — client workflows update without App Store review
3. **Offline-first** — field workers lose data less than 1% of the time
4. **Native capabilities** — camera, barcode scanner accessible from any workflow
5. **Per-user access control** — each user sees only their assigned tools
6. **Multi-platform** — iOS, Android, macOS, Windows from one codebase

---

## 4. The Solution — Foundry

> **One shell app. Unlimited modules. No re-releases.**

Foundry is a **Flutter shell** that downloads and runs client-specific web applications (React) at runtime. Think of it as a secure, enterprise-grade browser that only runs your organization's approved tools.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONE APP IN THE APP STORE                      │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │   Module A   │    │   Module B   │    │   Module C   │      │
│   │  Quality     │    │  Inventory   │    │  Any future  │      │
│   │  Inspector   │    │  Checker     │    │  workflow    │      │
│   └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                                  │
│              Flutter Shell (Native Container)                    │
│         Camera | Barcode | Auth | Offline | Sync                 │
└─────────────────────────────────────────────────────────────────┘
         ↕ downloads modules over-the-air when updated
┌─────────────────────────────────────────────────────────────────┐
│                     Cloud (Vercel + Supabase)                    │
│          Module Registry | User Permissions | Data Sync          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Scope & How It Mapped to Goals

| Goal | What Was Built |
|------|---------------|
| One app, any workflow | Native shell with embedded module loader |
| Zero-release updates | Over-the-air module delivery with version registry |
| Offline-first | Local queue with automatic background sync |
| Native capabilities | Bridge connecting web modules to camera, barcode scanner |
| Per-user access control | Authentication layer with role-based module permissions |
| Multi-platform | iOS, Android, macOS, Windows — single codebase |

---

## 6. Final Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  DEVICE  (iOS / Android / macOS / Windows)                           │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │  FLUTTER SHELL  (compiled native app)                         │   │
│  │                                                               │   │
│  │   Auth Service        Module Downloader    Local HTTP Server  │   │
│  │   Firebase + JWT      SHA-256 verified     localhost:8080     │   │
│  │   Secure Keychain     OTA from CDN         Serves modules     │   │
│  │                                                               │   │
│  │              ┌────────────────────────┐                       │   │
│  │              │   JAVASCRIPT BRIDGE    │  ← built in Flutter   │   │
│  │              │                        │                       │   │
│  │              │  React calls Flutter:  │                       │   │
│  │              │  capturePhoto()   ───→ Camera (native)         │   │
│  │              │  scanBarcode()    ───→ Barcode scanner         │   │
│  │              │  getAuthToken()   ───→ Secure storage          │   │
│  │              │  getNetworkState() ──→ Connectivity check      │   │
│  │              └───────────┬────────────┘                       │   │
│  │                          │ inject / postMessage               │   │
│  │  ┌───────────────────────▼──────────────────────────────────┐ │   │
│  │  │  WEBVIEW  (WKWebView on iOS/macOS · WebView on Android)  │ │   │
│  │  │                                                          │ │   │
│  │  │   React Module  (loaded from localhost:8080/[slug]/)     │ │   │
│  │  │                                                          │ │   │
│  │  │   Offline Queue (IndexedDB — survives no connectivity)   │ │   │
│  │  │   Ref Data Cache (products, lookup tables — TTL-based)   │ │   │
│  │  └──────────────────────────────────────────────────────────┘ │   │
│  └───────────────────────────────────────────────────────────────┘   │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ HTTPS  (when online)
┌─────────────────────────────▼────────────────────────────────────────┐
│  BACKEND  (Vercel Serverless)                                         │
│                                                                       │
│   /api/auth      Verify Firebase token                                │
│   /api/modules   Registry: slug · version · CDN URL · checksum       │
│   /api/sync      Receive offline queue (batch)                        │
│   /api/products  Reference data for device cache                      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│  SUPABASE  (PostgreSQL + File Storage)                                │
│                                                                       │
│   users · modules · permissions · inspection_reports · sync_log       │
│                                                                       │
│   Storage:  module-bundles/ (bundle.js served via CDN)                │
│             report-photos/  (field worker photo uploads)              │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. Key Architecture Decisions

### Decision 1 — Why WebView inside Flutter (not pure React Native)?

| Option | Verdict |
|--------|---------|
| Pure React Native | Each client needs a separate compiled app |
| Pure Web App (PWA) | No camera, no barcode scanner, no offline storage |
| **Flutter + WebView** | ✅ One native binary, unlimited web modules, full native access |

The shell is Flutter (compiled native). The workflows are React (web — update without App Store release). Best of both worlds.

---

### Decision 2 — OTA Updates Without Re-releasing

```
Admin pushes new module version to CDN
        ↓
Module registry version number increments
        ↓
App checks registry on every launch
        ↓
If version mismatch → download new bundle.js (SHA-256 verified)
        ↓
Field worker gets updated workflow instantly
        ↓
Zero App Store review. Zero delay.
```

---

### Decision 3 — Offline Architecture

```
Field worker fills form (no internet)
        ↓
Data written to IndexedDB queue (never lost)
        ↓
SyncManager checks connectivity every 30s
        ↓
When online → batch POST to /api/sync
        ↓
Server confirms → queue cleared
```

---

### Decision 4 — JS Bridge (Native ↔ Web)

React modules are web apps — they cannot directly access the camera or barcode scanner. The bridge solves this:

```javascript
// React module calls:
const photo = await shellBridge.capturePhoto();

// Flutter receives, opens camera, returns base64 image
// Promise resolves in React with the result
```

One bridge. Works for all modules. Modules never need to know which platform they're running on.

---

## 8. Platform Coverage

| Platform | Status | Distribution |
|----------|--------|-------------|
| Android | Live | Google Play Internal Track |
| iOS | Submitting | Apple App Store / TestFlight |
| macOS | Built | TestFlight |
| Windows | Built | Signed ZIP |

**Bundle ID across all platforms:** `in.colligence.foundry.position`

---

## 9. Pending — iOS App Store Publishing

```
✅  Build complete
✅  Bundle ID: in.colligence.foundry.position
✅  Firebase iOS configured
✅  Privacy Manifest (PrivacyInfo.xcprivacy)
✅  Encryption compliance declared
✅  Store metadata: description, keywords, screenshots
✅  App Review notes written
✅  Privacy Policy URL live
✅  App submitted for review

⏳  Apple Review                        ← in progress (1–3 days typical)
```

**The key risk — answered:** Apple's guidelines flag apps that download and execute code at runtime. Our submission notes explain clearly that modules are HTML/JS rendered inside WKWebView — no native executable code is downloaded. This is the same model used by enterprise browsers and dashboard apps that are live on the App Store today.

---

## 10. What This Enables Going Forward

```
New client workflow needed?

    Developer builds React module (1-2 weeks)
            ↓
    Admin uploads bundle.js to CDN
            ↓
    Admin creates module entry in registry
            ↓
    Admin assigns module to user roles
            ↓
    Users see new tool on next app launch

    No App Store release. No new app. No waiting.
```

**Adding a new workflow = 0 App Store submissions.**

---

*Foundry Position — Architecture Review | Colligence | April 2026*
