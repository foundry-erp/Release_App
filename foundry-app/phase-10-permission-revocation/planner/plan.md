# Phase 10 — Module Permission Revocation
PHASE_ID: phase-10-permission-revocation
PLANNER_DOC_VERSION: 6.1.0
DEPENDS_ON: [phase-9-android-playstore]
PROVIDES_TO: [none — additive feature, no downstream phases]

## What This Phase Builds

When an admin removes a user's permission for a module, that module's cached bundle files are automatically deleted from the device on the user's next app open. The module also disappears from the UI since the backend no longer returns it in `GET /api/modules`.

No backend changes are needed — the backend already returns only permitted modules. This is a Flutter-only change.

## How the Existing System Works (Context for Builder)

- `LoadingScreen._checkAuth()` runs on every app open
- It calls `ModuleRegistryService.fetchRegistry(token)` → returns only the user's permitted modules from backend
- It calls `ModuleRegistryService.loadLocalCache()` → returns `Map<String, String>` of `{slug: version}` for every module ever downloaded
- Module files live at: `app_doc_dir/modules/{slug}/` (contains `bundle.js` + `index.html`)
- Cache manifest lives at: `app_doc_dir/modules_cache.json`
- If the OTA fetch fails (offline), app falls back to the local cache — NO pruning should happen in this case

## What Is Missing

There is no logic to compare the permitted list (server response) against the cached list (local files). Revoked modules stay on device indefinitely.

## Requirements Covered

- REQ-10.1: When a module is no longer in the server's permitted list, its local bundle files are deleted from the device automatically on next successful registry fetch
- REQ-10.2: The deleted module is also removed from `modules_cache.json`
- REQ-10.3: Pruning only runs when the registry fetch succeeds (online path) — never when falling back to local cache (offline path)
- REQ-10.4: If the module directory does not exist on disk (already missing), the cache entry is still removed silently — no error thrown

## Deliverables

- [ ] `flutter/lib/services/module_registry_service.dart`: New static method `pruneRevokedModules(List<String> permittedSlugs)` added to `ModuleRegistryService`
- [ ] `flutter/lib/screens/loading_screen.dart`: `_checkAuth()` calls `pruneRevokedModules` after successful `fetchRegistry`, before the download loop

## Inputs From Previous Phase

No typed interface. Requires the Flutter app to be runnable (phases 1–9 complete).

## Outputs To Next Phase

None — this is a terminal additive feature.

## Acceptance Criteria

- [ ] AC-10.1
      criterion: pruneRevokedModules method exists in ModuleRegistryService
      test_command: grep -n "pruneRevokedModules" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/lib/services/module_registry_service.dart"
      pass_condition: At least one match
      blocking: true

- [ ] AC-10.2
      criterion: pruneRevokedModules is called in LoadingScreen._checkAuth after fetchRegistry
      test_command: grep -n "pruneRevokedModules" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/lib/screens/loading_screen.dart"
      pass_condition: At least one match
      blocking: true

- [ ] AC-10.3
      criterion: pruneRevokedModules is NOT called in the offline fallback path
      test_command: grep -n -A5 "buildFallbackFromCache" "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter/lib/screens/loading_screen.dart"
      pass_condition: Output does NOT contain pruneRevokedModules near _buildFallbackFromCache
      blocking: true

- [ ] AC-10.4
      criterion: flutter analyze passes with no errors on modified files
      test_command: cd "C:/Users/bijay/OneDrive/Desktop/release_app/foundry-app/flutter" && flutter analyze lib/services/module_registry_service.dart lib/screens/loading_screen.dart 2>&1
      pass_condition: Output contains "No issues found" or zero error-level issues
      blocking: true

## Manual Test Steps

1. In Supabase: remove a user's permission for quality-inspector (delete row from user_module_permissions)
2. Kill and reopen the app — quality-inspector should be gone from the module list
3. Check device filesystem: `app_doc_dir/modules/quality-inspector/` should no longer exist
4. Check `modules_cache.json`: quality-inspector entry should be removed
5. Re-grant permission → reopen app → quality-inspector redownloads and appears again

## Phase Achievement

Revoked module bundles are automatically cleaned up from device on next login, keeping device storage accurate and preventing users from accessing modules they no longer have permission to use.

## Planner Notes

⚠ UNCLEAR-1: `pruneRevokedModules` return type — should it return `List<String>` (pruned slugs) for logging, or `void`? Validator must decide. Recommendation: return `List<String>` so LoadingScreen can log what was pruned.

⚠ UNCLEAR-2: Directory deletion — Flutter's `Directory.deleteSync(recursive: true)` vs `Directory.delete(recursive: true)`. Validator must specify which to use (async preferred for consistency with existing code style in download_service.dart).

⚠ UNCLEAR-3: Cache update after pruning — `modules_cache.json` must be rewritten with the revoked slugs removed. Validator must specify whether to call a new helper or inline the JSON rewrite in the same method.
