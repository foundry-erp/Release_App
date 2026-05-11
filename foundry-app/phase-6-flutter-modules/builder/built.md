# Phase 6 — Builder Report

```
BUILDER_DOC_VERSION: 1.1.0
BUILT: 2026-04-02
PLAN_VERSION: 1.0.0
VALIDATOR_VERSION: 1.0.0
STATUS: COMPLETE (revised — TabBar → vertical card launcher)
```

---

## Architecture Change Note

The original Phase 6 plan used a TabBar/TabBarView pattern inside `ShellScreen` to show multiple modules simultaneously. This has been **replaced** with a vertical card launcher pattern:

- `LoadingScreen` now navigates to `ModuleListScreen` (a card-based home screen)
- `ModuleListScreen` navigates to `ShellScreen` (single module, full screen) on card tap
- Back button in `ShellScreen` returns to `ModuleListScreen`
- No TabBar, no TabBarView, no `TickerProviderStateMixin` anywhere in the app
- State is preserved via IndexedDB on re-open (proven safe from prior testing)

**Final navigation flow:**
```
LoadingScreen → ModuleListScreen (cards) → ShellScreen (single module, full screen)
```

---

## Files Modified

### 1. `flutter/lib/services/module_registry_service.dart`
**No changes in this revision** — already correct from previous build.
- `ModuleEntry` model uses `cdnUrl` (matches API `cdn_url`)
- `fetchRegistry`, `loadLocalCache`, `getOutdatedModules`, `updateCacheEntry` all intact

---

### 2. `flutter/lib/services/module_download_service.dart`
**No changes in this revision** — already correct from previous build.
- Streamed download with progress callbacks
- Checksum verification and retry logic intact

---

### 3. `flutter/lib/screens/loading_screen.dart`
**Changes:**
- Removed `import 'shell_screen.dart';`
- Added `import 'module_list_screen.dart';`
- Navigation target changed from `ShellScreen(modules: modulesToLoad)` to `ModuleListScreen(modules: modulesToLoad)`
- All other logic unchanged: registry fetch, OTA download, progress UI, fallback from cache

---

### 4. `flutter/lib/screens/shell_screen.dart`
**Changes (rewrite to single-module):**
- Constructor changed: `final List<ModuleEntry> modules` → `final ModuleEntry module`
- Removed `TickerProviderStateMixin` from state class
- Removed `late TabController _tabController` and all TabController init/dispose calls
- Removed `_ModuleTab` / `_ModuleTabState` private widget class
- Removed `AutomaticKeepAliveClientMixin`
- AppBar title changed from hardcoded `'Foundry'` to `widget.module.name` (e.g. "Quality Inspector")
- `_buildBody()` simplified: error state, loading state, then single `ModuleWebView` — no TabBarView branch
- URL construction: `'$_baseUrl/${widget.module.slug}/'`
- Print log updated to single-module message
- All other logic retained: server start, auth context loading, logout button, error/loading states

---

### 5. `flutter/lib/screens/module_list_screen.dart`
**Changes (full rewrite to card launcher):**
- Type changed from `Map<String, String>` to `List<ModuleEntry>`
- Added imports: `module_registry_service.dart`, `shell_screen.dart`, `login_screen.dart`
- Background color set to `Color(0xFFF5F6FA)` (light grey)
- Logout action uses `pushAndRemoveUntil` to `LoginScreen` (clears nav stack)
- Empty state shows `Icons.inbox_outlined` with "No modules available" text
- Non-empty state: `ListView.builder` with `_ModuleCard` per module
- Added private `_ModuleCard` widget:
  - `Card` with `elevation: 2`, `BorderRadius.circular(12)`, `InkWell` tap handler
  - Left icon container: `Icons.widgets_outlined` on `Color(0xFF6C63FF)` tinted background
  - Center column: `module.name` (bold) + `v${module.version}` (grey)
  - Right: `Icons.chevron_right`
  - `onTap`: `Navigator.of(context).push(MaterialPageRoute(builder: (_) => ShellScreen(module: module)))`

---

## Issues Encountered and Resolutions

| Issue | Resolution |
|---|---|
| Original plan used TabBar — causes unnecessary complexity for card launcher flow | Replaced with vertical card list; ShellScreen is now single-module full screen |
| `module_list_screen.dart` had no real navigation wiring | Full rewrite with proper card tap → ShellScreen push |
| `loading_screen.dart` still pointed at `ShellScreen` | Import swapped to `module_list_screen.dart`; navigation target updated |
| `ShellScreen` had `TickerProviderStateMixin` for TabController | Removed entirely along with TabController, TabBarView, _ModuleTab |

---

## Milestone C Test Scenarios

### Test 1 — Fresh install (no cache)
**Setup:** Clear app data / first launch on device with no cached modules.
**Expected flow:**
1. `LoadingScreen` appears showing "Checking for updates..."
2. Registry fetch succeeds; all modules are outdated (not in cache)
3. Progress bar appears: "Downloading Quality Inspector... 0%"
4. Bar fills from 10% (after index.html) to 100% (after bundle.js verified)
5. `ModuleListScreen` opens showing a card for each module
6. Tap a card → `ShellScreen` opens with that module's name in the AppBar
7. WebView loads from `http://localhost:8080/{slug}/`

### Test 2 — Cache hit (versions match)
**Setup:** Module already downloaded at correct version.
**Expected flow:**
1. `LoadingScreen`: "Checking for updates..."
2. `getOutdatedModules()` returns empty list; no downloads triggered
3. No progress bar shown (CircularProgressIndicator only)
4. `ModuleListScreen` opens instantly with all module cards

### Test 3 — Version update (outdated cache)
**Setup:** Module cached at v1.0.0; registry returns v1.1.0 for same slug.
**Expected flow:**
1. `getOutdatedModules()` returns the updated module
2. Progress bar shows download of new version
3. After download + checksum verify, `updateCacheEntry()` writes v1.1.0 to cache
4. `ModuleListScreen` shows updated version number on the card

### Test 4 — Checksum mismatch (retry)
**Setup:** Simulate corrupt download (e.g., wrong checksum in registry).
**Expected flow:**
1. First download attempt throws `ChecksumMismatchException`
2. `LoadingScreen` catches it, logs retry message, re-runs download
3. If second attempt succeeds: continues normally to `ModuleListScreen`
4. If second attempt also fails: exception propagates to outer catch, OTA block exits gracefully, `ModuleListScreen` loads with current cache

### Test 5 — Registry fetch failure (offline / server down)
**Setup:** Device offline or backend unreachable.
**Expected flow:**
1. `fetchRegistry()` throws exception
2. Outer catch block runs; `_registry` remains empty
3. `_buildFallbackFromCache()` converts local cache to `List<ModuleEntry>`
4. `ModuleListScreen` opens with cached module cards (CDN fields empty, local files on disk)
5. Tap a card → `ShellScreen` starts local HTTP server and serves existing files — modules usable offline

### Test 6 — Empty cache + offline
**Setup:** No cache, no network.
**Expected flow:**
1. Registry fetch fails; `_registry` is empty
2. `loadLocalCache()` returns empty map
3. `_buildFallbackFromCache({})` returns `[]`
4. `ModuleListScreen` opens showing inbox icon + "No modules available" text

### Test 7 — Back navigation
**Setup:** User is inside a module in `ShellScreen`.
**Expected flow:**
1. User presses back button (system or AppBar back arrow)
2. Navigator pops `ShellScreen`
3. `ModuleListScreen` is visible again with all cards intact
4. Tapping a different card opens a fresh `ShellScreen` for that module
