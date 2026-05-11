# Phase 3 — Module Registry & OTA Updates

```
PHASE_ID: phase-3-module-registry
PLANNER_DOC_VERSION: 6.1.0
GENERATED: 2026-04-02T00:00:00Z
```

---

## WHAT_TO_BUILD

Add over-the-air (OTA) module updates to the Foundry shell. Currently the quality-inspector bundle is baked into the APK (`assets/modules/quality-inspector/`). Phase 3 makes modules downloadable so a new bundle can be shipped without a new APK.

Three tracks must ship together:

**Track A — Backend:** A new endpoint `GET /api/modules` returns the registry — a JSON array of active modules with slug, version, and bundle_url. The quality-inspector bundle (index.html + bundle.js) is hosted as static files directly on the same Vercel deployment via a `public/` folder. The `modules` table row for quality-inspector is updated with the live bundle_url pointing to those files.

**Track B — Flutter services:** Two new services. `ModuleRegistryService` fetches the registry from the backend (using the stored JWT) and compares remote versions against a local version cache file (`modules_cache.json` in `getApplicationDocumentsDirectory()`). `ModuleDownloadService` downloads the module files (index.html + bundle.js) from the bundle_url, verifies SHA-256 checksum of bundle.js against the registry response, saves files into `getApplicationDocumentsDirectory()/modules/<slug>/`, and updates `modules_cache.json`.

**Track C — Flutter integration:** `LocalHttpServer` is updated to check the filesystem cache first before falling back to the bundled asset. `LoadingScreen` is extended to run the registry check + optional download before navigating to `ShellScreen`, showing progress to the user. `ShellScreen` is unchanged.

No new Flutter dependencies are required — `path_provider`, `http`, `crypto`, and `path` are already in `pubspec.yaml`.

---

## MODULE HOSTING STRATEGY

**Choice: Vercel `public/` folder (static files served by Vercel itself)**

- Zero extra infrastructure — the backend Vercel deployment already exists
- Vercel automatically serves `public/` at the root URL
- `bundle_url` in `modules` table = `https://foundry-app-rouge.vercel.app/modules/quality-inspector/bundle.js`
- No zip library needed — download two files separately (index.html + bundle.js)
- Checksum verified on `bundle.js` only (the large file that changes)

**Bundle format: two separate files (no zip — avoids `archive` package dependency)**

```
backend/public/modules/quality-inspector/bundle.js
backend/public/modules/quality-inspector/index.html
```

Registry response includes both URLs + SHA-256 of bundle.js.

---

## DATA FLOW DIAGRAMS

### 1. App Startup (OTA Check Flow)

```
main.dart
  └─ LoadingScreen.initState()
       ├─ AuthService.isLoggedIn()          (FlutterSecureStorage read)
       │    └─ false → LoginScreen (stop)
       │
       └─ true → OTA check sequence:
            │
            ├─ [1] ModuleRegistryService.fetchRegistry(token)
            │         GET /api/modules
            │         Authorization: Bearer <jwt>
            │         ← 200 [ { slug, version, bundle_url, index_url, checksum } ]
            │         (on network error → skip to [4])
            │
            ├─ [2] ModuleRegistryService.compareVersions(registry, localCache)
            │         reads modules_cache.json from getApplicationDocumentsDirectory()
            │         returns list of modules needing update
            │
            ├─ [3] for each outdated module:
            │         ModuleDownloadService.download(moduleEntry)
            │           GET entry.indexUrl  → save index.html
            │           GET entry.bundleUrl → get bytes
            │           verify SHA-256(bytes) == entry.checksum
            │           write bundle.js to getAppDocDir()/modules/<slug>/
            │           update modules_cache.json
            │
            └─ [4] ShellScreen (always, even if OTA failed)
```

### 2. File Serving (LocalHttpServer Cache-First)

```
WebView requests: http://localhost:8080/quality-inspector/bundle.js
                                   │
                         LocalHttpServer._assetHandler()
                                   │
                    ┌──────────────▼──────────────┐
                    │  Check filesystem cache:     │
                    │  getAppDocDir()/modules/     │
                    │  quality-inspector/bundle.js │
                    └──────────────┬──────────────┘
                       exists?     │
                    ┌──────yes─────┴──────no──────┐
                    ▼                              ▼
           Read from File                 rootBundle.load()
           (dart:io File.readAsBytes)     (bundled APK asset)
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
                         Response.ok(bytes, contentType)
```

### 3. Registry API Data Flow

```
Flutter app                    Vercel Backend              Supabase DB
    │                               │                           │
    │  GET /api/modules             │                           │
    │  Authorization: Bearer <jwt>  │                           │
    │──────────────────────────────►│                           │
    │                               │  requireAuth(jwt)         │
    │                               │  SELECT slug, name,       │
    │                               │    version, bundle_url,   │
    │                               │    index_url,             │
    │                               │    bundle_checksum        │
    │                               │  FROM modules             │
    │                               │  WHERE is_active = true   │
    │                               │──────────────────────────►│
    │                               │◄──────────────────────────│
    │◄──────────────────────────────│                           │
    │  200 { modules: [...] }       │                           │
```

### 4. Version Cache File Format (on device)

```
getApplicationDocumentsDirectory()/modules_cache.json

{
  "quality-inspector": {
    "version": "1.1.0",
    "cached_at": "2026-04-02T10:00:00Z",
    "path": "/data/user/0/com.example.foundry_app/app_flutter/modules/quality-inspector/"
  }
}
```

---

## DELIVERABLES

### Backend (Vercel)

| # | File | Action | Purpose |
|---|------|--------|---------|
| 1 | `backend/api/modules/index.js` | CREATE | GET /api/modules — returns active module registry |
| 2 | `backend/public/modules/quality-inspector/bundle.js` | CREATE | Copy of dist/bundle.js — served as static asset |
| 3 | `backend/public/modules/quality-inspector/index.html` | CREATE | Copy of dist/index.html — served as static asset |
| 4 | `backend/sql/migrate_phase3.sql` | CREATE | Adds bundle_checksum + index_url columns; updates quality-inspector row |
| 5 | `backend/vercel.json` | MODIFY | Add /api/modules rewrite |

### Flutter

| # | File | Action | Purpose |
|---|------|--------|---------|
| 6 | `flutter/lib/services/module_registry_service.dart` | CREATE | Fetches registry, compares versions against local cache |
| 7 | `flutter/lib/services/module_download_service.dart` | CREATE | Downloads files, verifies SHA-256, writes to filesystem, updates cache |
| 8 | `flutter/lib/services/local_http_server.dart` | MODIFY | Cache-first: check filesystem before APK asset |
| 9 | `flutter/lib/screens/loading_screen.dart` | MODIFY | OTA check sequence with status messages |

---

## DETAILED FILE SPECIFICATIONS

### File 1: `backend/api/modules/index.js`

- Method: GET only (405 for others)
- Auth: `requireAuth` middleware (same inline Promise pattern as profile.js)
- Query: `SELECT slug, name, version, bundle_url, index_url, bundle_checksum FROM modules WHERE is_active = true ORDER BY name`
- Response:
```json
{
  "modules": [
    {
      "slug": "quality-inspector",
      "name": "Quality Inspector",
      "version": "1.1.0",
      "bundle_url": "https://foundry-app-rouge.vercel.app/modules/quality-inspector/bundle.js",
      "index_url": "https://foundry-app-rouge.vercel.app/modules/quality-inspector/index.html",
      "checksum": "<sha256-hex-of-bundle.js>"
    }
  ]
}
```

### File 4: `backend/sql/migrate_phase3.sql`

```sql
ALTER TABLE modules ADD COLUMN IF NOT EXISTS bundle_checksum text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS index_url text;

UPDATE modules
SET
  version         = '1.1.0',
  bundle_url      = 'https://foundry-app-rouge.vercel.app/modules/quality-inspector/bundle.js',
  index_url       = 'https://foundry-app-rouge.vercel.app/modules/quality-inspector/index.html',
  bundle_checksum = '<SHA256_OF_BUNDLE_JS>'
WHERE slug = 'quality-inspector';
```

Builder must replace `<SHA256_OF_BUNDLE_JS>` with actual computed checksum before running.

### File 6: `flutter/lib/services/module_registry_service.dart`

```dart
class ModuleEntry {
  final String slug, name, version, bundleUrl, indexUrl, checksum;
  ModuleEntry.fromJson(Map<String, dynamic> j) : ...
}

class ModuleRegistryService {
  Future<List<ModuleEntry>> fetchRegistry(String token) { ... }
  Future<Map<String, String>> loadLocalCache() { ... }  // slug → version
  List<ModuleEntry> getOutdatedModules(List<ModuleEntry> remote, Map<String, String> cache) { ... }
  Future<void> updateCacheEntry(String slug, String version, String dirPath) { ... }
}
```

`loadLocalCache()` reads `modules_cache.json` from `getApplicationDocumentsDirectory()`. Returns `{}` if file missing.

`getOutdatedModules()` — simple string equality check on version. No semver parsing.

### File 7: `flutter/lib/services/module_download_service.dart`

`download(ModuleEntry entry)` steps:
1. `http.get(entry.indexUrl)` → write to `<appDocDir>/modules/<slug>/index.html`
2. `http.get(entry.bundleUrl)` → get response bytes
3. Verify `sha256.convert(bytes).toString() == entry.checksum` → throw `ChecksumMismatchException` on failure
4. Write bytes to `<appDocDir>/modules/<slug>/bundle.js`
5. `registryService.updateCacheEntry(slug, version, dirPath)`

Log prefix: `[ModuleDownload]`

### File 8: `flutter/lib/services/local_http_server.dart` (MODIFY)

Add instance field: `Directory? _appDocDir`

In `start()`, after `WidgetsFlutterBinding.ensureInitialized()` equivalent:
```dart
_appDocDir = await getApplicationDocumentsDirectory();
```

In `_assetHandler`, before `rootBundle.load()`:
```dart
if (_appDocDir != null) {
  final fsPath = path.join(_appDocDir!.path, 'modules', moduleId, targetFile);
  final fsFile = File(fsPath);
  if (fsFile.existsSync()) {
    final bytes = await fsFile.readAsBytes();
    return Response.ok(bytes, headers: { 'content-type': contentType });
  }
}
// fall through to rootBundle.load() (existing code unchanged)
```

Only `_assetHandler` method changes. Everything else preserved verbatim.

### File 9: `flutter/lib/screens/loading_screen.dart` (MODIFY)

New `_checkAuth()` flow:
```dart
final loggedIn = await AuthService().isLoggedIn();
if (!mounted) return;
if (!loggedIn) { navigate to LoginScreen; return; }

// OTA check
setState(() => _status = 'Checking for updates...');
try {
  final token = await AuthService().getToken();
  final registry = await ModuleRegistryService().fetchRegistry(token!);
  final cache = await ModuleRegistryService().loadLocalCache();
  final outdated = ModuleRegistryService().getOutdatedModules(registry, cache);
  for (final entry in outdated) {
    setState(() => _status = 'Updating ${entry.name}...');
    await ModuleDownloadService().download(entry);
  }
} catch (e) {
  print('[LoadingScreen] OTA check failed: $e');  // silent fail
}

if (!mounted) return;
navigate to ShellScreen;
```

Add `String _status = 'Loading...'` state field. Show `Text(_status)` below the spinner.

---

## IMPLEMENTATION SEQUENCE

1. Copy dist files → `backend/public/modules/quality-inspector/`
2. Compute SHA-256 of `bundle.js`
3. Fill in checksum → run `migrate_phase3.sql` in Supabase
4. Create `backend/api/modules/index.js` + update `vercel.json`
5. `vercel --prod` → verify `GET /api/modules` returns correct JSON
6. Create `module_registry_service.dart` + `module_download_service.dart`
7. Update `local_http_server.dart` (cache-first)
8. Update `loading_screen.dart` (OTA check)
9. `flutter run` → confirm end-to-end OTA flow

---

## ACCEPTANCE CRITERIA

| AC | Description | Pass Condition |
|----|-------------|----------------|
| AC-1 | Registry endpoint returns modules | GET /api/modules with valid JWT → 200 with modules array |
| AC-2 | Registry rejects unauthenticated | GET /api/modules no token → 401 |
| AC-3 | Bundle files publicly accessible | GET /modules/quality-inspector/bundle.js → 200, size > 100KB |
| AC-4 | Checksum verification passes | Download completes without ChecksumMismatchException |
| AC-5 | Downloaded module served from filesystem | adb confirms files in app_flutter/modules/quality-inspector/ |
| AC-6 | Version bump triggers re-download | Bump version in DB → app downloads new bundle on next launch |
| AC-7 | Offline fallback — no crash | Airplane mode → app still loads bundled module |
| AC-8 | Same version skips download | Second launch with same version → no download logs |

---

## POC_REFERENCE

`LocalHttpServer` is a proven pattern from Phase 1 POC. Phase 3 modifies **one method only** (`_assetHandler`). Port-finding, CORS, logging, content-type mapping, start/stop lifecycle, and singleton pattern are preserved verbatim. The cache-first logic is a minimal insertion wrapped in try/catch so any filesystem error falls through to the existing `rootBundle.load()` call.

## OUT OF SCOPE

- Zip extraction (using two-file approach instead)
- Background downloads
- Delta/patch updates
- Rollback on corrupt download
- Multiple simultaneous module downloads
- Module permissions / per-user access
