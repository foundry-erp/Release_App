# Phase 10 — Validator Output
PHASE_ID: phase-10-permission-revocation
VALIDATOR_DOC_VERSION: 6.1.0
CYCLE: 1
DRIFT_CHECK_STATUS: NOT_APPLICABLE (cycle 1)
STATUS: READY_FOR_BUILDER

---

## Scope Confirmed

Two files modified. No backend changes. No new files created.

- `flutter/lib/services/module_registry_service.dart` — add one static method
- `flutter/lib/screens/loading_screen.dart` — add one method call in `_checkAuth()`

---

## UNCLEAR Resolutions

**UNCLEAR-1 (return type):** `pruneRevokedModules` returns `Future<List<String>>` — the list of slugs that were pruned. LoadingScreen logs this with `print`. Reasoning: consistent with existing debug logging style throughout the codebase (`print('[Registry] ...')`).

**UNCLEAR-2 (async vs sync deletion):** Use `await dir.delete(recursive: true)` — async, consistent with `ModuleDownloadService.download()` which is fully async.

**UNCLEAR-3 (cache rewrite):** Inline the JSON rewrite inside `pruneRevokedModules` itself — read the cache file, remove revoked keys, write back. Do NOT add a separate helper method (one-time operation, no abstraction needed).

---

## Deliverable 1: `pruneRevokedModules` in ModuleRegistryService

**File:** `flutter/lib/services/module_registry_service.dart`

**Where to add:** After the existing `updateCacheEntry` method (end of class body, before closing `}`).

**Exact method signature:**
```dart
static Future<List<String>> pruneRevokedModules(List<String> permittedSlugs) async {
```

**Exact logic — step by step:**

1. Load the cache file (`modules_cache.json`) — same path logic as `loadLocalCache()`
2. If cache file does not exist → return empty list immediately (nothing to prune)
3. Parse cache JSON into `Map<String, dynamic>`
4. Find revoked slugs: keys in cache that are NOT in `permittedSlugs`
5. For each revoked slug:
   a. Build the directory path: `path.join(appDocDir.path, 'modules', slug)`
   b. If the directory exists → `await Directory(dirPath).delete(recursive: true)`
   c. If the directory does NOT exist → skip silently (no error)
   d. Remove the key from the cache map
6. If any slugs were pruned → write the updated cache map back to `modules_cache.json`
7. Return the list of pruned slugs

**Exact implementation:**
```dart
static Future<List<String>> pruneRevokedModules(List<String> permittedSlugs) async {
  final pruned = <String>[];
  try {
    final dir = await getApplicationDocumentsDirectory();
    final cacheFile = File(path.join(dir.path, _cacheFileName));
    if (!cacheFile.existsSync()) return pruned;

    final cache = jsonDecode(cacheFile.readAsStringSync()) as Map<String, dynamic>;
    final revoked = cache.keys.where((slug) => !permittedSlugs.contains(slug)).toList();

    for (final slug in revoked) {
      final moduleDir = Directory(path.join(dir.path, 'modules', slug));
      if (moduleDir.existsSync()) {
        await moduleDir.delete(recursive: true);
        print('[Registry] Pruned revoked module files: $slug');
      } else {
        print('[Registry] Revoked module has no cached files: $slug');
      }
      cache.remove(slug);
      pruned.add(slug);
    }

    if (pruned.isNotEmpty) {
      cacheFile.writeAsStringSync(jsonEncode(cache));
      print('[Registry] Cache updated after pruning ${pruned.length} module(s)');
    }
  } catch (e) {
    print('[Registry] Error during prune: $e');
  }
  return pruned;
}
```

**Imports already present in the file:** `dart:convert`, `dart:io`, `path_provider`, `path` — all needed, nothing new to import.

**Acceptance Criterion:**
- AC-10.1: `grep -n "pruneRevokedModules" .../module_registry_service.dart` → at least one match

---

## Deliverable 2: Call `pruneRevokedModules` in LoadingScreen

**File:** `flutter/lib/screens/loading_screen.dart`

**Where:** Inside `_checkAuth()`, after `fetchRegistry` succeeds and `cache` is loaded, BEFORE the `getOutdatedModules` call and the download loop.

**Current code block (lines 43–46):**
```dart
final registry = await ModuleRegistryService.fetchRegistry(token);
_registry = registry;
final cache = await ModuleRegistryService.loadLocalCache();
final outdated = ModuleRegistryService.getOutdatedModules(registry, cache);
```

**Required code block after change:**
```dart
final registry = await ModuleRegistryService.fetchRegistry(token);
_registry = registry;
final pruned = await ModuleRegistryService.pruneRevokedModules(
  registry.map((m) => m.slug).toList(),
);
if (pruned.isNotEmpty) {
  print('[LoadingScreen] Removed ${pruned.length} revoked module(s): $pruned');
}
final cache = await ModuleRegistryService.loadLocalCache();
final outdated = ModuleRegistryService.getOutdatedModules(registry, cache);
```

**Why this position:**
- After `fetchRegistry` — we have the live permitted list (online confirmed)
- Before `loadLocalCache` — cache is loaded fresh after pruning, so pruned entries don't appear as "outdated to download"
- Inside the `try` block — if pruning fails it's caught by the existing catch and app continues

**What must NOT change:**
- The `catch (e)` block that follows — leave untouched
- The offline fallback path `_buildFallbackFromCache` — `pruneRevokedModules` must not be called there
- No new imports needed (`ModuleRegistryService` already imported)

**Acceptance Criteria:**
- AC-10.2: `grep -n "pruneRevokedModules" .../loading_screen.dart` → at least one match
- AC-10.3: `grep -n -A5 "buildFallbackFromCache" .../loading_screen.dart` → does NOT contain `pruneRevokedModules`

---

## Edge Cases

| Scenario | Handling |
|---|---|
| `modules_cache.json` does not exist | Return empty list immediately — no error |
| Module in cache but directory already deleted | Log "no cached files", still remove from cache JSON |
| All modules revoked (empty permitted list) | All cached slugs pruned — cache file becomes `{}` |
| No modules revoked (all still permitted) | `pruned` is empty, cache file not rewritten, zero disk I/O |
| Directory delete fails (permissions error) | Caught by outer try/catch, print error, return whatever was pruned so far |
| `fetchRegistry` fails (offline) | Exception thrown before `pruneRevokedModules` is called — pruning never runs |

---

## Build Order

1. Edit `module_registry_service.dart` — add `pruneRevokedModules` method after `updateCacheEntry`
2. Edit `loading_screen.dart` — insert the 5-line block after `_registry = registry;`
3. Run `flutter analyze` on both files
4. Verify AC-10.1 through AC-10.4

---

## Acceptance Criteria Summary

| AC | Criterion | Test Command | Pass Condition |
|---|---|---|---|
| AC-10.1 | pruneRevokedModules exists in registry service | `grep -n "pruneRevokedModules" flutter/lib/services/module_registry_service.dart` | >= 1 match |
| AC-10.2 | pruneRevokedModules called in loading_screen | `grep -n "pruneRevokedModules" flutter/lib/screens/loading_screen.dart` | >= 1 match |
| AC-10.3 | NOT called in offline fallback | `grep -n -A5 "buildFallbackFromCache" flutter/lib/screens/loading_screen.dart` | does not contain pruneRevokedModules |
| AC-10.4 | flutter analyze clean | `cd flutter && flutter analyze lib/services/module_registry_service.dart lib/screens/loading_screen.dart` | No errors |
