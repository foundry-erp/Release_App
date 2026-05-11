# Phase 3 Validation Report

PHASE_ID: phase-3-module-registry
VALIDATED_AT: 2026-04-02
VALIDATOR: Claude Sonnet 4.6

---

## VALIDATION_STATUS: PASS_WITH_NOTES

---

## CHECK RESULTS

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Dependencies | PASS | path_provider, http, crypto, path all present — no new deps needed |
| 2 | LocalHttpServer._assetHandler | PASS | Insertion point confirmed before line 155 (rootBundle.load) |
| 3 | LoadingScreen structure | PASS | _checkAuth() lines 20-28 ready to extend; build() needs _status text |
| 4 | Dist files | PASS | bundle.js (142KB ✓), index.html (463B ✓) both present in dist/ |
| 5 | vercel.json | PASS_WITH_NOTE | **No change needed** — existing /api/(.*) rewrite already handles /api/modules; Vercel serves public/ automatically |
| 6 | Schema | PASS | modules table confirmed; bundle_checksum + index_url columns missing (migrate_phase3.sql correct) |
| 7 | AC completeness | PASS | All 8 ACs testable |
| 8 | Risk check | NOTES | 7 risks identified — see below |

---

## CORRECTIONS BUILDER MUST MAKE

### Critical (build fails or AC-4 fails if missed)

**C1 — Compute SHA-256 before running migration**
```
sha256sum backend/public/modules/quality-inspector/bundle.js
# On Windows: certutil -hashfile bundle.js SHA256
```
Paste the hex into `<SHA256_OF_BUNDLE_JS>` in migrate_phase3.sql before running in Supabase.

**C2 — Add missing imports**
- `local_http_server.dart`: add `import 'package:path_provider/path_provider.dart';`
- `loading_screen.dart`: add imports for ModuleRegistryService + ModuleDownloadService

**C3 — Create directory before writing files**
ModuleDownloadService must create `<appDocDir>/modules/<slug>/` before writing files:
```dart
final dir = Directory(dirPath);
if (!dir.existsSync()) dir.createSync(recursive: true);
```

### High Priority

**C4 — Use static methods on ModuleRegistryService**
LoadingScreen calls `ModuleRegistryService()` three times. Use static methods to avoid three separate instances and unnecessary file I/O.

**C5 — Add timeouts to network calls**
```dart
http.get(uri).timeout(const Duration(seconds: 30))
```
Prevents infinite hang on poor connectivity.

### Low Priority

**C6 — DO NOT modify vercel.json** — existing config is correct and sufficient.

**C7 — Hardcoded Vercel domain in migration** — acceptable for Phase 3, note for Phase 5.

---

## ACCEPTANCE CRITERIA — CONFIRMED

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | GET /api/modules with JWT → 200 modules array | CONFIRMED |
| AC-2 | GET /api/modules no token → 401 | CONFIRMED |
| AC-3 | /modules/quality-inspector/bundle.js → 200 (>100KB) | CONFIRMED |
| AC-4 | Checksum verify passes on download | CONDITIONAL on C1 (SHA-256 pre-computed) |
| AC-5 | Downloaded files exist in app_flutter/modules/ (adb check) | CONFIRMED |
| AC-6 | DB version bump → re-download on next launch | CONFIRMED |
| AC-7 | Airplane mode → bundled asset fallback, no crash | CONFIRMED |
| AC-8 | Same version in cache → no download | CONFIRMED |

---

VALIDATION_COMPLETE — Builder may proceed with corrections C1-C5 applied.
