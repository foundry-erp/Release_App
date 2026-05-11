# Phase 5 — Flutter Verification Integration
PHASE_ID: phase-5-flutter-verification-integration
PLANNER_DOC_VERSION: 1.0
DEPENDS_ON: [phase-4-flutter-model-and-verifier]
PROVIDES_TO: [final]

## What This Phase Builds
This phase wires `BundleVerifier.verify()` into the live download flow inside `ModuleDownloadService.download()`. After SHA-256 checksum passes (existing Step 2), the service now calls `BundleVerifier.verify()` as Step 3. A failed signature throws a new `BundleSignatureException`, deletes the downloaded file, and logs a Sentry event. After this phase the full trust chain — download → checksum → ECDSA signature — is enforced on every module load on a real device.

## Requirements Covered
- REQ-VERIFY-FLOW: lib/services/module_download_service.dart — after checksum passes, call BundleVerifier.verify(bundleBytes, entry.signature); if false: delete file, throw SecurityException, log to Sentry
- REQ-EXCEPTION: new BundleSignatureException class — carries module slug and version for Sentry context
- REQ-SENTRY: Sentry.captureException(BundleSignatureException(...)) on verification failure; Sentry must already be initialised in main.dart (pre-existing from Phase 9/10)
- REQ-MILESTONE-F: all three Milestone F verification cases must pass on a real device — PASS case, TAMPER case (1 byte flip), WRONG KEY case

## Deliverables
- [ ] lib/services/module_download_service.dart (modified): Step 3 ECDSA verification block added after checksum step; BundleSignatureException thrown on failure; Sentry.captureException called with slug + version context
- [ ] lib/security/bundle_verifier.dart (modified): no new logic — only confirm `kBundleSigningPublicKey` has been updated from the placeholder to the real public key PEM produced in phase 1 (this is a build-time substitution)

## Inputs From Previous Phase
- ModuleEntry: { slug: string, name: string, version: string, cdnUrl: string, indexUrl: string, checksum: string, signature: string } — updated Dart class with signature field; signature maps from api_module_response.signature
- BundleVerifier: { class: "BundleVerifier", method: "verify", signature: "static Future<bool> verify(Uint8List bundleBytes, String base64Signature)" } — ready-to-call verifier; returns true on valid signature, false on invalid or malformed
- pubspec_cryptography_dep: { package: "cryptography", version: "^2.7.0", resolved: true } — dependency added and `flutter pub get` succeeds

## Outputs To Next Phase
none

## Acceptance Criteria
- [ ] AC-5.1
      criterion: Flutter project compiles and runs on a connected device after the download-flow change
      test_command: cd foundry-app/flutter && flutter run --release
      pass_condition: exit code 0; app launches to loading screen without crash
      blocking: true

- [ ] AC-5.2
      criterion: PASS case — a module with a valid ECDSA signature loads successfully in the WebView on a real device
      test_command: Manual device test (see Manual Test Steps step 2)
      pass_condition: Module UI renders in WebView; no error screen; Sentry receives no SecurityException event
      blocking: true

- [ ] AC-5.3
      criterion: TAMPER case — flipping 1 byte in the cached bundle.js causes signature verification to fail, the error screen is shown, and Sentry receives a BundleSignatureException event
      test_command: Manual device test (see Manual Test Steps step 3)
      pass_condition: App shows error screen "Module integrity check failed"; Sentry dashboard shows a BundleSignatureException with the correct module slug and version; WebView does not load
      blocking: true

- [ ] AC-5.4
      criterion: WRONG KEY case — replacing kBundleSigningPublicKey with a different P-256 public key causes verification to fail immediately for all modules
      test_command: Manual device test (see Manual Test Steps step 4)
      pass_condition: All modules show error screen "Module integrity check failed"; no module loads in WebView; Sentry receives BundleSignatureException for each attempted module
      blocking: true

- [ ] AC-5.5
      criterion: Legacy unsigned module (signature = "") is handled gracefully — app skips ECDSA check when signature field is empty and loads module normally (backward-compatibility guard)
      test_command: cd foundry-app/flutter && flutter test test/services/module_download_service_test.dart --name "download skips ECDSA when signature is empty"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: false

- [ ] AC-5.6
      criterion: BundleSignatureException is never swallowed silently — it propagates to the loading screen and is visible in the UI
      test_command: cd foundry-app/flutter && flutter test test/services/module_download_service_test.dart --name "download throws BundleSignatureException on bad signature"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

## Manual Test Steps
1. Clean-install the app on a real Android or iOS device (no cached modules) → Expected: app downloads all modules, checksums pass, ECDSA signatures pass, modules appear in tabs
2. PASS case: with a correctly signed module deployed via upload_module.js from phase 2, restart the app → Expected: loading screen shows "Loading modules...", all modules render in WebView, no error dialogs, Sentry shows no SecurityException
3. TAMPER case: locate the cached bundle.js in device storage (via Android Device File Explorer or iOS Files), open a hex editor, flip byte 0 from its current value, save, restart the app → Expected: loading screen shows "Module integrity check failed" error dialog; WebView never loads; open Sentry and confirm a BundleSignatureException event arrived with the correct module slug
4. WRONG KEY case: rebuild the app with `kBundleSigningPublicKey` replaced by a freshly generated (different) P-256 public key PEM → install on device → restart → Expected: all modules immediately fail ECDSA verification; error screen shows for each module; Sentry captures each event
5. Restore correct public key and deploy: rebuild with correct `kBundleSigningPublicKey`, reinstall → Expected: all modules pass verification again, full normal flow restores

## Phase Achievement
Every module bundle is now cryptographically verified on device before it is served to the WebView — Milestone F is complete and the ECDSA P-256 trust chain is fully enforced end-to-end.
