# Phase 4 — Flutter Model and Verifier
PHASE_ID: phase-4-flutter-model-and-verifier
PLANNER_DOC_VERSION: 1.0
DEPENDS_ON: [phase-3-api-signature-field]
PROVIDES_TO: [phase-5-flutter-verification-integration]

## What This Phase Builds
This phase adds two Flutter-side building blocks: the updated `ModuleEntry` model (adding the `signature` field and updating `fromJson`) and the new `BundleVerifier` class in `lib/security/bundle_verifier.dart` that holds the hardcoded public key constant and exposes the static `verify()` method. After this phase, the cryptographic verification logic exists as a standalone, independently testable Dart unit — but it is not yet wired into the download flow. The `cryptography` package is also added to `pubspec.yaml`.

## Requirements Covered
- REQ-MODEL: lib/services/module_registry_service.dart — add `signature: String` field to `ModuleEntry`; update constructor and `fromJson()` to parse the `signature` key from the API JSON (default to empty string if absent, for backward compatibility with unsigned legacy modules)
- REQ-PUBSPEC: pubspec.yaml — add `cryptography: ^2.7.0` dependency for ECDSA P-256 verification in Dart
- REQ-VERIFIER: lib/security/bundle_verifier.dart (new file) — `const String kBundleSigningPublicKey` hardcoded PEM constant; `class BundleVerifier { static Future<bool> verify(Uint8List bundleBytes, String base64Signature) }` using the `cryptography` package's EcdsaP256 algorithm; returns false (does not throw) on malformed input so callers can distinguish crypto failure from network failure

## Deliverables
- [ ] lib/services/module_registry_service.dart (modified): `ModuleEntry` gains `final String signature` field; constructor updated; `fromJson()` parses `j['signature'] as String? ?? ''`
- [ ] lib/security/bundle_verifier.dart (new file): hardcoded `kBundleSigningPublicKey` PEM constant; `BundleVerifier.verify(Uint8List bundleBytes, String base64Signature) -> Future<bool>`
- [ ] pubspec.yaml (modified): `cryptography: ^2.7.0` added under dependencies

## Inputs From Previous Phase
- api_module_response: { id: string, slug: string, name: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string, size_kb: number, permissions: string[] } — full shape of each element in the `modules` array returned by GET /api/modules; signature is always present (empty string when DB value is NULL)
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — exact encoding contract forwarded unchanged to Flutter

## Outputs To Next Phase
- ModuleEntry: { slug: string, name: string, version: string, cdnUrl: string, indexUrl: string, checksum: string, signature: string } — updated Dart class with signature field; signature maps from api_module_response.signature
- BundleVerifier: { class: "BundleVerifier", method: "verify", signature: "static Future<bool> verify(Uint8List bundleBytes, String base64Signature)" } — ready-to-call verifier; returns true on valid signature, false on invalid or malformed
- pubspec_cryptography_dep: { package: "cryptography", version: "^2.7.0", resolved: true } — dependency added and `flutter pub get` succeeds

## Acceptance Criteria
- [ ] AC-4.1
      criterion: `flutter pub get` completes without error after adding the cryptography dependency
      test_command: cd foundry-app/flutter && flutter pub get
      pass_condition: exit code 0; no "version solving failed" in output
      blocking: true

- [ ] AC-4.2
      criterion: ModuleEntry.fromJson correctly parses the `signature` field from a JSON map
      test_command: cd foundry-app/flutter && flutter test test/services/module_registry_service_test.dart --name "ModuleEntry fromJson parses signature"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

- [ ] AC-4.3
      criterion: ModuleEntry.fromJson sets signature to empty string when the `signature` key is absent in JSON
      test_command: cd foundry-app/flutter && flutter test test/services/module_registry_service_test.dart --name "ModuleEntry fromJson missing signature defaults to empty"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

- [ ] AC-4.4
      criterion: BundleVerifier.verify returns true when given valid bundle bytes and a correct base64 DER signature produced by the matching private key
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns true for valid signature"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

- [ ] AC-4.5
      criterion: BundleVerifier.verify returns false (does not throw) when the signature is tampered with
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for tampered signature"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

- [ ] AC-4.6
      criterion: BundleVerifier.verify returns false (does not throw) when the public key constant is replaced with a different key
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for wrong public key"
      pass_condition: exit code 0; test output shows 0 failures
      blocking: true

- [ ] AC-4.7
      criterion: The Flutter project compiles without analysis errors after model and verifier changes
      test_command: cd foundry-app/flutter && flutter analyze --no-fatal-infos
      pass_condition: exit code 0; output contains "No issues found"
      blocking: true

## Manual Test Steps
1. Open `lib/services/module_registry_service.dart` → Expected: `ModuleEntry` has a `signature` field declared as `final String signature` and the `fromJson` factory reads `j['signature'] as String? ?? ''`
2. Open `lib/security/bundle_verifier.dart` → Expected: file contains `const String kBundleSigningPublicKey` with a PEM public key block, and `BundleVerifier.verify` method with signature `static Future<bool> verify(Uint8List bundleBytes, String base64Signature)`
3. Open `pubspec.yaml` → Expected: `cryptography: ^2.7.0` appears under dependencies
4. Run `flutter pub get` → Expected: resolves without version conflicts; `.dart_tool/package_config.json` updated
5. Run `flutter analyze` → Expected: exits 0 with no issues; no "undefined class" or "missing field" errors

## Phase Achievement
The Flutter project can parse module signatures from the API response and verify ECDSA P-256 signatures in Dart — both as independently testable units, ready to be wired into the download flow in the next phase.
