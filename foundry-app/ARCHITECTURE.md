# Foundry App — Complete Architecture Guide
> Written for presentation. Every claim is grounded in actual code in this repo.

---

## What Is Foundry?

Foundry is a **modular, offline-first mobile data collection platform** built for field workers. The core idea: a single Flutter app on Android that can host multiple independent React-based tools (called **modules**) — barcode scanners, inventory checkers, quality inspectors — all working offline and syncing when connectivity returns.

**In plain English:**
- Open the app → sign in → see your assigned modules → tap a module → a React web app loads inside the phone → you do your work (scan barcodes, take photos, fill forms) → data is saved locally even if offline → when you get wifi/mobile data, it silently syncs everything to the cloud.

---

## Big Picture: The Four Layers

```
┌─────────────────────────────────────────────────────┐
│  LAYER 1: Flutter Shell (Android App)               │
│  - Native camera, barcode scanner, local web server │
│  - Hosts React modules in a WebView                 │
│  - Auth (Firebase + JWT)                            │
└────────────────────┬────────────────────────────────┘
                     │  JavaScript Bridge (calls)
┌────────────────────▼────────────────────────────────┐
│  LAYER 2: React Modules (quality-inspector, etc.)   │
│  - Feature UIs built in React                       │
│  - Offline queue (IndexedDB)                        │
│  - Served from localhost HTTP server inside app     │
└────────────────────┬────────────────────────────────┘
                     │  HTTPS (when online)
┌────────────────────▼────────────────────────────────┐
│  LAYER 3: Backend API (Vercel Serverless)           │
│  - Node.js functions for auth, sync, modules, data  │
│  - Deployed on Vercel (auto-scales, no servers)     │
└────────────────────┬────────────────────────────────┘
                     │  PostgreSQL queries / File storage
┌────────────────────▼────────────────────────────────┐
│  LAYER 4: Supabase (Database + File Storage)        │
│  - PostgreSQL: users, modules, products, reports    │
│  - Storage: module bundles (CDN), user photos       │
└─────────────────────────────────────────────────────┘
```

---

## Layer 1: Flutter Shell

**Folder:** `flutter/`

Flutter is the outer shell of the app. It handles everything native — things a web page cannot do on its own.

### What Flutter Does

| Responsibility | How |
|---|---|
| Firebase sign-in (email/password) | `firebase_auth` package |
| Stores JWT token securely on device | `flutter_secure_storage` |
| Runs a local HTTP server inside the phone | `shelf` + `shelf_static` packages |
| Hosts React modules in a WebView | `webview_flutter` package |
| Injects auth tokens into React app | JavaScript injection on page load |
| Native camera → captures photo to disk | `image_picker` package |
| Barcode scanning | `mobile_scanner` package |
| Network state detection (wifi/mobile/offline) | `connectivity_plus` package |

### Auth Flow (Step by Step)

```
1. User opens app
2. Flutter checks FlutterSecureStorage for JWT
3. If JWT exists and is valid → go to ShellScreen
4. If not → go to LoginScreen
5. User enters email + password
6. Firebase Auth validates credentials → returns Firebase ID Token
7. Flutter sends that Firebase token to: POST /api/auth/login
8. Backend verifies token with Firebase Admin SDK
9. Backend upserts user in Supabase → returns custom JWT (7-day expiry)
10. Flutter stores JWT in FlutterSecureStorage
11. Done — JWT is used for all future API calls
```

**Why two tokens?** Firebase token is short-lived and Firebase-specific. The backend issues its own JWT so API calls don't depend on Firebase being available every time.

### Local HTTP Server

This is one of the most important — and unusual — pieces of the architecture.

React modules (JavaScript bundles) are stored inside the Flutter app, either bundled in `assets/modules/` or downloaded and cached in the phone's document directory. The problem: WebViews can't load local files directly (security restriction on Android). 

**Solution:** Flutter runs a real HTTP server inside the phone on `localhost:8080`. When a module opens, it loads from `http://localhost:8080/quality-inspector/` — as if it were a website, but entirely on-device.

```
Flutter App
  ↓
LocalHttpServer (shelf, port 8080)
  ↓ serves files from:
  app_doc_dir/modules/quality-inspector/   ← downloaded updates
  OR
  flutter/assets/modules/quality-inspector/  ← bundled fallback
  ↓
WebView loads: http://localhost:8080/quality-inspector/
```

### JavaScript Bridge (Shell Bridge)

The React module runs in a WebView — it's a web page. But it needs to use the phone's camera and barcode scanner. The bridge solves this.

**How it works:**
- Flutter registers a `JavaScriptChannel` named `shellBridge`
- React calls `window.shellBridge._call('capturePhoto', {})` 
- Flutter receives this, executes the native action, returns result as JSON back into the WebView

**Bridge methods available to React modules:**

| Method | What It Does |
|---|---|
| `ping()` | Health check — confirms bridge is alive |
| `getAuthToken()` | Returns stored JWT |
| `capturePhoto()` | Opens camera → saves photo to disk → returns base64 preview + file path |
| `readFile(filePath)` | Reads a file from app's document directory → returns base64 |
| `getNetworkState()` | Returns `{isOnline: true, type: "wifi"}` |
| `scanBarcode()` | Opens full-screen barcode scanner → returns `{value, format}` |

**Auth injection:** Before WebView loads, Flutter injects:
```javascript
window.__foundry_auth__ = {
  token: "eyJ...",        // JWT for API calls
  user: { id, email },
  apiBaseUrl: "https://foundry-backend.vercel.app"
}
```
React modules read this to know where to send API requests and with what token.

### Module Version Management

Flutter keeps modules up to date automatically:

1. On login, Flutter calls `GET /api/modules` → gets list of modules with current versions
2. Compares each module's version against cached version (`modules_cache.json` on device)
3. If version mismatch → downloads new bundle from Supabase CDN → stores in `app_doc_dir/modules/{slug}/`
4. Next time module opens, it serves the updated version

---

## Layer 2: React Modules

**Folder:** `modules/`

React modules are the actual feature screens — the UI the field worker sees and touches. They are standard React 18 web apps bundled with Webpack 5 into a single `bundle.js` file.

### Current Modules

| Module | Version | Purpose |
|---|---|---|
| `quality-inspector` | 1.2.1 | Scan items, take photos, submit quality reports |
| `inventory-checker` | 1.1.2 | Count stock, submit inventory data |

### How a Module Is Structured

```
modules/quality-inspector/
├── src/
│   ├── index.js        ← React entry: ReactDOM.createRoot().render(<App />)
│   └── App.jsx         ← Main UI component
├── dist/
│   ├── bundle.js       ← Webpack output (this is what gets uploaded to CDN)
│   └── index.html      ← HTML with <div id="root">
└── package.json        ← React, Webpack, Babel config
```

### The Offline-First System (offline-core)

**Folder:** `modules/shared/offline-core/`

This is the most critical piece of the React side. Three components work together:

#### 1. Queue Manager (`queue-manager.js`)

Stores user actions in IndexedDB (browser database that persists even when the app is killed).

When a user submits a report while offline:
```
User taps "Submit Report"
  ↓
queueManager.enqueue({
  id: "uuid",
  type: "submit_report",
  payload: { itemCode, notes, barcode },
  filePath: "/data/user/photos/1234.jpg"   ← photo saved on disk
})
  ↓
Stored in IndexedDB with status = "pending"
  ↓
UI shows "1 pending"  ← badge on screen
```

Retry logic: each action can fail up to 3 times. After 3 failures it's marked `failed`. Failed items show as red in the UI badge.

#### 2. Sync Manager (`sync-manager.js`)

When internet becomes available, syncs all pending items to the backend.

```
'foundry:online' event fires (Flutter detects connectivity)
  ↓
syncManager.sync()
  ↓
1. Get all pending actions from queue (up to 50 at once)
2. Mark them "syncing" 
3. For each action with a filePath:
     bridge.readFile(filePath) → get base64 of the photo
4. Build request body:
   {
     actions: [
       { type: "submit_report", payload: {...}, local_id: "uuid", photo: "base64..." },
       ...
     ]
   }
5. POST to /api/sync with JWT
6. Backend returns per-item results
7. Mark each as "synced" (remove from queue) or "failed" (increment retryCount)
```

**Crash recovery:** On app restart, `resetSyncing()` is called — any items stuck in "syncing" state (app was killed mid-sync) are reset to "pending" so they retry.

#### 3. Ref Data Manager (`ref-data-manager.js`)

TTL-based cache for reference data (like the product list). Prevents hitting the API every time the app opens.

```
App opens → check IndexedDB cache for "products"
  ↓ cache hit + not expired (< 5 min old)?
Use cached products list → show dropdown immediately
  ↓ in background:
Fetch fresh products from /api/products → update cache
```

**Why this matters:** In the field, products list doesn't change often. Loading it from cache instantly makes the app feel fast even on slow connections.

#### Initialization Flow

Every module calls `initOfflineSystem('quality-inspector')` on startup:

```javascript
const { queueManager, syncManager, refDataManager } = 
  await initOfflineSystem('quality-inspector');
```

This:
1. Sets up all three managers
2. Does crash recovery (`resetSyncing`)
3. Registers listener for `foundry:online` → triggers sync
4. Does a startup sync if there are pending items and internet is available

---

## Layer 3: Backend API (Vercel Serverless)

**Folder:** `backend/`

The backend is a collection of Node.js serverless functions deployed on Vercel. No server to manage — Vercel runs each function on-demand and scales automatically.

### Deployment Model

```
backend/api/
├── auth/
│   ├── login.js       → POST /api/auth/login
│   └── profile.js     → GET  /api/auth/profile
├── modules/
│   └── index.js       → GET  /api/modules
├── products/
│   ├── index.js       → GET  /api/products
│   ├── update.js      → PATCH /api/products/update
│   └── [barcode].js   → GET  /api/products/{barcode}
├── sync/
│   └── index.js       → POST /api/sync
└── reports/
    └── index.js       → POST /api/reports
```

Every file in `api/` becomes an HTTP endpoint automatically — that's how Vercel works. No Express router, no server setup.

### Authentication Middleware

**File:** `backend/middleware/auth.js`

Every sensitive endpoint runs this before doing anything:
```
Request arrives with header: Authorization: Bearer eyJ...
  ↓
middleware/auth.js: verify JWT with JWT_SECRET
  ↓
Valid? → attach user payload to req.user → proceed
Invalid? → return 401 Unauthorized
```

### Key Endpoints Explained

#### POST `/api/auth/login`
- Receives: Firebase ID Token from Flutter
- Verifies it with Firebase Admin SDK (calls Firebase servers)
- Upserts user record in Supabase `users` table
- Returns: custom JWT (7-day expiry) + user object
- **Purpose:** Bridge between Firebase identity and app's own auth system

#### GET `/api/modules`
- Requires: JWT auth
- Queries: Which modules is this user allowed to use? (`user_module_permissions` table)
- Joins with: `module_versions` to get latest CDN URL, version, checksum
- Returns: Full module list with download URLs
- **Purpose:** Per-user module access control

#### POST `/api/sync` — The Core Endpoint
- Requires: JWT auth
- Receives: `{ actions: [ {type, payload, local_id, photo}, ... ] }` (up to 50 actions)
- Processes each action by type:

  | Action Type | What It Does |
  |---|---|
  | `submit_report` | Upload base64 photo to Supabase Storage → insert report into `reports` table |
  | `stock_count` | Insert inventory count record into `reports` table |
  | `update_product_description` | Update `products` table with new description |

- Logs every action to `sync_logs` table (success or failure)
- Returns: per-item `{local_id, success, error}` for the client to update its queue

#### GET `/api/products`
- Returns all products (id, barcode, name, description) — used to populate the product dropdown in modules

#### PATCH `/api/products/update`
- Updates product description
- Used when a field worker edits a product description in the quality inspector

---

## Layer 4: Supabase

Supabase provides two things: **PostgreSQL database** and **file storage (CDN)**.

### Database Tables

```
users
  id (uuid PK)
  firebase_uid (unique)      ← links to Firebase account
  email
  display_name
  created_at

modules
  id (uuid PK)
  slug (unique)              ← e.g. "quality-inspector"
  name
  is_active

module_versions
  id (uuid PK)
  module_id → modules.id
  version                    ← e.g. "1.2.1"
  cdn_url                    ← Supabase Storage public URL
  index_url                  ← URL for index.html
  checksum (SHA-256)         ← for integrity verification
  size_kb
  is_active

user_module_permissions
  user_id → users.id
  module_id → modules.id
  permissions (jsonb)        ← what the user can do in the module

products
  id (uuid PK)
  barcode (unique)
  name
  description                ← editable by field workers
  category
  unit

reports
  id (uuid PK)
  user_id → users.id
  module_slug                ← which module generated this
  payload (jsonb)            ← flexible data (form fields vary by module)
  photo_url                  ← Supabase Storage URL (if photo attached)
  status                     ← 'submitted'
  created_at

sync_logs
  id (uuid PK)
  user_id → users.id
  module_slug
  action_type                ← 'submit_report' | 'stock_count' | 'update_product_description'
  local_id                   ← matches queue entry ID for tracing
  status                     ← 'success' | 'failed'
  error_message
  created_at
```

### Storage Buckets

| Bucket | Contents | Access |
|---|---|---|
| `module-bundles` | React module JS bundles (bundle.js, index.html) | Public (CDN) |
| `user-photos` | Photos captured by field workers during reports | Public URL per file |

**Module CDN URLs look like:**
```
https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.2.1/bundle.js
```

**Photo URLs look like:**
```
https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/user-photos/{userId}/{timestamp}.jpg
```

---

## How Modules Get Published (CDN Deployment Flow)

When you build a new version of a module and need to push it to users:

```
Step 1: Build the module
  cd modules/quality-inspector && npm run build
  → Webpack compiles → dist/bundle.js, dist/index.html

Step 2: Upload to Supabase Storage (CDN)
  node phase-5-module-cdn/upload-to-supabase.js
  → Uploads to: quality-inspector/1.2.1/bundle.js
                quality-inspector/1.2.1/index.html
  → Files are now publicly accessible via CDN URL

Step 3: Register new version in database (SQL)
  INSERT INTO module_versions (module_id, version, cdn_url, checksum, ...)
  UPDATE module_versions SET is_active = false WHERE version = '1.2.0'
  → Database now points to 1.2.1

Step 4: Flutter auto-detects on next login
  GET /api/modules → returns version "1.2.1"
  App sees cached version is "1.2.0" → mismatch
  Downloads bundle.js from CDN → caches to device
  Module is updated
```

**Important:** You MUST bump the version string AND register a new DB row. Just overwriting the CDN file with the same version string will NOT trigger a re-download because Flutter compares version strings, not file hashes.

---

## Complete Data Flow: Submit a Quality Report

End-to-end trace of what happens when a field worker scans a product and submits a report:

```
[FLUTTER]
1. User opens app → JWT validated → ShellScreen loads
2. ShellScreen: GET /api/modules → gets quality-inspector v1.2.1
3. LocalHttpServer starts on localhost:8080
4. WebView loads: http://localhost:8080/quality-inspector/
5. Flutter injects window.__foundry_auth__ = { token, apiBaseUrl }

[REACT - quality-inspector App.jsx]
6. initOfflineSystem('quality-inspector') runs
7. Loads cached products from IndexedDB (RefDataManager)
8. Background: GET /api/products → refreshes product cache
9. User sees product dropdown populated

10. User taps "Scan Barcode"
    → bridge._call('scanBarcode') 
    → Flutter opens BarcodeScannerScreen (mobile_scanner)
    → User scans barcode → returns { value: "12345", format: "EAN_13" }
    → React: auto-selects matching product from dropdown

11. User taps "Capture Photo"
    → bridge._call('capturePhoto')
    → Flutter opens camera (ImagePicker)
    → Flutter saves photo to: /data/user/0/com.foundry.app/files/photos/1712345678.jpg
    → Returns { dataUrl: "data:image/jpeg;base64,/9j/...", filePath: "/data/.../1712345678.jpg" }
    → React: shows photo preview

12. User types inspection notes, taps "Submit Report"
    → queueManager.enqueue({
         id: "uuid-abc",
         type: "submit_report",
         payload: { itemCode: "12345", notes: "Surface scratch", barcode: {...} },
         filePath: "/data/.../1712345678.jpg"
       })
    → IndexedDB: status = "pending"
    → UI badge shows "1 pending"

[SYNC - when online]
13. syncManager.sync() triggers (on foundry:online event OR immediately if online)
14. Gets pending actions from IndexedDB
15. bridge.readFile("/data/.../1712345678.jpg") → returns base64 string
16. POST /api/sync {
      actions: [{
        type: "submit_report",
        payload: { itemCode: "12345", notes: "Surface scratch", barcode: {...} },
        local_id: "uuid-abc",
        photo: "data:image/jpeg;base64,/9j/..."
      }]
    }

[BACKEND - /api/sync]
17. Auth middleware: verify JWT → attach user
18. For action type "submit_report":
    a. Upload photo base64 to Supabase Storage bucket "user-photos"
       → Returns public URL: https://...supabase.co/storage/v1/object/public/user-photos/...
    b. INSERT INTO reports (user_id, module_slug, payload, photo_url, status='submitted')
    c. INSERT INTO sync_logs (action_type='submit_report', local_id='uuid-abc', status='success')
19. Return: { results: [{ local_id: "uuid-abc", success: true }] }

[REACT - back in App.jsx]
20. syncManager receives success → queueManager.remove("uuid-abc")
21. Badge updates: "All synced" (green)

[SUPABASE]
22. reports table: new row with JSON payload + photo URL
23. sync_logs table: audit trail entry
24. user-photos bucket: photo accessible via CDN
```

---

## Environment Variables & Secrets

### Backend (Vercel Environment Variables)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Full DB access key (never exposed to client) |
| `JWT_SECRET` | Signs/verifies app JWTs |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Admin SDK credentials (JSON string) |

### Flutter App

| Variable | Purpose |
|---|---|
| `API_BASE_URL` | Backend URL (e.g. `https://foundry-backend.vercel.app`) |

Loaded via `flutter_dotenv` from `.env` file bundled in assets.

---

## Technology Choices Explained

| Technology | Why It Was Chosen |
|---|---|
| **Flutter** | Write once, run on Android/iOS. Native camera + barcode scanner. Can run a local HTTP server. |
| **React (WebView modules)** | Modules can be updated over-the-air (CDN) without releasing a new APK. Team can write feature UIs in familiar web tech. |
| **Vercel Serverless** | Zero-config deployment. Auto-scales. Pay per invocation. No server maintenance. |
| **Supabase** | Managed PostgreSQL + built-in file storage + CDN. Row-level security. Easy dashboard. |
| **Firebase Auth** | Handles email verification, password reset, token management. Battle-tested. |
| **IndexedDB (offline-core)** | Browser-native persistent storage. Works in WebView. Survives app kills. |
| **Local HTTP Server** | WebViews can't load `file://` URLs securely on Android. Serving via `localhost` bypasses this restriction cleanly. |

---

## What Vercel Is Doing (Specifically)

Vercel hosts the backend. Here's exactly what it provides:

1. **Serverless Functions:** Each file in `backend/api/` becomes a separate Lambda-style function. When a request hits `/api/sync`, Vercel boots a Node.js container, runs `sync/index.js`, returns the response, and shuts down. No idle cost.

2. **CORS Headers:** `vercel.json` adds `Access-Control-Allow-Origin: *` to all `/api/*` responses. This is needed because the React modules run on `localhost:8080` (a different origin) and need to call the API.

3. **Environment Variables:** Supabase keys, JWT secret, Firebase credentials are stored in Vercel's dashboard (not in code) and injected as `process.env.*` variables at runtime.

4. **Auto-Deploy:** Push to the connected Git branch → Vercel automatically builds and deploys within ~30 seconds.

5. **Global CDN:** Vercel serves the functions from edge locations worldwide — low latency from anywhere.

---

## What Supabase Is Doing (Specifically)

Supabase is the data layer. Here's exactly what it provides:

1. **PostgreSQL Database:** All structured data — users, modules, products, reports, sync logs. The backend connects via `@supabase/supabase-js` using the service role key (full access).

2. **Storage Buckets:**
   - `module-bundles` (public): React JS bundles served over CDN. Flutter downloads module updates from here.
   - `user-photos` (public per-file): Photos taken by field workers, uploaded during sync. Accessible via public URL stored in reports.

3. **Row-Level Security (RLS):** Policies on tables ensure users can only read/write their own data. Even if someone gets a user's JWT, they can't read another user's reports.

4. **Realtime (not used here):** Supabase supports live subscriptions — not used in this version but available.

---

## Security Model

```
Flutter
  ↓ Firebase ID Token (short-lived, from Firebase)
Backend /api/auth/login
  ↓ Verifies with Firebase Admin SDK
  ↓ Issues own JWT (7-day, signed with JWT_SECRET)
  ↓ Stored in FlutterSecureStorage (encrypted on device)

All API calls
  ↓ Authorization: Bearer {JWT}
  ↓ auth.js middleware verifies signature
  ↓ Attaches user to request

Supabase
  ↓ Backend uses SERVICE_ROLE_KEY (server-side only, never in app)
  ↓ Row-level security policies in place
  ↓ Module CDN is public (bundles are not sensitive)
  ↓ Photo URLs are public but unguessable (UUID paths)
```

---

## Project Build & Phase History

The project was built phase by phase. Each phase folder contains the planning, validation, and build artifacts from that phase:

| Phase | What Was Built |
|---|---|
| Phase 1 | Flutter shell — WebView, local HTTP server, bridge skeleton |
| Phase 2 | Auth — Firebase sign-in, JWT exchange, secure storage |
| Phase 3 | Module registry — DB schema, per-user permissions, module list API |
| Phase 4 | Native capabilities — Camera, barcode scanner, network state bridge methods |
| Phase 5 | Module CDN — Webpack builds, Supabase Storage upload, CDN URLs |
| Phase 6 | Flutter module loading — Download from CDN, version check, cache to device |
| Phase 7 | Backend API — Products endpoint, reports endpoint, photos, sync endpoint |
| Phase 8 | Offline sync — IndexedDB queue, sync manager, retry logic, online detection |
| Phase 8.5 | Reference data — Products dropdown, description editing, ref data cache |
| Phase 9 | Android release — Signing config, app icon, signed AAB for Play Store |

---

## Summary: How Everything Connects

```
Field Worker (Android Phone)
        │
        ▼
┌───────────────────┐
│  Flutter App      │
│  (Native Shell)   │
│                   │
│  Firebase Auth ───┼──→ Firebase (Google) — verifies identity
│  SecureStorage    │
│  LocalHttpServer  │
│  ShellBridge      │
│  WebView          │
│       │           │
└───────┼───────────┘
        │ loads from localhost:8080
        ▼
┌───────────────────┐
│  React Module     │      ┌──────────────────────────────┐
│  (quality-        │      │  Supabase Storage (CDN)      │
│   inspector)      │      │  module-bundles/             │
│                   │      │  quality-inspector/1.2.1/    │
│  offline-core:    │      │  bundle.js  ◄── Flutter      │
│  QueueManager     │      │             downloads once   │
│  SyncManager      │      └──────────────────────────────┘
│  RefDataManager   │
│       │           │
└───────┼───────────┘
        │ HTTPS (when online)
        ▼
┌───────────────────┐
│  Vercel           │
│  (Serverless API) │
│                   │
│  /api/auth/login  │
│  /api/modules     │
│  /api/products    │
│  /api/sync ───────┼──→ Supabase Storage
│  /api/reports     │    user-photos/ (uploaded photos)
└───────┬───────────┘
        │ SQL queries
        ▼
┌───────────────────┐
│  Supabase         │
│  (PostgreSQL)     │
│                   │
│  users            │
│  modules          │
│  module_versions  │
│  products         │
│  reports          │
│  sync_logs        │
└───────────────────┘
```

Every line of this diagram corresponds to real code in this repository. No hypotheticals.
