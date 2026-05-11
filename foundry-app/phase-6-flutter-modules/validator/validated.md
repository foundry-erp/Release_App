# Phase 6 — Validator Report

```
VALIDATOR_DOC_VERSION: 1.0.0
VALIDATED: 2026-04-02
PLAN_VERSION: 1.0.0
```

---

## STATUS: APPROVED WITH NOTES

The plan is structurally sound and safe to build. No blockers found. Three notes require
small adjustments to the build instructions to avoid compile errors.

---

## Checks Passed

- **Bug fix scope confirmed.** `bundleUrl` / `bundle_url` appears in exactly 4 places across
  2 files: `module_registry_service.dart` (lines 12, 20, 29) and `module_download_service.dart`
  (line 39). No other dart files reference either symbol. The rename to `cdnUrl` / `cdn_url`
  is complete and self-contained once those 4 lines are changed.

- **`ChecksumMismatchException` already exists.** Defined at line 8 of
  `module_download_service.dart`. The plan does not need to create it.

- **`http` package version is compatible with streaming.** `pubspec.yaml` pins `http: ^1.1.0`.
  `http.Client().send(BaseRequest)` returning a `StreamedResponse` is available from
  `http ^0.13.0` onwards. No pubspec change required for streaming.

- **`LocalHttpServer.baseUrl` getter exists and returns `String?`.** Defined at line 29–30 of
  `local_http_server.dart` as:
  `String? get baseUrl => _isRunning && _port != null ? 'http://localhost:$_port' : null;`
  ShellScreen already calls `_httpServer.baseUrl` (line 53). The getter is nullable — the
  existing null-safety guard in the current code already handles this correctly and must be
  preserved in the rewrite.

- **`flutter_secure_storage: ^9.0.0` is present in pubspec.yaml.** No dependency changes
  needed for AuthService usage in ShellScreen.

- **`ModuleWebView` constructor is compatible with TabBarView usage.** Constructor signature
  at line 19–23 of `module_webview.dart`:
  `const ModuleWebView({Key? key, required this.url, this.authContext = const {}});`
  Both parameters are straightforward value types. The widget is a `StatefulWidget` and
  `_ModuleWebViewState` does NOT currently mix in `AutomaticKeepAliveClientMixin` — this is
  expected and the plan correctly calls for adding it.

- **`getOutdatedModules()` return type confirmed.** Method at line 70–87 of
  `module_registry_service.dart` returns `List<ModuleEntry>`. The plan's instruction to
  "keep registry List<ModuleEntry> in scope after OTA" is valid — `registry` is already
  in scope at line 40 of `loading_screen.dart`.

- **All dependencies for the plan are already in pubspec.yaml.** `crypto`, `path_provider`,
  `path`, `http`, `flutter_secure_storage`, `webview_flutter` — all present. No new packages
  required.

- **ModuleListScreen is safe to leave in place un-routed.** It currently receives
  `Map<String, String>` (slug → version) from LoadingScreen. After the navigation change,
  it will simply be unreachable dead code. It won't cause compile errors because
  `ShellScreen(moduleSlug: slug)` (line 45 of `module_list_screen.dart`) will still compile
  until ShellScreen's constructor is changed — see NOTE 1 below.

---

## Issues Found

### NOTE 1 — MEDIUM: `module_list_screen.dart` will cause a compile error after ShellScreen rewrite
- **File:** `flutter/lib/screens/module_list_screen.dart`, line 45
- **Current code:** `builder: (_) => ShellScreen(moduleSlug: slug),`
- **Problem:** Once ShellScreen's constructor is changed from `moduleSlug: String` to
  `modules: List<ModuleEntry>`, this line will fail to compile even though it is dead code.
  Dart compiles all reachable source files regardless of whether they are navigated to.
- **Fix:** When rewriting `shell_screen.dart`, the Builder must also update line 45 of
  `module_list_screen.dart`. Replace the `onTap` body with a no-op or a placeholder that
  constructs ShellScreen with a single-element list:
  ```dart
  // In module_list_screen.dart — add import at top:
  import '../services/module_registry_service.dart';

  // Replace onTap body:
  onTap: () {
    // ModuleListScreen is no longer the primary navigation path (Phase 6).
    // Kept for reference only.
  },
  ```
  Alternatively, the Builder can simply delete the `onTap` property body or leave the
  ListTile non-tappable. The simplest safe fix is removing the push entirely.

### NOTE 2 — LOW: `loading_screen.dart` imports `module_list_screen.dart` — must update import
- **File:** `flutter/lib/screens/loading_screen.dart`, line 6
- **Current import:** `import 'module_list_screen.dart';`
- **Problem:** After the plan's navigation change, LoadingScreen will navigate to ShellScreen,
  not ModuleListScreen. The old import becomes unused and will trigger a lint warning
  (`unused_import`). More importantly, the Builder must ADD the ShellScreen import which is
  currently absent.
- **Fix:** In `loading_screen.dart`:
  - Remove: `import 'module_list_screen.dart';`
  - Add: `import 'shell_screen.dart';`
  - Add: `import '../services/module_registry_service.dart';` (already present — no change needed)

### NOTE 3 — LOW: `shell_screen.dart` TabController requires `TickerProviderStateMixin`
- **File:** `flutter/lib/screens/shell_screen.dart`
- **Current state:** `_ShellScreenState extends State<ShellScreen>` — no mixin.
- **Problem:** `TabController` requires a `TickerProvider` (vsync). The Builder must mix in
  `TickerProviderStateMixin` (or `SingleTickerProviderStateMixin` — use `TickerProviderStateMixin`
  since the tab count is dynamic and could be 0 at construction time).
- **Fix:** Change the state class declaration to:
  ```dart
  class _ShellScreenState extends State<ShellScreen>
      with TickerProviderStateMixin {
  ```
  Then pass `vsync: this` when constructing `TabController`.

---

## Builder Instructions

Build in the plan's stated order (registry → download → loading → shell). Apply these
precise adjustments on top of the plan:

1. **Step 1 — module_registry_service.dart:** Rename exactly 4 occurrences:
   - Line 12: `final String bundleUrl;` → `final String cdnUrl;`
   - Line 20: `required this.bundleUrl,` → `required this.cdnUrl,`
   - Line 29: `bundleUrl: j['bundle_url'] as String,` → `cdnUrl: j['cdn_url'] as String,`
   - Line 39 of module_download_service.dart: `entry.bundleUrl` → `entry.cdnUrl`
   (Do not search-replace globally without checking — `indexUrl` and `checksum` field names
   are correct and must not be touched.)

2. **Step 2 — module_download_service.dart:** `ChecksumMismatchException` is already defined
   (lines 8–13). Do NOT redefine it. Just add `onProgress` parameter and streaming logic to
   the existing `download()` method. Current method signature:
   `static Future<void> download(ModuleEntry entry)`
   New signature per plan:
   `static Future<void> download(ModuleEntry entry, {void Function(double)? onProgress})`

3. **Step 3 — loading_screen.dart:**
   - Remove import of `module_list_screen.dart`; add import of `shell_screen.dart`
   - Navigate to `ShellScreen(modules: registry)` — `registry` is the `List<ModuleEntry>`
     from `fetchRegistry()` already in scope at line 40
   - If `fetchRegistry()` fails and falls through the catch block, pass the cached registry
     as a `List<ModuleEntry>` — the Builder must decide whether to re-call `fetchRegistry`
     from cache or pass an empty list; the plan specifies "Use loadLocalCache(), proceed to
     ShellScreen" but `loadLocalCache()` returns `Map<String,String>` not `List<ModuleEntry>`.
     Resolution: on OTA failure, pass the already-fetched `registry` if available, or pass
     `[]` (empty list) if the initial fetch also failed. ShellScreen already handles empty
     list with "No modules available" text per the plan.

4. **Step 4 — shell_screen.dart:**
   - Add `TickerProviderStateMixin` to `_ShellScreenState` (required for TabController).
   - `baseUrl` getter returns `String?` — null-check it before constructing tab URLs:
     `final base = _httpServer.baseUrl; if (base == null) { /* set _error */ return; }`
   - The existing `_authContext` loading logic (lines 36–41) can be reused as-is.

5. **Step 4 also — module_list_screen.dart (collateral fix):**
   - Remove the `Navigator.push` call in the `onTap` handler (or replace with a no-op).
   - Add `import '../services/module_registry_service.dart';` only if needed after edit.
   - This file is NOT to be deleted — leave it in place per the plan.
