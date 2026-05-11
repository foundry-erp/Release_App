# Foundry App — Build Plan (Zero to Production)

**Date:** 2026-04-01
**Developer:** Claude Code
**Starting point:** Nothing built. PoC exists in `pocs/output/` for reference only.
**Architecture reference:** `PRODUCTION_PLAYSTORE_ARCHITECTURE.md`
**Architecture validated by:** `next_plan.md` (Local HTTP Server approach confirmed)

---

## How This Plan Works

Phases come in pairs. Each pair produces **one testable milestone** — something you can run on a device and verify before moving to the next pair. Do not start the next pair until the current milestone passes.

```
Phase 1 + 2  →  Milestone A  →  Flutter app runs, WebView loads React module, bridge works
Phase 3 + 4  →  Milestone B  →  Login works, JWT stored, user authenticated
Phase 5 + 6  →  Milestone C  →  Modules download from CDN, load from cache
Phase 7 + 8  →  Milestone D  →  Submit offline, sync, appears in Supabase
Phase 9 + 10 →  Milestone E  →  Live on Play Store + App Store
```

---

## Stack (Decided — No Changes)

```
Flutter Shell       →  Flutter 3.x, webview_flutter, shelf (local HTTP server)
React Modules       →  React 18, Webpack 5, Babel
Auth                →  Firebase Authentication
Database            →  Supabase (PostgreSQL)
API                 →  Vercel Serverless Functions (Node.js)
Module Hosting      →  Supabase Storage (public bucket, built-in CDN)
User File Storage   →  Supabase Storage (private bucket, user photos)
Crash Monitoring    →  Sentry (Flutter + JS)
Secure Storage      →  flutter_secure_storage (Keystore/Keychain)
```

---

## Folder Structure (Final App)

```
foundry-app/
│
├── flutter/                        ← Flutter shell app
│   ├── lib/
│   │   ├── main.dart
│   │   ├── app.dart
│   │   ├── screens/
│   │   │   ├── login_screen.dart
│   │   │   ├── loading_screen.dart
│   │   │   └── shell_screen.dart
│   │   ├── services/
│   │   │   ├── auth_service.dart
│   │   │   ├── module_downloader.dart
│   │   │   ├── local_http_server.dart
│   │   │   └── storage_service.dart
│   │   ├── bridge/
│   │   │   └── shell_bridge.dart
│   │   └── webview/
│   │       └── module_webview.dart
│   ├── assets/
│   │   └── .env.production
│   ├── android/
│   ├── ios/
│   └── pubspec.yaml
│
├── backend/                        ← Vercel API
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.js
│   │   │   ├── register.js
│   │   │   └── refresh.js
│   │   ├── modules/
│   │   │   └── index.js
│   │   ├── reports/
│   │   │   └── index.js
│   │   └── sync/
│   │       └── index.js
│   ├── middleware/
│   │   └── auth.js
│   ├── lib/
│   │   ├── supabase.js
│   │   └── firebase-admin.js
│   ├── package.json
│   └── vercel.json
│
└── modules/                        ← React modules
    ├── shared/                     ← Shared JS (loaded by all modules)
    │   ├── bridge_helper.js
    │   ├── action_queue.js
    │   ├── sync_manager.js
    │   └── reference_data_manager.js
    ├── quality-inspector/
    │   ├── src/
    │   │   ├── index.js
    │   │   └── App.jsx
    │   ├── public/
    │   │   └── index.html
    │   ├── webpack.config.js
    │   └── package.json
    └── inventory-checker/
        ├── src/
        ├── public/
        ├── webpack.config.js
        └── package.json
```

---

## Phase 1 — Flutter Project + Local HTTP Server

**Goal:** Flutter project exists, compiles, runs on device. Local HTTP server starts and serves static files. WebView loads a static HTML page from localhost.

### What Claude Code builds:

```
1. Create Flutter project:
   flutter create --org com.foundry --project-name foundry_shell flutter/

2. Add dependencies to pubspec.yaml:
   dependencies:
     webview_flutter: ^4.7.0
     shelf: ^1.4.1
     shelf_static: ^1.1.2
     shelf_router: ^1.1.4
     path_provider: ^2.1.3
     path: ^1.9.0
     http: ^1.2.1
     flutter_secure_storage: ^9.2.2
     connectivity_plus: ^6.0.3
     flutter_dotenv: ^5.1.0
     firebase_core: ^3.6.0
     firebase_auth: ^5.3.1
     crypto: ^3.0.3
     sentry_flutter: ^8.8.0

3. Create lib/services/local_http_server.dart:
   - Class LocalHttpServer
   - start(String moduleName, String modulePath, int port)
   - stop()
   - Uses shelf_static to serve files from path
   - Returns URL: http://localhost:{port}/

4. Create a test assets/test_module/ folder with:
   - index.html (simple "Hello from WebView" page)
   - No React yet, just static HTML

5. Create lib/webview/module_webview.dart:
   - StatefulWidget
   - Takes url parameter
   - Creates WebViewController
   - Loads the URL
   - Basic navigation bar

6. Create lib/main.dart:
   - Start local HTTP server on port 8080 pointing to test_module
   - Navigate to ModuleWebView with http://localhost:8080/
```

### Test to pass before Phase 2:
```
flutter run -d {device}
→ App opens
→ WebView visible
→ Shows "Hello from WebView" text
→ No crashes
→ flutter run --release also works (not just debug)
```

---

## Phase 2 — Bridge + First Real React Module

**Goal:** JavaScript bridge implemented. First React module (quality-inspector) built with webpack, served via local HTTP server, bridge calls work.

### What Claude Code builds:

```
1. Create modules/quality-inspector/:
   - package.json with React 18, webpack, babel
   - webpack.config.js (output: dist/bundle.js)
   - src/App.jsx with:
       - A form with one text input
       - A "Capture Photo" button
       - Display area for bridge responses
   - public/index.html that loads bundle.js

2. Build config (webpack.config.js):
   entry: './src/index.js'
   output: { path: dist/, filename: 'bundle.js' }
   mode: 'development' for now
   HtmlWebpackPlugin to embed into index.html

3. Run: cd modules/quality-inspector && npm install && npm run build
   Verify: dist/index.html and dist/bundle.js exist

4. Create lib/bridge/shell_bridge.dart:
   - addJavaScriptChannel 'FoundryBridge' to WebViewController
   - onMessageReceived: parse JSON { method, args, callbackId }
   - Switch on method:
       'capturePhoto' → [stub] return { success: true, path: 'test.jpg' }
       'ping'         → return { pong: true }
   - Send response back via runJavaScript:
       window.__foundryCallback_{callbackId}(responseJson)

5. Create modules/shared/bridge_helper.js:
   - window.FoundryBridge object
   - callBridge(method, args) → returns Promise
   - Generates callbackId
   - Registers window.__foundryCallback_{id}
   - Calls window.FoundryBridge.postMessage(JSON.stringify({method, args, callbackId}))
   - Resolves promise when callback fires

6. Update quality-inspector App.jsx:
   - Import bridge_helper.js (relative path from shared/)
   - On "Capture Photo" click:
       const result = await FoundryBridge.capturePhoto({})
       Show result in UI

7. Copy dist/ output to flutter/assets/modules/quality-inspector/
   Update local HTTP server to serve from there

8. Update pubspec.yaml assets to include modules folder
```

### Milestone A — Test to pass:
```
flutter run -d {device}
→ App opens
→ WebView loads quality-inspector React UI
→ Form and button visible
→ Click "Capture Photo"
→ Bridge receives call
→ UI shows response: { success: true, path: 'test.jpg' }
→ No JS errors in console
→ No Flutter crashes

Verify in Flutter logs:
→ LocalHttpServer: started on port 8080
→ Bridge: received capturePhoto call
→ Bridge: sent response
```

---

**← STOP HERE. Milestone A must pass on a real device before continuing. →**

---

## Phase 3 — Backend: Supabase Schema + Firebase Auth + Vercel Setup

**Goal:** Supabase database created with full schema. Firebase project ready. Vercel project deployed. Login API endpoint works and returns a JWT.

### What Claude Code builds:

```
1. Create backend/ folder structure (as per folder structure above)

2. Create backend/package.json:
   dependencies:
     firebase-admin
     @supabase/supabase-js
     jsonwebtoken
     bcryptjs

3. Create backend/vercel.json:
   {
     "functions": { "api/**/*.js": { "runtime": "nodejs20.x" } },
     "rewrites": [{ "source": "/api/(.*)", "destination": "/api/$1" }]
   }

4. Supabase schema (SQL to run in Supabase SQL Editor):
   - organizations table
   - users table (firebase_uid, email, name, role, organization_id)
   - modules table (id, name, description, category)
   - module_versions table (module_id, version, cdn_url, checksum, size_kb, is_active)
   - user_module_permissions table (user_id, module_id, organization_id)
   - reports table (user_id, module_id, payload JSONB, photo_url, status)
   - sync_logs table (user_id, module_id, action_type, status, error_message)
   - Indexes on: users.firebase_uid, reports.user_id, permissions.user_id

5. Create backend/lib/supabase.js:
   - Init Supabase client with service_role key (from env)

6. Create backend/lib/firebase-admin.js:
   - Init Firebase Admin SDK (from env FIREBASE_SERVICE_ACCOUNT)

7. Create backend/middleware/auth.js:
   - Verify JWT from Authorization header
   - Attach user to request

8. Create backend/api/auth/login.js:
   POST /api/auth/login
   Body: { firebase_id_token }
   - Verify firebase_id_token via firebase-admin
   - Look up user in Supabase by firebase_uid
   - If not found: create user record
   - Sign and return JWT { token, user }

9. Create backend/api/auth/profile.js:
   GET /api/auth/profile
   - Verify JWT (middleware)
   - Return user from Supabase

10. Environment variables needed (set in Vercel dashboard):
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    FIREBASE_SERVICE_ACCOUNT (JSON stringified)
    JWT_SECRET
```

### Test to pass before Phase 4:
```
Deploy to Vercel: vercel --prod

Test with curl or Postman:
1. Get Firebase ID token from Firebase Auth Emulator or real Firebase project
2. POST https://your-app.vercel.app/api/auth/login
   Body: { "firebase_id_token": "..." }
   Expected: 200 { token: "eyJ...", user: { id, email, role } }

3. GET https://your-app.vercel.app/api/auth/profile
   Header: Authorization: Bearer {token}
   Expected: 200 { id, email, name, role }

4. GET /api/auth/profile with no token
   Expected: 401

→ All 3 pass before Phase 4
```

---

## Phase 4 — Flutter: Login Screen + Auth Flow + Token Injection

**Goal:** Flutter app shows login screen. User logs in with Firebase. JWT stored securely. Auth token injected into WebView. On restart: login skipped if token valid.

### What Claude Code builds:

```
1. Add Firebase config to Flutter:
   - Download google-services.json → flutter/android/app/
   - Download GoogleService-Info.plist → flutter/ios/Runner/
   - Run: flutterfire configure (or manually add)
   - firebase_options.dart generated

2. Create lib/services/auth_service.dart:
   - signInWithEmail(email, password) → calls Firebase signInWithEmailAndPassword
   - getIdToken() → returns Firebase ID token
   - callBackendLogin(idToken) → POST /api/auth/login → stores JWT
   - loadStoredToken() → reads from FlutterSecureStorage
   - isLoggedIn() → checks token exists + not expired
   - logout() → clear secure storage + Firebase signOut

3. Create lib/screens/login_screen.dart:
   - Email TextField
   - Password TextField (obscureText: true)
   - Login button with loading state
   - Error message display
   - On success → navigate to LoadingScreen

4. Create lib/screens/loading_screen.dart:
   - Shows "Setting up your modules..." with progress indicator
   - Calls auth_service.loadStoredToken()
   - Then fetches module registry (stub for now: return hardcoded test module)
   - Then navigates to ShellScreen

5. Create lib/screens/shell_screen.dart:
   - Shows ModuleWebView
   - Passes URL: http://localhost:8080/

6. Update lib/webview/module_webview.dart:
   - Before loading URL, inject auth:
     await controller.runJavaScript('''
       window.__foundry_auth__ = ${jsonEncode(authData)};
       window.__foundry_config__ = { apiBaseUrl: "$apiBaseUrl" };
     ''');
   - Then load URL

7. Update lib/main.dart:
   - Check isLoggedIn() on startup
   - If yes → LoadingScreen
   - If no → LoginScreen

8. Create flutter/assets/.env.production:
   API_BASE_URL=https://your-app.vercel.app
   CDN_BASE_URL=https://your-app.vercel.app
```

### Milestone B — Test to pass:
```
flutter run -d {device}

Scenario 1: First launch
→ Login screen appears
→ Enter email + password → tap Login
→ Firebase authenticates
→ Backend /api/auth/login called
→ JWT stored in secure storage
→ Loading screen appears
→ Quality-inspector module loads in WebView
→ window.__foundry_auth__.token accessible in browser console

Scenario 2: Restart app
→ Login screen NOT shown (token found)
→ Goes straight to loading screen
→ Module loads

Scenario 3: Tap logout (add button to shell for testing)
→ Token cleared
→ Login screen appears

→ All 3 scenarios pass on real device
```

---

**← STOP HERE. Milestone B must pass on a real device before continuing. →**

---

## Phase 5 — Backend: Module Registry API + CDN Setup

**Goal:** Module registry API returns modules with cdn_url and checksum. Modules hosted on Vercel CDN. Checksums verified.

### What Claude Code builds:

```
1. Create backend/api/modules/index.js:
   GET /api/modules
   Headers: Authorization: Bearer {jwt}
   - Verify JWT
   - Query user_module_permissions JOIN module_versions
     WHERE user_id = req.user.id AND is_active = true
   - Return array:
     [{ id, name, version, cdn_url, checksum, size_kb, permissions }]

2. Build PRODUCTION React modules:
   cd modules/quality-inspector
   Update webpack.config.js: mode: 'production', devtool: false
   npm run build
   → dist/index.html, dist/bundle.js

   cd modules/inventory-checker
   npm run build (create this module too, same structure)

3. Upload to Supabase Storage:
   In Supabase dashboard → Storage:

   Create bucket: module-bundles
     - Public: YES (modules are not sensitive, must be downloadable)
     - CORS: Allow all origins (needed for WebView fetch)

   Upload structure:
     module-bundles/
       quality-inspector/
         1.0.0/
           index.html
           bundle.js
       inventory-checker/
         1.0.0/
           index.html
           bundle.js
       shared/
         bridge_helper.js
         action_queue.js
         sync_manager.js

   Public URL pattern:
   https://{project-ref}.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.0.0/bundle.js

   Upload via Supabase dashboard OR via script using @supabase/supabase-js:
     await supabase.storage.from('module-bundles')
       .upload('quality-inspector/1.0.0/bundle.js', fileBuffer, {
         contentType: 'application/javascript',
         upsert: true
       });

4. Generate checksums:
   # For each bundle.js, generate SHA-256
   # Use Node.js script:
   const crypto = require('crypto');
   const hash = crypto.createHash('sha256');
   hash.update(fs.readFileSync('dist/bundle.js'));
   console.log('sha256:' + hash.digest('hex'));

5. Seed database:
   Run SQL in Supabase:
   - INSERT into modules (quality-inspector, inventory-checker)
   - INSERT into module_versions:
       cdn_url = 'https://{ref}.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.0.0/'
       checksum = 'sha256:{hash}'
   - INSERT into organizations (test org)
   - INSERT into users (test user, linked to firebase_uid)
   - INSERT into user_module_permissions (test user gets both modules)

   Note: CDN caching is automatic — Supabase Storage serves files
   via its CDN layer. No extra configuration needed.
```

### Test to pass before Phase 6:
```
1. Hit GET /api/modules with valid JWT
   → Returns array with cdn_url and checksum for test user's modules

2. Open Supabase Storage URL directly in browser:
   https://{ref}.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.0.0/index.html
   → Module UI loads

3. Verify checksum manually:
   Download bundle.js, calculate sha256, compare with DB value → MATCH

4. Test CORS (critical for WebView fetch):
   From browser console:
   fetch('https://{ref}.supabase.co/storage/v1/object/public/module-bundles/...')
   → No CORS error
   (If CORS error: fix bucket CORS settings in Supabase Storage dashboard)
```

---

## Phase 6 — Flutter: Module Downloader + Cache + Version Check

**Goal:** On login, Flutter fetches module registry, downloads missing/outdated modules to cache, serves them via local HTTP server. Progress shown to user.

### What Claude Code builds:

```
1. Create lib/services/module_downloader.dart:

   class ModuleDownloader {

     Future<List<ModuleInfo>> fetchRegistry() async {
       // GET /api/modules with JWT
       // Parse response into List<ModuleInfo>
     }

     Future<bool> isCacheValid(String moduleId, String version) async {
       final dir = await getTemporaryDirectory();
       final versionFile = File('${dir.path}/modules/$moduleId/version.txt');
       if (!versionFile.existsSync()) return false;
       return versionFile.readAsStringSync().trim() == version;
     }

     Future<void> downloadModule(
       ModuleInfo module,
       void Function(double progress) onProgress
     ) async {
       // Download index.html and bundle.js from cdn_url
       // Stream download to show progress
       // Verify SHA-256 checksum of bundle.js
       // If checksum fails: delete files, throw error
       // Save to: {cacheDir}/modules/{moduleId}/
       // Write version.txt with version string
     }

     bool verifyChecksum(String filePath, String expected) {
       final bytes = File(filePath).readAsBytesSync();
       final hash = crypto.sha256.convert(bytes);
       return 'sha256:${hash.toString()}' == expected;
     }

     Future<String> getModuleLocalPath(String moduleId) async {
       final dir = await getTemporaryDirectory();
       return '${dir.path}/modules/$moduleId';
     }
   }

2. Create model class ModuleInfo:
   { id, name, version, cdnUrl, checksum, sizeKb, localPort }

3. Update lib/screens/loading_screen.dart:
   - Call fetchRegistry()
   - For each module:
       if !isCacheValid → downloadModule (show progress)
       else → use cached
   - Start local HTTP server for each module:
       module 1 → port 8080 → /cache/modules/quality-inspector/
       module 2 → port 8081 → /cache/modules/inventory-checker/
   - Navigate to ShellScreen passing module list

4. Update ShellScreen to show multiple WebViews:
   - Tab bar or bottom navigation per module
   - Each WebView points to its localhost port
   - Each WebView gets auth injected before loading

5. Handle error cases:
   - Download fails → retry once → if still fails → use stale cache
   - No cache + download fails → show error screen
   - Checksum mismatch → delete bad file → retry
```

### Milestone C — Test to pass:
```
Fresh install (no cache):
→ Login
→ Loading screen shows "Downloading Quality Inspector... 45%"
→ Progress updates smoothly
→ Module appears in tab
→ Tap tab → module UI loads
→ Checksum verification passes (no silent failures)

Cache hit (relaunch):
→ Login skipped (token valid)
→ Loading screen shows "Loading modules..." (no download, instant)
→ Both modules load

Version update test:
→ Change version in Supabase DB + upload new bundle.js to CDN
→ Restart app
→ Loading screen detects version mismatch
→ Downloads new version
→ Serves new version

→ All 3 scenarios pass on real device
```

---

**← STOP HERE. Milestone C must pass on a real device before continuing. →**

---

## Phase 7 — Backend: Reports API + Sync API + File Upload

**Goal:** Backend can receive reports, upload photos to Supabase Storage, process sync batches.

### What Claude Code builds:

```
1. Create Supabase Storage buckets:
   - user-photos (private, RLS: users access own folder only)
   - RLS policy:
     CREATE POLICY "Users access own photos" ON storage.objects
     FOR ALL USING (bucket_id = 'user-photos'
       AND (storage.foldername(name))[1] = auth.uid()::text);

2. Create backend/api/reports/index.js:
   POST /api/reports
   Body: { module_id, payload, photo_base64? }
   - Verify JWT
   - If photo_base64: upload to Supabase Storage
     bucket: user-photos, path: {user_id}/{timestamp}.jpg
   - INSERT into reports table
   - Return { report_id, photo_url, created_at }

3. Create backend/api/sync/index.js:
   POST /api/sync
   Body: { actions: [{ type, payload, local_id }] }
   - Verify JWT
   - For each action, route to handler:
       'submit_report' → call reports handler
       'stock_count'   → insert into stock table (create if needed)
   - Return { results: [{ local_id, success, server_id, error? }] }

4. Create backend/api/products/[barcode].js:
   GET /api/products/:barcode
   - Verify JWT
   - Look up product (seed some test products in DB)
   - Return product or 404
```

### Test to pass before Phase 8:
```
1. POST /api/reports with photo_base64
   → 200 { report_id, photo_url }
   → Photo visible in Supabase Storage bucket

2. POST /api/sync with 3 actions
   → All 3 return success
   → Records exist in Supabase DB

3. GET /api/products/1234567890
   → 200 { name, description } (after seeding test product)

→ All pass via Postman before Phase 8
```

---

## Phase 8 — React Modules: Offline Queue + Sync + Network Detection

**Goal:** React modules queue actions when offline. Detect network restore. Auto-sync to production backend. No data loss.

### What Claude Code builds:

```
1. Build modules/shared/action_queue.js:
   class ActionQueue {
     constructor(moduleId) {
       this.dbName = `foundry_${moduleId}_queue`;
       this.storeName = 'actions';
     }

     async save(type, payload) {
       // Open IndexedDB
       // Store { id: uuid, type, payload, status: 'pending', created_at }
       // Return saved action
     }

     async getPending() {
       // Return all actions where status === 'pending'
     }

     async markSynced(id) {
       // Update status to 'synced'
     }

     async markFailed(id, error) {
       // Update status to 'failed', store error
     }
   }

2. Build modules/shared/sync_manager.js:
   class SyncManager {
     constructor(moduleId, apiBaseUrl, getToken) {
       // getToken = function that returns current auth token
     }

     async syncAll(onProgress) {
       const pending = await this.queue.getPending();
       for (const action of pending) {
         try {
           const response = await fetch(`${this.apiBaseUrl}/api/sync`, {
             method: 'POST',
             headers: {
               'Authorization': `Bearer ${await this.getToken()}`,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({ actions: [action] })
           });
           const result = await response.json();
           if (result.results[0].success) {
             await this.queue.markSynced(action.id);
           } else {
             await this.queue.markFailed(action.id, result.results[0].error);
           }
           onProgress?.(pending.indexOf(action) / pending.length);
         } catch (e) {
           // Network error — stop, retry next time
           break;
         }
       }
     }
   }

3. Network detection in React modules:
   - Listen to window event 'foundry:online' (Flutter broadcasts this)
   - On receive: call syncManager.syncAll()
   - Show "Syncing..." UI state

   In Flutter (shell_bridge.dart):
   - Use connectivity_plus to detect network change
   - On connect: broadcast to all WebViews:
     controller.runJavaScript('window.dispatchEvent(new Event("foundry:online"))');

4. Update quality-inspector App.jsx:
   - Import ActionQueue and SyncManager from shared/
   - On form submit:
       await actionQueue.save('submit_report', formData)
       show "Saved offline" if no internet
       OR trigger sync immediately if online
   - Show pending count badge (X unsynced)
   - On 'foundry:online' event: syncManager.syncAll()

5. Rebuild both modules: npm run build
   Copy dist/ to flutter assets
   Re-run flutter (new assets)
```

### Milestone D — Test to pass:
```
Setup: Real device with WiFi available to turn on/off

Scenario 1: Submit offline
→ Turn off WiFi
→ Open quality-inspector
→ Fill form, tap Submit
→ UI shows "Saved offline (1 pending)"
→ Turn WiFi back on
→ Within 5 seconds: "Syncing 1 item..."
→ "All synced" shown
→ Check Supabase reports table → record exists ✅

Scenario 2: Submit multiple offline
→ WiFi off
→ Submit 3 reports
→ UI shows "3 pending"
→ WiFi on
→ All 3 sync in order
→ All 3 in Supabase ✅

Scenario 3: Kill app while offline, reopen online
→ WiFi off, submit report, force-close app
→ Turn WiFi on, reopen app
→ Sync triggers on app open
→ Report appears in Supabase ✅

→ All 3 scenarios pass before Phase 9
```

---

**← STOP HERE. Milestone D must pass on a real device before continuing. →**

---

## Phase 9 — Android: Play Store Submission

**Goal:** App live on Google Play Store (internal testing track minimum, production release).

### What Claude Code builds / configures:

```
1. Update package name:
   android/app/build.gradle: applicationId "com.foundry.app"
   (or com.{yourcompany}.foundry)

2. Update app name:
   android/app/src/main/AndroidManifest.xml:
   android:label="Foundry"

3. Set version:
   pubspec.yaml: version: 1.0.0+1

4. Generate release signing key:
   keytool -genkey -v -keystore android/app/foundry-release.jks \
     -keyalg RSA -keysize 2048 -validity 10000 \
     -alias foundry

   BACK UP THIS FILE IN 3 PLACES — losing it = cannot update app

5. Configure signing in android/app/build.gradle:
   signingConfigs {
     release {
       storeFile file('foundry-release.jks')
       storePassword System.getenv("STORE_PASSWORD")
       keyAlias 'foundry'
       keyPassword System.getenv("KEY_PASSWORD")
     }
   }
   buildTypes {
     release {
       signingConfig signingConfigs.release
       minifyEnabled true
       shrinkResources true
     }
   }

6. App icon:
   - Source: 1024×1024 PNG
   - Run: flutter pub run flutter_launcher_icons
   - Verify all sizes generated in android/app/src/main/res/

7. Build App Bundle:
   flutter build appbundle --release
   → build/app/outputs/bundle/release/app-release.aab

8. Create in Play Console:
   - App name: Foundry
   - Short description (80 chars)
   - Full description
   - Screenshots (min 2 from real device)
   - Feature graphic 1024×500
   - Privacy policy URL (publish simple page)
   - Data Safety form (email, user ID, photos collected)
   - Content rating questionnaire

9. Upload to Internal Testing track:
   → Share with testers
   → Verify install works from Play Store link
   → Verify all Milestone D scenarios pass on Play Store build

10. Promote to Production (phased rollout 20%)
```

### Test to pass:
```
→ AAB builds without errors
→ Signing key backed up
→ Install via Play Store internal link works
→ Login works on Play Store build
→ Offline sync works on Play Store build
→ No crashes in Play Console within first 24 hours
```

---

## Phase 10 — iOS: App Store Submission

**Goal:** Same app live on Apple App Store.

**Prerequisite:** Mac with Xcode 15+. Apple Developer account active ($99/year).

### What Claude Code builds / configures:

```
1. Add Privacy Manifest (required — Apple rejects without):
   Create ios/Runner/PrivacyInfo.xcprivacy (see architecture doc for template)

2. Add Info.plist permissions:
   <key>NSCameraUsageDescription</key>
   <string>Take photos of products for inspection reports</string>
   <key>NSPhotoLibraryAddUsageDescription</key>
   <string>Save inspection photos to your library</string>

3. Set iOS Deployment Target: 13.0
   ios/Podfile: platform :ios, '13.0'

4. Set Bundle Identifier:
   Xcode → Runner → Signing & Capabilities
   Bundle ID: com.foundry.app

5. CocoaPods:
   cd ios && pod install && cd ..

6. App icon for iOS:
   Same source as Android (1024×1024)
   flutter pub run flutter_launcher_icons (also generates iOS sizes)

7. Build IPA:
   flutter build ipa --release

8. Upload to App Store Connect:
   Xcode → Product → Archive → Distribute → App Store Connect

9. TestFlight:
   - Add internal testers
   - Verify all Milestone D scenarios pass on iOS

10. App Store Connect listing:
    - Screenshots: iPhone 6.7" + iPhone 5.5" required
    - App Privacy section (same data as Android data safety)
    - Demo account in Notes for Reviewer:
      "Email: reviewer@foundry.com | Password: Demo1234!"
      (Create this account in production system first)

11. Submit for App Store Review
    → Wait 24-72 hours
    → If rejected: fix specific issue → resubmit (no fee)
    → If approved: release
```

### Milestone E — Test to pass:
```
→ IPA builds without Xcode errors
→ TestFlight install works on iPhone
→ Camera permission dialog appears correctly
→ Login works
→ Module downloads work
→ Offline sync works (same Milestone D scenarios)
→ App Store review approved
→ Live on both stores ✅
```

---

**← DONE. Both stores live. →**

---

## Post-Launch: Module Updates (No App Update Needed)

```
This is the key advantage of the architecture.
To update a module without a new app release:

1. Make changes in modules/quality-inspector/src/
2. npm run build → new dist/bundle.js
3. Upload to Supabase Storage (new version folder):
   supabase.storage.from('module-bundles')
     .upload('quality-inspector/1.0.1/bundle.js', fileBuffer, { upsert: true })
   (old 1.0.0/ folder stays — rollback is possible)
4. Generate new checksum for 1.0.1/bundle.js
5. In Supabase SQL:
   UPDATE module_versions SET is_active = false WHERE module_id = 'quality-inspector';
   INSERT INTO module_versions VALUES (..., '1.0.1', new_cdn_url, new_checksum, ...);
6. Users get the update automatically on next app launch
   → No Play Store or App Store submission needed
```

---

## Quick Reference Commands

```bash
# Flutter
flutter run -d {device-id}                    # Run debug
flutter build appbundle --release             # Android build
flutter build ipa --release                   # iOS build (Mac only)
flutter devices                               # List connected devices

# React Modules
cd modules/quality-inspector
npm install && npm run build                  # Build module
# Copy dist/ to flutter/assets/modules/quality-inspector/

# Backend
cd backend
vercel dev                                    # Local API dev
vercel --prod                                 # Deploy

# Generate checksum (Node.js)
node -e "
const crypto=require('crypto'),fs=require('fs');
const h=crypto.createHash('sha256');
h.update(fs.readFileSync('dist/bundle.js'));
console.log('sha256:'+h.digest('hex'));
"
```

---

## Reference Files

- Architecture: `PRODUCTION_PLAYSTORE_ARCHITECTURE.md`
- Architecture decisions & rationale: `next_plan.md`
- PoC reference code: `pocs/output/foundry-position-shell-poc/`

---

---

## Phase 12 — ECDSA P-256 Bundle Signing (Module Provenance)

**Goal:** Prove that every module bundle served to the app was signed by Aikyat's server — and only Aikyat's server. SHA-256 checksum (Phase 6) proves a bundle was not tampered with in transit. ECDSA signature proves the bundle was authored and approved by Aikyat before upload. A third-party cannot inject a malicious bundle even if they compromise the CDN, because they do not hold the private key.

**Why ECDSA P-256:** Standard algorithm, hardware-accelerated on mobile, supported natively in Dart's `pointycastle` / `cryptography` packages. P-256 (secp256r1) is the same curve used in TLS certificates — no custom crypto.

**Trust model:**
```
Private key  →  lives on Aikyat's backend server (never leaves)
Public key   →  hardcoded in Flutter binary at build time
               Apple reviewed + approved the binary
               ∴ Apple approved the trust anchor

To inject a malicious module an attacker needs:
  1. The private key (impossible — never transmitted)
  OR
  2. A forged signature (computationally infeasible — P-256 math)
```

---

### What needs to be built:

#### A. Backend — Key Generation + Bundle Signing Script

```
1. Generate ECDSA P-256 key pair (one-time, offline):
   backend/scripts/generate_signing_key.js
   - Uses Node.js built-in crypto (generateKeyPairSync, 'ec', namedCurve: 'P-256')
   - Outputs:
       private_key.pem  →  KEEP OFFLINE. Never commit. Back up in 3 places.
       public_key.pem   →  Copy into Flutter source at build time

2. Create signing script:
   backend/scripts/sign_bundle.js
   - Reads bundle.js from stdin/arg
   - Signs with private_key.pem using SHA-256 + P-256
   - Outputs base64-encoded DER signature
   - Usage:
       node sign_bundle.js path/to/bundle.js > bundle.js.sig

3. Update module upload workflow (backend/scripts/upload_module.js):
   - Build module → npm run build → dist/bundle.js
   - Sign:         node sign_bundle.js dist/bundle.js > dist/bundle.js.sig
   - Checksum:     sha256 of bundle.js (existing, Phase 6)
   - Upload bundle.js + bundle.js.sig to Supabase Storage
   - INSERT into module_versions:
       checksum  = 'sha256:{hex}'     (existing field)
       signature = '{base64-DER}'     (new field)
```

#### B. Backend — Registry API Update

```
File: backend/api/modules/index.js

Add `signature` field to SELECT and response:
  Query:   SELECT ..., mv.signature FROM module_versions mv ...
  Return:  [{ id, name, version, cdn_url, checksum, signature, size_kb }]

The Flutter app will use this signature to verify bundle.js after download.
```

#### C. Flutter — ModuleEntry Model Update

```
File: lib/services/module_downloader.dart  (or module_registry_service.dart)

class ModuleInfo {
  final String id;
  final String name;
  final String version;
  final String cdnUrl;
  final String checksum;
  final String signature;     ← ADD THIS
  final int sizeKb;
  ...
}

Update fromJson() to parse 'signature' field.
```

#### D. Flutter — Signature Verification After Download

```
File: lib/services/module_downloader.dart

Add dependency to pubspec.yaml:
  cryptography: ^2.7.0     (or pointycastle: ^3.7.3)

Add method verifySignature():
  - Load hardcoded public key (PEM string embedded in source)
  - Read downloaded bundle.js bytes
  - Decode base64 DER signature from ModuleInfo.signature
  - Verify: ECDSA-P256-SHA256(publicKey, bundleBytes, signature)
  - If verification FAILS:
      Delete downloaded file
      Throw SecurityException('Bundle signature invalid — rejecting module')
      Log to Sentry with module ID + version
  - If verification PASSES: proceed to serve via local HTTP server

Verification order in downloadModule():
  Step 1 → Download bundle.js to temp file (existing)
  Step 2 → Verify SHA-256 checksum (existing)
  Step 3 → Verify ECDSA signature       ← NEW
  Step 4 → Write to cache (existing)
```

#### E. Flutter — Public Key Embedding

```
File: lib/security/bundle_verifier.dart  (new file)

const String kBundleSigningPublicKey = '''
-----BEGIN PUBLIC KEY-----
{paste output of generate_signing_key.js here at build time}
-----END PUBLIC KEY-----
''';

class BundleVerifier {
  static bool verify(Uint8List bundleBytes, String base64Signature) { ... }
}

This constant is compiled into the Flutter binary.
Apple reviews the binary → Apple implicitly approves this trust anchor.
```

---

### Folder changes:

```
foundry-app/
├── flutter/
│   └── lib/
│       └── security/
│           └── bundle_verifier.dart    ← NEW
│
└── backend/
    └── scripts/
        ├── generate_signing_key.js     ← NEW (one-time run, offline)
        ├── sign_bundle.js              ← NEW
        └── upload_module.js            ← UPDATE (add signing step)
```

---

### Database change:

```sql
ALTER TABLE module_versions ADD COLUMN signature TEXT;
-- Existing rows: signature = NULL (no re-signing needed for already-deployed modules)
-- New uploads from this phase onward: signature required
```

---

### Milestone F — Test to pass:

```
1. Key generation:
   node generate_signing_key.js
   → private_key.pem and public_key.pem created
   → Private key is NOT committed to git

2. Sign and upload a test bundle:
   node sign_bundle.js dist/bundle.js
   → Outputs base64 signature (no error)
   → GET /api/modules → response includes 'signature' field

3. Flutter verification — PASS case:
   → Download module normally
   → SHA-256 passes
   → ECDSA signature passes
   → Module loads in WebView ✅

4. Flutter verification — TAMPER case:
   → Manually flip 1 byte in cached bundle.js
   → Restart app
   → Signature verification FAILS
   → App shows error screen: "Module integrity check failed"
   → No WebView loads ✅
   → Sentry receives SecurityException event ✅

5. Flutter verification — WRONG KEY case:
   → Set kBundleSigningPublicKey to a different (wrong) key in test build
   → Signature verification FAILS immediately ✅

→ All 3 verification cases pass on real device before Phase 12 is complete
```

---

**← STOP HERE. Milestone F must pass on a real device before shipping Phase 12. →**

---

**Document Version:** 1.1
**Last Updated:** 2026-04-15
**Developer:** Claude Code
**Start with:** Phase 1 → `flutter create`
