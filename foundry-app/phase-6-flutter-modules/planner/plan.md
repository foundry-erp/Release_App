# Phase 6 — Flutter: Module Downloader + Cache + Version Check

```
PHASE_ID: phase-6-flutter-modules
PLANNER_DOC_VERSION: 1.0.0
GENERATED: 2026-04-03
```

---

## GOAL
Flutter fetches module registry, downloads missing/outdated modules from Supabase CDN,
serves via local HTTP server, shows download progress, tab bar navigation between modules.

Reference: IMPLEMENTATION_PLAN.md Phase 6 — Milestone C

---

## CRITICAL BUG FIX (unblocks everything)
ModuleEntry.fromJson() reads `bundle_url` but Phase 5 API returns `cdn_url`.
Causes: `type 'Null' is not a subtype of type 'String' in type cast` on OTA check.
Fix: rename bundleUrl → cdnUrl, bundle_url → cdn_url (3 lines in module_registry_service.dart)

---

## FILES TO MODIFY (no new files needed)

### 1. module_registry_service.dart
- Rename field: `bundleUrl` → `cdnUrl`
- Rename constructor param: `required this.bundleUrl` → `required this.cdnUrl`
- Rename JSON key: `j['bundle_url']` → `j['cdn_url']`

### 2. module_download_service.dart
- Update `entry.bundleUrl` → `entry.cdnUrl`
- Add `onProgress` callback: `void Function(double progress)? onProgress`
- Switch bundle.js download to streamed: `http.Client().send()` → StreamedResponse
- Count received bytes, call onProgress((bytes/total)*0.9 + 0.1)
- If Content-Length missing: report 0.1 at start, 1.0 at end (graceful fallback)

### 3. loading_screen.dart
- Add state: `double? _downloadProgress`, `String? _currentModuleName`
- Show LinearProgressIndicator when _downloadProgress != null
- Status text: "Downloading Quality Inspector... 45%"
- Wire onProgress into download loop with overall progress math:
  `overall = (moduleIndex / total) + (singleProgress / total)`
- Retry-once on ChecksumMismatchException per module
- Keep registry List<ModuleEntry> in scope after OTA
- Navigate to ShellScreen(modules: registry) instead of ModuleListScreen

### 4. shell_screen.dart
- Change constructor: `final String moduleSlug` → `final List<ModuleEntry> modules`
- Add TabController (length: modules.length)
- AppBar bottom: TabBar (only if modules.length > 1)
- Body: TabBarView with lazy-loaded ModuleWebView per tab
  (AutomaticKeepAliveClientMixin — keeps WebViews alive when switching tabs)
- Single-module edge case: no TabBar, just one WebView directly
- _serverReady gate: show spinner until server starts, then show TabBarView
- Logout button stays in AppBar

---

## NAVIGATION CHANGE
Before: LoadingScreen → ModuleListScreen → ShellScreen(moduleSlug)
After:  LoadingScreen → ShellScreen(modules: [List<ModuleEntry>])

ModuleListScreen.dart left in place but no longer routed to.

---

## LOCAL HTTP SERVER
No changes needed. Already serves /{slug}/file from single port 8080.
Multi-slug capable. Cache-first, asset fallback.

---

## ERROR HANDLING
| Scenario | Handling |
|---|---|
| Registry fetch fails | Use loadLocalCache(), proceed to ShellScreen |
| Download fails | Stale cache serves that slug |
| Checksum mismatch | Retry once, then fall back to cache |
| No modules cached | ShellScreen shows "No modules available" |
| Server fails to start | _serverError = true, show Retry button |

---

## MILESTONE C TESTS
1. Fresh install: "Downloading... 45%" progress → module in tab ✅
2. Cache hit: instant load, both tabs ready ✅
3. Version update: detects mismatch → downloads new version ✅

---

## BUILD ORDER
1. Fix module_registry_service.dart (bundle_url → cdn_url)
2. Update module_download_service.dart (cdnUrl + onProgress stream)
3. Update loading_screen.dart (progress UI + navigate to ShellScreen)
4. Update shell_screen.dart (TabController + TabBarView + List<ModuleEntry>)
