# Validated Spec — Phase 5: Flutter Verification Integration
PHASE_ID: phase-5-flutter-verification-integration
VALIDATED: 2026-04-15T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE
# NOT_APPLICABLE: cycle 1 — no baseline exists yet

---

## What To Build

Wire `BundleVerifier.verify()` into the live module download flow inside
`ModuleDownloadService.download()`. After the existing SHA-256 checksum check passes (Step 2),
add Step 3: call `BundleVerifier.verify(bundleBytes, entry.signature)`. If `entry.signature` is
empty, skip the ECDSA check entirely (backward-compatibility guard for legacy unsigned modules).
If `verify()` returns `false`, throw a new `BundleSignatureException(slug: entry.slug,
version: entry.version)`, do NOT write `bundle.js` to disk, and do NOT retry.
Also call `Sentry.captureException(BundleSignatureException(...))` immediately before throwing.

Modify `loading_screen.dart` to catch `BundleSignatureException` explicitly inside the per-module
download loop. On catch: call `Sentry.captureException(e)`, set `_status` to
`'Module integrity check failed for ${e.slug}'`, set `_signatureError` (a new `String?` state
field) to the module slug, and do NOT navigate to `DashboardScreen`. The outer `catch (e)` block
must re-throw `BundleSignatureException` if it reaches the outer catch (it must never be swallowed
silently and navigated past). Also fix the compile error in `_buildFallbackFromCache()` by adding
`signature: ''` to the `ModuleEntry(...)` constructor call.

Confirm `lib/security/bundle_verifier.dart` has `kBundleSigningPublicKey` replaced from the
development placeholder PEM to the real P-256 public key PEM produced in Phase 1 (build-time
substitution — no logic change).

---

## Deliverables

### 1. ModuleDownloadService — ECDSA Verification Step

- type: file
- path: foundry-app/flutter/lib/services/module_download_service.dart
- purpose: Add Step 3 ECDSA verification after checksum; throw BundleSignatureException on failure; log to Sentry; skip check when signature is empty.
- interface:
  - Adds new exception class in the same file:
    ```dart
    class BundleSignatureException implements Exception {
      final String slug;
      final String version;
      BundleSignatureException({required this.slug, required this.version});
      @override
      String toString() =>
          'BundleSignatureException: $slug@$version ECDSA signature invalid';
    }
    ```
  - `ModuleDownloadService.download(ModuleEntry entry, {void Function(double)? onProgress}) async` — return type unchanged (`Future<void>`).
  - Step 3 insertion point: immediately after `if (digest.toString() != entry.checksum)` block, before `await bundleFile.writeAsBytes(bundleBytes)`.
  - Step 3 code shape:
    ```dart
    if (entry.signature.isNotEmpty) {
      final valid = await BundleVerifier.verify(bundleBytes, entry.signature);
      if (!valid) {
        Sentry.captureException(
          BundleSignatureException(slug: entry.slug, version: entry.version),
        );
        throw BundleSignatureException(slug: entry.slug, version: entry.version);
      }
    }
    ```
  - Imports to add: `package:sentry_flutter/sentry_flutter.dart`, `../security/bundle_verifier.dart`.
- constraints:
  - `BundleSignatureException` must NOT be retried (no retry logic anywhere in the call chain for this exception type).
  - `bundle.js` must NOT be written to disk when signature fails (`writeAsBytes` must remain after the new Step 3 block).
  - Sentry must be called with the exception object (not a string message) so that slug and version appear in the Sentry payload.
  - `BundleVerifier.verify` is called with `(bundleBytes, entry.signature)` where `bundleBytes` is `Uint8List` and `entry.signature` is the raw base64 string from `ModuleEntry`.
- edge_cases:
  - `entry.signature == ''`: skip ECDSA check entirely; proceed to `writeAsBytes` — backward compatibility for legacy unsigned modules.
  - `BundleVerifier.verify` returns `false` on malformed base64 or wrong key (per Phase 4 contract): throw `BundleSignatureException` — no special handling needed beyond the false branch.
  - `BundleVerifier.verify` throws an uncaught internal exception: let it propagate up as-is; caller's outer catch in `loading_screen.dart` will handle it as a generic error (does not need to be `BundleSignatureException`).
  - `entry.checksum == ''`: existing behavior — checksum check is skipped; ECDSA check still runs if `entry.signature.isNotEmpty`.
  - Concurrent calls to `download()` for different slugs: no shared mutable state — each call is independent; no lock required.

---

### 2. LoadingScreen — BundleSignatureException Error UI

- type: file
- path: foundry-app/flutter/lib/screens/loading_screen.dart
- purpose: Catch BundleSignatureException explicitly in the download loop; show a persistent error message in the loading screen body; fix the _buildFallbackFromCache() compile error.
- interface:
  - New state field: `String? _signatureError;` (null = no error; non-null = slug of the failed module).
  - Error display: when `_signatureError != null`, the `build()` method renders a `Text` widget with the string `'Module integrity check failed'` (verbatim — this is the string AC-5.3 checks for). The failed slug is shown in a secondary `Text` widget: `'Module: $_signatureError'`.
  - The `CircularProgressIndicator` and progress bar are NOT shown when `_signatureError != null`.
  - Navigation to `DashboardScreen` is blocked when `_signatureError != null` — the `if (!mounted) return;` guard before `Navigator.pushReplacement` must also check `if (_signatureError != null) return;`.
  - New `on BundleSignatureException catch (e)` block is inserted inside the `for` loop after the `on ChecksumMismatchException` block:
    ```dart
    on BundleSignatureException catch (e) {
      Sentry.captureException(e);
      setState(() {
        _signatureError = e.slug;
        _status = 'Module integrity check failed';
        _downloadProgress = null;
      });
      return; // stop processing further modules; do not navigate to DashboardScreen
    }
    ```
  - The outer `catch (e)` block: add an explicit re-throw guard at the top:
    ```dart
    } catch (e) {
      if (e is BundleSignatureException) rethrow;
      print('[LoadingScreen] OTA check failed (continuing): $e');
      setState(() { _downloadProgress = null; });
    }
    ```
    Note: with the inner `on BundleSignatureException` block returning early, `BundleSignatureException` will never reach the outer catch in normal execution. The `rethrow` guard is a defensive belt-and-suspenders measure.
  - `_buildFallbackFromCache()` fix: add `signature: ''` as a named argument to the `ModuleEntry(...)` constructor call on the line that currently omits it.
- constraints:
  - No modal dialog (AlertDialog, showDialog) is used — the error is shown inline in the `_LoadingScreenState.build()` body via `_signatureError` state.
  - The exact string `'Module integrity check failed'` must appear as a `Text` widget value when `_signatureError != null` — this is what AC-5.3 tests for.
  - `Sentry.captureException` is called inside the `on BundleSignatureException` catch block (not before or after the loop).
  - `_buildFallbackFromCache()` must compile after Phase 4 adds `required this.signature` to `ModuleEntry` — `signature: ''` satisfies this.
- edge_cases:
  - Multiple modules attempted before a `BundleSignatureException`: the `return` inside the catch block stops the loop; modules after the failed one are not downloaded.
  - `BundleSignatureException` thrown on retry of same module: not applicable — `BundleSignatureException` does not trigger a retry; the single `return` in the catch block exits immediately.
  - `_signatureError` set while widget is unmounted: the existing `if (!mounted) return;` guard at the top of each `setState` call prevents this.
  - Fallback cache path: `_buildFallbackFromCache()` is only called when `_registry.isEmpty` AND `_signatureError == null` (because the `return` in the catch block prevents reaching the navigation code).

---

### 3. BundleVerifier — Public Key Substitution

- type: file
- path: foundry-app/flutter/lib/security/bundle_verifier.dart
- purpose: Confirm kBundleSigningPublicKey contains the real Phase 1 P-256 public key PEM, not the development placeholder.
- interface:
  - No method signature changes. `static Future<bool> verify(Uint8List bundleBytes, String base64Signature)` is unchanged.
  - `kBundleSigningPublicKey` is a `const String` at file scope. After this phase it must contain a PEM block beginning with `-----BEGIN PUBLIC KEY-----` and ending with `-----END PUBLIC KEY-----`, matching the key produced by `generate_signing_key.js` in Phase 1.
- constraints:
  - This is a build-time substitution only. No runtime key loading. The constant must be hardcoded in the Dart source.
  - If `kBundleSigningPublicKey` still contains the placeholder value from Phase 4, Builder must replace it. If it already contains the real key (Phase 1 output), no change is needed.
- edge_cases:
  - Placeholder PEM left in place: `BundleVerifier.verify()` will return `false` for every module — all modules will throw `BundleSignatureException` at runtime. AC-5.1 would still pass (compile/launch), but AC-5.2 would fail.
  - Malformed PEM (truncated, wrong header): `BundleVerifier.verify()` will return `false` per Phase 4 contract — same outcome as wrong key.

---

## File Manifest

| filepath | action | description |
|---|---|---|
| foundry-app/flutter/lib/services/module_download_service.dart | modify | Add BundleSignatureException class; add Step 3 ECDSA verification block; add Sentry.captureException call; add imports for Sentry and BundleVerifier |
| foundry-app/flutter/lib/screens/loading_screen.dart | modify | Add _signatureError state field; add on BundleSignatureException catch block with return; add rethrow guard in outer catch; add error UI in build(); fix _buildFallbackFromCache() compile error; add Sentry import; add BundleSignatureException import |
| foundry-app/flutter/lib/security/bundle_verifier.dart | modify | Replace kBundleSigningPublicKey placeholder PEM with real Phase 1 P-256 public key PEM (build-time substitution only) |
| foundry-app/flutter/test/services/module_download_service_test.dart | create | Unit tests for AC-5.5 (skips ECDSA on empty signature) and AC-5.6 (throws BundleSignatureException on bad signature) |

---

## Acceptance Criteria

- [ ] AC-5.1: Flutter project compiles and runs on connected device
      criterion: The Flutter project at foundry-app/flutter compiles without errors and the app launches to the loading screen on a connected Android or iOS device after all Phase 5 changes are applied.
      test_command: cd foundry-app/flutter && flutter run --release
      pass_condition: exit code 0; app visible on device and no crash within 60 seconds of launch
      blocking: true

- [ ] AC-5.2: PASS case — valid signature loads module in WebView
      criterion: A module with a valid ECDSA P-256 signature (signed by the real Phase 1 private key and served via the upload_module.js script from Phase 2) downloads successfully and its UI renders in the WebView. No BundleSignatureException is thrown. Sentry receives no SecurityException or BundleSignatureException event.
      test_command: Manual device test (see Manual Test Steps step 1)
      pass_condition: Module UI renders in WebView; loading screen navigates to DashboardScreen without showing 'Module integrity check failed'; Sentry dashboard shows no BundleSignatureException event within 60 seconds
      blocking: true

- [ ] AC-5.3: WRONG KEY case — wrong kBundleSigningPublicKey causes all modules to fail
      criterion: When the app is rebuilt with kBundleSigningPublicKey replaced by a different freshly generated P-256 public key PEM, every module download attempt throws BundleSignatureException, the loading screen shows 'Module integrity check failed', and Sentry receives a BundleSignatureException event for the first failing module.
      test_command: Manual device test (see Manual Test Steps step 2)
      pass_condition: Loading screen shows text 'Module integrity check failed'; WebView never loads for any module; Sentry dashboard shows at least one BundleSignatureException event with the correct module slug field
      blocking: true

- [ ] AC-5.4: Download-path tamper rejection — unit test for bad signature
      criterion: When BundleVerifier.verify() returns false (simulated by a mock), ModuleDownloadService.download() throws BundleSignatureException and does NOT call File.writeAsBytes.
      test_command: cd foundry-app/flutter && flutter test test/services/module_download_service_test.dart --name "download throws BundleSignatureException on bad signature"
      pass_condition: exit code 0; test output contains "All tests passed" or "0 failures"; no "FAILED" lines in output
      blocking: true

- [ ] AC-5.5: Legacy unsigned module skips ECDSA check
      criterion: When ModuleEntry.signature is '' (empty string), ModuleDownloadService.download() does not call BundleVerifier.verify() and completes successfully.
      test_command: cd foundry-app/flutter && flutter test test/services/module_download_service_test.dart --name "download skips ECDSA when signature is empty"
      pass_condition: exit code 0; test output contains "All tests passed" or "0 failures"; no "FAILED" lines in output
      blocking: false

- [ ] AC-5.6: BundleSignatureException is not swallowed — propagates to LoadingScreen UI
      criterion: When ModuleDownloadService.download() throws BundleSignatureException, the LoadingScreen sets _signatureError to the slug and renders the text 'Module integrity check failed', and does NOT navigate to DashboardScreen.
      test_command: cd foundry-app/flutter && flutter test test/services/module_download_service_test.dart --name "download throws BundleSignatureException on bad signature"
      pass_condition: exit code 0; test output contains "All tests passed" or "0 failures"; no "FAILED" lines in output
      blocking: true
      note: AC-5.6 shares the same unit test file as AC-5.4. A separate widget test for LoadingScreen is out of scope (see Out Of Scope). The unit test for AC-5.4 demonstrates the exception is thrown and not swallowed at the service layer. Manual Test Step 2 (wrong-key case) demonstrates the UI path.

- [ ] AC-5.7: Application Launch Verification
      criterion: Built application launches successfully on target device without crash after all Phase 5 changes are applied.
      test_command: cd foundry-app/flutter && flutter run -d android
      pass_condition: exit code 0 AND app visible on device within 60 seconds AND no unhandled exception in device log
      blocking: true
      environment: Android API 21+ (minimum), API 34+ (target); iOS 14+ also supported

---

## Dependencies

- name: sentry_flutter
  version: "^7.18.0"
  install_command: flutter pub add sentry_flutter
  note: Must already be initialised in lib/main.dart (pre-existing from Phase 9/10). Builder must confirm Sentry.init(...) is present in main.dart before using Sentry.captureException. If not present, initialisation is out of scope for this phase — raise as a blocker.

- name: cryptography
  version: "^2.7.0"
  install_command: flutter pub add cryptography
  note: Received from Phase 4. Already in pubspec.yaml and resolved. No action needed unless flutter pub get has not been run.

---

## Environment Requirements

- Flutter SDK: 3.16.x or higher
- Java: JDK 17 or higher
- Gradle: 7.5 or higher (configured in gradle-wrapper.properties)
- Android SDK: API 21+ minimum, API 34+ target
- Dart SDK: 3.x (bundled with Flutter 3.16+)
- Sentry project: pre-existing Sentry DSN configured in lib/main.dart (Phase 9/10 deliverable)

---

## Out Of Scope

What Builder must NOT build in this phase:

- BundleVerifier.verify() logic: delivered in Phase 4; Builder reads but does not modify the verify() method body
- ModuleEntry Dart class changes: delivered in Phase 4; Builder must not add or remove fields
- Database migration or API changes: delivered in Phases 1–3
- upload_module.js signing script: delivered in Phase 2
- Sentry initialisation (Sentry.init in main.dart): pre-existing from Phase 9/10; out of scope for this phase
- Widget test for LoadingScreen error state: a full Flutter widget test for the BundleSignatureException UI path (using flutter_test WidgetTester) is out of scope; unit tests at the service layer plus the manual wrong-key test provide sufficient coverage
- On-disk bundle.js re-verification at serve time: verification only happens in the download path (BEFORE writeAsBytes), not when loading a cached bundle.js into the WebView
- TAMPER manual test step: removed per user Q2 answer C; unit-level ACs (AC-5.4, AC-5.5) provide download-path tamper-rejection coverage at the unit level
- Certificate pinning or TLS configuration: not part of this phase
- Key rotation mechanism: not part of this phase

---

## Phase Boundaries

### Receives From Previous Phase

- ModuleEntry: `{ slug: String, name: String, version: String, cdnUrl: String, indexUrl: String, checksum: String, signature: String }` — Dart class with all fields required (signature maps from api_module_response.signature; empty string for legacy modules)
- BundleVerifier: `{ class: "BundleVerifier", method: "verify", signature: "static Future<bool> verify(Uint8List bundleBytes, String base64Signature)" }` — ECDSA P-256 verifier; returns true on valid signature, false on invalid or malformed input
- pubspec_cryptography_dep: `{ package: "cryptography", version: "^2.7.0", resolved: true }` — dependency present and flutter pub get succeeds

### Provides To Next Phase

none — this is the final phase (PROVIDES_TO: final)

---

## Manual Test Steps

1. PASS case: clean-install the app on a real Android or iOS device (no cached modules). Use a correctly signed module deployed via upload_module.js from Phase 2.
   Action: Launch app, observe loading screen.
   Expected: Loading screen shows "Loading modules...", all modules render in WebView on DashboardScreen, no 'Module integrity check failed' text visible, Sentry receives no BundleSignatureException event.

2. WRONG KEY case: rebuild the app with `kBundleSigningPublicKey` in lib/security/bundle_verifier.dart replaced by a freshly generated (different) P-256 public key PEM (any valid P-256 public key that is not the Phase 1 key). Install on device. Launch.
   Action: Launch app, observe loading screen.
   Expected: Loading screen shows 'Module integrity check failed' text; secondary text shows the failing module slug; WebView never loads; app does NOT navigate to DashboardScreen; Sentry dashboard shows a BundleSignatureException event with the correct module slug and version within 60 seconds.

3. Restore and verify recovery: rebuild with the correct `kBundleSigningPublicKey` (Phase 1 key). Reinstall on device. Launch.
   Expected: All modules pass verification and load normally; full normal flow restores; no error screen.

---

## Phase Achievement

Every module bundle downloaded on-device is now cryptographically verified via ECDSA P-256 before being written to the filesystem and served to the WebView — Milestone F is complete and the full trust chain (download → checksum → ECDSA signature) is enforced end-to-end on every module load.

---

## Validation Notes

### Ambiguities Resolved

- "error screen" (plan.md, AC-5.3): resolved to inline error text in LoadingScreen body via `_signatureError` state field. The exact string `'Module integrity check failed'` is set on `_status` and displayed in the existing `Text(_status)` widget. A separate `Text('Module: $_signatureError')` shows the slug. No modal dialog (AlertDialog) is used — Q1 answer A selected option (2): outer catch re-throws, plus inner block returns early.
- "delete the downloaded file" (REQ-VERIFY-FLOW): resolved as no-op in this implementation. The signature check occurs BEFORE `writeAsBytes` (per locked context), so no file has been written to disk at the point of failure. No delete call is needed or correct. The "delete file" language in REQ-VERIFY-FLOW refers to the design intent (don't leave a bad file on disk) — satisfied by never writing it in the first place.
- "Sentry must already be initialised in main.dart (pre-existing from Phase 9/10)": resolved as a pre-condition check. Builder must verify `Sentry.init(...)` is present in lib/main.dart before using `Sentry.captureException`. If missing, that is a blocker raised to the Orchestrator — not a Phase 5 deliverable.
- REQ-VERIFY-FLOW uses "SecurityException" while all other references use "BundleSignatureException": treated as the same class; BundleSignatureException is the canonical name (matches locked context and all ACs).

### Assumptions Made

- `lib/security/bundle_verifier.dart` does not exist yet on disk (Phase 4 has not been built). Builder will receive it as input from the Phase 4 built.md interface. The path `foundry-app/flutter/lib/security/bundle_verifier.dart` is the expected delivery path.
- `test/services/` directory does not currently exist in foundry-app/flutter/test/. Builder must create it.
- `sentry_flutter` package: assumed already present in pubspec.yaml from Phase 9/10. If not, Builder must add it using the install_command above and confirm Sentry.init is in main.dart.
- `ModuleEntry` constructor: after Phase 4, all fields are `required`. The `_buildFallbackFromCache()` fix (`signature: ''`) satisfies the required constraint for the signature field — this is correct per locked context which states "ModuleEntry.signature: String (empty string for legacy/null)".

### Q&A References

- Q1 answered (loading_screen.dart scope): Option A — add loading_screen.dart as a full Phase 5 deliverable. Fix compile error (signature: '' in _buildFallbackFromCache). Show error screen on BundleSignatureException. Do NOT silently swallow it.
- Q2 answered (TAMPER test case): Option C — remove the TAMPER manual test step entirely. The download-time verification unit tests (AC-5.4, AC-5.5) are sufficient to prove tamper rejection. Manual Test Step 3 (TAMPER) is removed from this validated.md; Manual Test Step 4 (WRONG KEY) is renumbered to step 2; Manual Test Step 5 (Restore) is renumbered to step 3.

### Self-Check Record

- [x] All required sections present
- [x] PHASE_ID, VALIDATED, VALIDATOR_CYCLE, VALIDATOR_DOC_VERSION, DRIFT_CHECK_STATUS fields present
- [x] What To Build > 50 words, no vague terms
- [x] Three deliverables defined, each with type/path/purpose/interface/constraints/edge_cases
- [x] File Manifest lists all four files (3 modify + 1 create)
- [x] Seven ACs defined, each with criterion/test_command/pass_condition/blocking
- [x] No test_command is a no-op (no echo, true, exit 0)
- [x] AC-5.7 Launch Verification AC present (schema requirement for executable phase)
- [x] Environment Requirements section present
- [x] Out Of Scope section present and non-empty; TAMPER step explicitly called out
- [x] Phase Boundaries present; Receives From Previous Phase matches Phase 4 interface-check.md exactly; Provides To Next Phase = none (final phase)
- [x] No vague terms (no "fast", "secure", "clean", "handle errors" without specifics)
- [x] No placeholder text (no TBD, TODO, {fill in})
- [x] DRIFT_CHECK_STATUS: NOT_APPLICABLE (cycle 1)
- [x] VALIDATOR_CYCLE: 1
