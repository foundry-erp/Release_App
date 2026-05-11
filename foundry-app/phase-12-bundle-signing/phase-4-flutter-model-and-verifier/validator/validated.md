# Validated Spec — Phase 4: Flutter Model and Verifier
PHASE_ID: phase-4-flutter-model-and-verifier
VALIDATED: 2026-04-15T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE
# NOT_APPLICABLE: cycle 1 — no baseline exists yet

---

## What To Build

This phase delivers two Flutter-side building blocks for ECDSA-P256-SHA256 signature verification.

First, modify `lib/services/module_registry_service.dart` to add a `final String signature` field to the `ModuleEntry` class, update its constructor to require `signature`, and update `ModuleEntry.fromJson()` to parse `j['signature']` as `String?` with a `?? ''` fallback so that legacy modules whose API response contains JSON null are represented as empty string rather than causing a null dereference.

Second, create `lib/security/bundle_verifier.dart` as a new file containing: (a) the `const String kBundleSigningPublicKey` top-level constant, which holds the PEM-encoded SPKI public key (the `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` block produced by Phase 1's `generate_signing_key.js` for the production P-256 key pair); and (b) the `BundleVerifier` class with the single static method `Future<bool> verify(Uint8List bundleBytes, String base64Signature)` that decodes the base64 DER signature, parses the SPKI PEM key to extract the raw 64-byte uncompressed P-256 point, constructs an `EcdsaP256(Sha256())` verifier from the `cryptography` package, and returns `true` on a verified signature or `false` (never throws) on any failure including malformed base64, invalid DER, wrong signature length, or cryptographic mismatch.

Third, add `cryptography: ^2.7.0` under the `dependencies` section of `pubspec.yaml`.

This phase does NOT wire `BundleVerifier.verify()` into the download flow. Verification integration is deferred to Phase 5.

---

## Deliverables

### ModuleEntry Model — lib/services/module_registry_service.dart
- type: file
- path: foundry-app/flutter/lib/services/module_registry_service.dart
- purpose: Extends the ModuleEntry class to carry the ECDSA signature string received from the API, so downstream code (Phase 5) can pass it to BundleVerifier.
- interface:
  - Class: `ModuleEntry`
  - New field: `final String signature` — required named parameter in constructor
  - Updated constructor:
    ```dart
    ModuleEntry({
      required this.slug,
      required this.name,
      required this.version,
      required this.cdnUrl,
      required this.indexUrl,
      required this.checksum,
      required this.signature,
    });
    ```
  - Updated factory:
    ```dart
    factory ModuleEntry.fromJson(Map<String, dynamic> j) => ModuleEntry(
          slug:      j['slug']      as String,
          name:      j['name']      as String,
          version:   j['version']   as String,
          cdnUrl:    j['cdn_url']   as String,
          indexUrl:  j['index_url'] as String,
          checksum:  j['checksum']  as String,
          signature: (j['signature'] as String?) ?? '',
        );
    ```
  - All existing methods (`fetchRegistry`, `loadLocalCache`, `getOutdatedModules`, `updateCacheEntry`, `pruneRevokedModules`) are unchanged in behaviour. No method signatures are altered.
- constraints:
  - The `signature` field MUST be `final String` (not nullable: `String?`). Null safety is achieved by the `?? ''` fallback in `fromJson`.
  - The `fromJson` cast MUST be `(j['signature'] as String?) ?? ''` — NOT `j['signature'] as String` (throws on null), NOT `j['signature'] ?? ''` without the cast (type error in sound null safety mode), NOT `j['signature'].toString()` (returns the string `"null"` when value is JSON null).
  - No other fields in `ModuleEntry` may be added, removed, renamed, or retyped.
  - No imports may be removed. No new imports are required for this change.
  - The file remains a Dart library with no `part of` directive; it is not split.
- edge_cases:
  - **API returns `"signature": null` (JSON null)**: `j['signature']` evaluates to `null` in Dart; `as String?` succeeds (null is a valid String?); `?? ''` yields `''`. `ModuleEntry.signature` is `''`. No exception thrown.
  - **API returns `"signature": "<base64>"` (non-empty string)**: Cast succeeds; `?? ''` is not triggered. `ModuleEntry.signature` is the base64 string.
  - **API returns `"signature": ""` (empty string)**: Cast succeeds; `?? ''` is not triggered (empty string is not null). `ModuleEntry.signature` is `''`.
  - **API response JSON does not contain the `signature` key at all** (legacy server): `j['signature']` evaluates to `null` (missing key in a `Map<String, dynamic>` returns null); the `?? ''` fallback applies. `ModuleEntry.signature` is `''`. No exception thrown.
  - **Concurrent calls to `fetchRegistry`**: No shared mutable state in `ModuleEntry`; each call constructs independent instances. No race condition.

### Bundle Verifier — lib/security/bundle_verifier.dart
- type: file
- path: foundry-app/flutter/lib/security/bundle_verifier.dart
- purpose: Provides the standalone ECDSA-P256-SHA256 verification logic as a testable Dart unit, with the production public key hardcoded as a PEM constant.
- interface:
  - Top-level constant:
    ```dart
    const String kBundleSigningPublicKey = '''
    -----BEGIN PUBLIC KEY-----
    <base64-encoded SPKI DER of the P-256 public key from Phase 1>
    -----END PUBLIC KEY-----
    ''';
    ```
    The value is the PEM block produced by Phase 1's `generate_signing_key.js` `--export-public` output. Builder copies the exact PEM string into this constant.
  - Class: `BundleVerifier`
  - Method:
    ```dart
    static Future<bool> verify(Uint8List bundleBytes, String base64Signature)
    ```
  - Return contract:
    - Returns `true` if and only if `base64Signature` is a valid base64-encoded DER-encoded ECDSA-P256-SHA256 signature over `bundleBytes` that verifies against `kBundleSigningPublicKey`.
    - Returns `false` in ALL other cases — including but not limited to: malformed base64, invalid DER structure, signature length outside the valid ECDSA-P256 DER range (70–72 bytes decoded), empty `base64Signature`, empty `bundleBytes`, wrong key, tampered bytes.
    - NEVER throws. All exceptions caught internally; return `false` on any caught exception.
  - Required imports in the file:
    - `dart:convert` (for `base64Decode`)
    - `dart:typed_data` (for `Uint8List`)
    - `package:cryptography/cryptography.dart`
  - Cryptography package usage:
    - Algorithm: `EcdsaP256(Sha256())` — from `package:cryptography/cryptography.dart`
    - Key format: The SPKI DER bytes encode the uncompressed P-256 public key point. Builder must strip PEM headers/footers and whitespace, base64-decode the remaining data to get the SPKI DER bytes, then extract the 64-byte raw public key (the 65-byte uncompressed point `04 || x || y` minus the `04` prefix) to construct a `SimplePublicKey` with `type: KeyPairType.p256`.
    - Signature format: base64-decode `base64Signature` to get DER bytes; use `Signature(derBytes, publicKey: publicKey)` when calling `ecdsa.verify()`.
- constraints:
  - `kBundleSigningPublicKey` MUST be a compile-time `const String`. It MUST NOT be computed at runtime.
  - `verify()` MUST be `static` and `Future<bool>`. It MUST NOT be instance-based.
  - `verify()` MUST NOT rethrow any exception. The entire body MUST be wrapped in try/catch.
  - `verify()` MUST NOT accept a public key parameter — the key is always `kBundleSigningPublicKey`. Parameterising the key is Phase 5 scope, not Phase 4.
  - The file MUST be a standalone library (`lib/security/bundle_verifier.dart`) — not embedded in another file.
  - No network calls, file I/O, or platform channels may be made inside `verify()`.
  - The `cryptography` package version used is `^2.7.0`. No other cryptography packages may be introduced.
- edge_cases:
  - **`base64Signature` is `''` (empty string)**: `base64Decode('')` returns empty `Uint8List`; DER parsing fails or signature is invalid length; caught in try/catch; returns `false`.
  - **`base64Signature` contains non-base64 characters** (e.g., `'!!!not_base64!!!'`): `base64Decode()` throws `FormatException`; caught; returns `false`.
  - **`base64Signature` is valid base64 but decodes to wrong length** (e.g., 10 bytes instead of 70–72 for ECDSA-P256 DER): DER parsing or cryptography package verification fails; caught; returns `false`.
  - **`bundleBytes` is `Uint8List(0)` (empty bytes)**: A signature cannot match empty content signed with non-empty content; verification returns `false`. If caller passes empty bytes with a signature over non-empty content, `verify()` returns `false` (not `true`).
  - **`kBundleSigningPublicKey` is structurally malformed** (e.g., developer accidentally corrupts the constant): PEM decode or SPKI parse throws; caught in try/catch at the top of `verify()`; returns `false`.
  - **Signature is for correct bytes but signed with a different private key**: Cryptographic verification fails; cryptography package returns `false` from `ecdsa.verify()`; `verify()` returns `false`.
  - **Signature bytes are valid DER but one byte is flipped (tampered)**: Cryptographic verification fails; returns `false`.
  - **Concurrent calls to `verify()`**: `verify()` is `static` and creates no shared mutable state (all locals are per-invocation); safe to call concurrently from multiple isolates.

### pubspec.yaml — Cryptography Dependency
- type: config
- path: foundry-app/flutter/pubspec.yaml
- purpose: Declares the `cryptography` package as a runtime dependency so `flutter pub get` resolves it and makes it available to `bundle_verifier.dart`.
- interface:
  - Addition under the `dependencies:` section:
    ```yaml
      # Bundle signing verification (phase-12-bundle-signing)
      cryptography: ^2.7.0
    ```
  - Placement: after the existing `# Crypto (Phase 3 checksum)` / `crypto: ^3.0.3` entry, before the `# Phase 4: Native capabilities` block. Exact placement within `dependencies` is flexible as long as it is under `dependencies:` (not `dev_dependencies:`).
  - No other lines in `pubspec.yaml` may be added, removed, or modified.
- constraints:
  - Version constraint MUST be `^2.7.0` — not `>=2.7.0`, not `2.7.0`, not `any`.
  - The package MUST be listed under `dependencies:`, not `dev_dependencies:`. It is needed at runtime by `BundleVerifier`.
  - `flutter pub get` must succeed after this change with exit code 0 and no "version solving failed" output. If a version conflict occurs with an existing transitive dependency, Builder must report the conflict — this validated spec does not pre-authorize changing other version constraints.
- edge_cases:
  - **`cryptography ^2.7.0` conflicts with an existing transitive dependency**: `flutter pub get` exits non-zero with "version solving failed". Builder must not silently lower the constraint — must report to Orchestrator.
  - **`cryptography` already present in pubspec.yaml at a different version**: Unlikely given current pubspec.yaml content (confirmed absent). If present, Builder must align to `^2.7.0`.
  - **`cryptography` and the existing `crypto` package conflict**: `crypto` is a `dart:crypto` wrapper for hashing; `cryptography` is a separate package. No known conflict. If one arises, Builder reports it rather than silently resolving.

---

## File Manifest

| filepath | action | description |
|----------|--------|-------------|
| foundry-app/flutter/lib/services/module_registry_service.dart | MODIFY | Add `final String signature` field to ModuleEntry; update constructor; update fromJson to use `(j['signature'] as String?) ?? ''` |
| foundry-app/flutter/lib/security/bundle_verifier.dart | CREATE | New file: `kBundleSigningPublicKey` PEM constant + `BundleVerifier.verify(Uint8List, String) -> Future<bool>` |
| foundry-app/flutter/pubspec.yaml | MODIFY | Add `cryptography: ^2.7.0` under dependencies |
| foundry-app/flutter/test/services/module_registry_service_test.dart | CREATE | Unit tests for ModuleEntry.fromJson signature parsing (AC-4.2, AC-4.3) |
| foundry-app/flutter/test/security/bundle_verifier_test.dart | CREATE | Unit tests for BundleVerifier.verify (AC-4.4, AC-4.5, AC-4.6, AC-4.8, AC-4.9, AC-4.10) |

---

## Acceptance Criteria

- [ ] AC-4.1: flutter pub get resolves cryptography dependency
      criterion: Running `flutter pub get` in the flutter project directory completes with exit code 0, adds `cryptography` to `.dart_tool/package_config.json`, and produces no "version solving failed" output.
      test_command: cd foundry-app/flutter && flutter pub get 2>&1 | tee /tmp/pubget_output.txt; grep -c "version solving failed" /tmp/pubget_output.txt | grep -q "^0$" && grep -q "cryptography" .dart_tool/package_config.json && echo "PASS" || echo "FAIL"
      pass_condition: stdout contains exactly the string PASS
      blocking: true

- [ ] AC-4.2: ModuleEntry.fromJson parses signature field from JSON
      criterion: `ModuleEntry.fromJson({'slug':'s','name':'n','version':'1.0.0','cdn_url':'https://cdn.example.com/b.js','index_url':'https://cdn.example.com/index.js','checksum':'abc123','signature':'MEYCIQDtest=='})` constructs a `ModuleEntry` whose `signature` field equals `'MEYCIQDtest=='`.
      test_command: cd foundry-app/flutter && flutter test test/services/module_registry_service_test.dart --name "ModuleEntry fromJson parses signature"
      pass_condition: exit code 0 and test output contains "All tests passed" or "0 failures" or "+1:" with no failures listed
      blocking: true

- [ ] AC-4.3: ModuleEntry.fromJson sets signature to empty string when key is absent or null
      criterion: (a) `ModuleEntry.fromJson({...all required keys except signature...})` yields `signature == ''`; (b) `ModuleEntry.fromJson({...all required keys..., 'signature': null})` yields `signature == ''`. Neither call throws.
      test_command: cd foundry-app/flutter && flutter test test/services/module_registry_service_test.dart --name "ModuleEntry fromJson missing signature defaults to empty"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.4: BundleVerifier.verify returns true for valid signature
      criterion: `BundleVerifier.verify(bundleBytes, validBase64Sig)` returns `true` when `validBase64Sig` is a precomputed base64-encoded ECDSA-P256-SHA256 DER signature over `bundleBytes` produced by the private key corresponding to `kBundleSigningPublicKey`. The test file contains the fixture bytes and signature as hardcoded constants generated offline by the Builder using Phase 1's key material.
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns true for valid signature"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.5: BundleVerifier.verify returns false for tampered signature
      criterion: `BundleVerifier.verify(bundleBytes, tamperedBase64Sig)` returns `false` and does not throw, where `tamperedBase64Sig` is the valid fixture signature from AC-4.4 with one byte flipped before re-encoding to base64.
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for tampered signature"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.6: BundleVerifier.verify returns false when signature was produced by a different key
      criterion: `BundleVerifier.verify(bundleBytes, wrongKeySig)` returns `false` and does not throw, where `wrongKeySig` is a base64-encoded ECDSA-P256-SHA256 DER signature over the same `bundleBytes` but signed using a separate test P-256 private key whose corresponding public key differs from `kBundleSigningPublicKey`.
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for wrong public key"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.7: Flutter project compiles without analysis errors
      criterion: `flutter analyze --no-fatal-infos` on the flutter project directory exits with code 0 and the output contains the phrase "No issues found" (case-sensitive, with or without trailing exclamation mark).
      test_command: cd foundry-app/flutter && flutter analyze --no-fatal-infos 2>&1 | tee /tmp/analyze_output.txt; grep -qi "no issues found" /tmp/analyze_output.txt && echo "PASS" || cat /tmp/analyze_output.txt && echo "FAIL"
      pass_condition: stdout contains the string PASS on its own line
      blocking: true

- [ ] AC-4.8: BundleVerifier.verify returns false for empty signature string
      criterion: `BundleVerifier.verify(Uint8List.fromList([1,2,3]), '')` returns `false` and does not throw.
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for empty signature"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.9: BundleVerifier.verify returns false for non-base64 garbage input
      criterion: `BundleVerifier.verify(Uint8List.fromList([1,2,3]), '!!!not_base64!!!')` returns `false` and does not throw (no FormatException propagates to caller).
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for non-base64 signature"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

- [ ] AC-4.10: BundleVerifier.verify returns false for empty bundle bytes
      criterion: `BundleVerifier.verify(Uint8List(0), validBase64Sig)` returns `false` and does not throw, where `validBase64Sig` is the same valid fixture signature from AC-4.4 (which was produced over non-empty bytes).
      test_command: cd foundry-app/flutter && flutter test test/security/bundle_verifier_test.dart --name "BundleVerifier verify returns false for empty bundle bytes"
      pass_condition: exit code 0 and test output contains no failures
      blocking: true

---

## Dependencies

- name: cryptography
  version: ^2.7.0
  install_command: cd foundry-app/flutter && flutter pub add cryptography:'^2.7.0'

- name: flutter_test (existing dev dependency)
  version: sdk: flutter (existing — no change)
  install_command: none — already present in pubspec.yaml dev_dependencies

---

## Out Of Scope

What Builder must NOT build in this phase:

- **Wiring `BundleVerifier.verify()` into the download flow**: deferred to phase-5-flutter-verification-integration. `BundleVerifier` is standalone only. No call site other than the test file may invoke `verify()` in this phase.
- **Calling `BundleVerifier.verify()` from `ModuleRegistryService` or any existing service**: deferred to phase-5-flutter-verification-integration.
- **UI feedback for verification failure** (e.g., error dialogs, blocked install screens): deferred to phase-5-flutter-verification-integration.
- **Dynamic / runtime public key loading** (fetching key from server, reading from file, reading from environment): the key is hardcoded as `kBundleSigningPublicKey` in source. No runtime key loading mechanism is built in this phase.
- **Key rotation logic**: deferred entirely — not part of phase-12-bundle-signing scope.
- **`BundleVerifier` accepting a public key parameter**: the method signature is fixed as `verify(Uint8List bundleBytes, String base64Signature)` with no key parameter. Parameterisation is out of scope.
- **Signature verification for checksum**: `checksum` is a SHA-256 hex string handled by existing logic. `BundleVerifier` handles only the ECDSA `signature` field. The two fields are independent.
- **Backend changes**: no modifications to `backend/api/modules/index.js` or any other server file.
- **Database schema changes**: the `module_versions.signature` column was added in Phase 1 and must not be altered.
- **`lib/security/` directory creation as a package**: the directory is a plain Dart source directory, not a separate Dart package with its own `pubspec.yaml`.

---

## Phase Boundaries

### Receives From Previous Phase
- api_module_response: { id: string, slug: string, name: string, version: string, cdn_url: string, index_url: string, checksum: string, signature: string | null, size_kb: number, permissions: string[] } — full shape of each element in the `modules` array returned by GET /api/modules; `signature` is always present as a key; value is a base64 DER string when the DB column is non-null, or JSON null when the DB column is NULL
- signature_format: { encoding: "base64", structure: "DER", algorithm: "ECDSA-P256-SHA256" } — forwarded unchanged from Phase 2; the encoding contract the Flutter verifier must implement

### Provides To Next Phase
- ModuleEntry: { slug: string, name: string, version: string, cdnUrl: string, indexUrl: string, checksum: string, signature: string } — updated Dart class with signature field; `signature` maps from `api_module_response.signature`; type is `String` (non-nullable; null is collapsed to `''` in fromJson)
- BundleVerifier: { class: "BundleVerifier", method: "verify", signature: "static Future<bool> verify(Uint8List bundleBytes, String base64Signature)" } — ready-to-call verifier; returns true on valid signature, false on invalid or malformed; never throws
- pubspec_cryptography_dep: { package: "cryptography", version: "^2.7.0", resolved: true } — dependency added and `flutter pub get` succeeds

---

## Manual Test Steps

1. Open `foundry-app/flutter/lib/services/module_registry_service.dart` → Expected: `ModuleEntry` has `final String signature` declared as the last field; constructor has `required this.signature`; `fromJson` contains `signature: (j['signature'] as String?) ?? ''`.
2. Open `foundry-app/flutter/lib/security/bundle_verifier.dart` → Expected: file contains `const String kBundleSigningPublicKey` with a `-----BEGIN PUBLIC KEY-----` / `-----END PUBLIC KEY-----` PEM block; `BundleVerifier` class present; `static Future<bool> verify(Uint8List bundleBytes, String base64Signature)` method present; entire body wrapped in try/catch returning false on exception.
3. Open `foundry-app/flutter/pubspec.yaml` → Expected: `cryptography: ^2.7.0` appears under `dependencies:` (not under `dev_dependencies:`).
4. Run `flutter pub get` in `foundry-app/flutter/` → Expected: exits 0; no "version solving failed"; `.dart_tool/package_config.json` contains an entry for `cryptography`.
5. Run `flutter analyze --no-fatal-infos` in `foundry-app/flutter/` → Expected: exits 0; output contains "No issues found" (or "No issues found!"). No "undefined class BundleVerifier", no "undefined getter signature", no "The method 'verify' isn't defined" errors.
6. Run `flutter test test/services/module_registry_service_test.dart` in `foundry-app/flutter/` → Expected: all tests pass; 0 failures; covers signature field parsing with a value, with null, and with the key absent.
7. Run `flutter test test/security/bundle_verifier_test.dart` in `foundry-app/flutter/` → Expected: all tests pass; 0 failures; covers valid signature (true), tampered signature (false), wrong key (false), empty signature string (false), non-base64 input (false), empty bundle bytes (false).

---

## Phase Achievement

After this phase, the Flutter project contains a `ModuleEntry` model that carries the ECDSA signature from the API response and a `BundleVerifier` class that can verify ECDSA-P256-SHA256 signatures using the hardcoded production public key — both as independently unit-tested Dart components ready to be wired into the download flow in Phase 5.

---

## Environment Requirements

- Flutter SDK: 3.0.0 or higher (environment SDK constraint: `>=3.0.0 <4.0.0`)
- Dart SDK: 3.0.0 or higher (included with Flutter 3.0.0+)
- cryptography package: 2.7.0 or higher within the `^2.7.0` range (Dart-native ECDSA-P256 support available from 2.5.0+)
- Platform: Android API 21+ or iOS 12+ (existing project minimum — no change from this phase)
- No additional build tools, native SDKs, or platform-specific configuration required by the `cryptography` package (pure Dart implementation for P-256 ECDSA)

---

## Validation Notes

### Ambiguities Resolved

- **"PEM constant" vs "SPKI DER bytes, base64-encoded" (locked context)**:
  plan.md REQ-VERIFIER says `kBundleSigningPublicKey` is a "hardcoded PEM constant". The locked context says "Public key format: SPKI DER bytes, base64-encoded (from generate_signing_key.js output)". These are the same thing: a PEM block wraps base64-encoded DER bytes. The `generate_signing_key.js` output produces a `-----BEGIN PUBLIC KEY-----` block, which is SPKI DER in PEM armor. The `cryptography` package requires raw key bytes, so Builder must strip the PEM headers and base64-decode. This is an implementation detail, not a spec gap.

- **`(j['signature'] as String?) ?? ''` vs `j['signature'] as String` (locked context vs direct cast)**:
  Locked context specifies `(j['signature'] as String?) ?? ''`. This is correct for Dart sound null safety: `j['signature']` has static type `dynamic`; casting `null` as `String` throws in sound mode; casting as `String?` succeeds; `?? ''` handles the null case. Alternatives `j['signature'].toString()` (returns `"null"` string for null input) and `j['signature'] ?? ''` (compiles but is imprecise — relies on dynamic null) are both incorrect per the locked context. The `(j['signature'] as String?) ?? ''` form is canonical and mandated.

- **Phase 3 type widening: `signature: string | null` (Phase 3 validated.md)**:
  Phase 3 Validator corrected `api_module_response.signature` from `string` to `string | null` because the API returns JSON null for unsigned modules. Phase 4 Flutter code handles this by collapsing null to `''` in `fromJson`. The `ModuleEntry.signature` field is `String` (non-nullable) — the null is absorbed at the JSON boundary. This design is consistent with the locked context: `(j['signature'] as String?) ?? ''`.

- **`flutter analyze` pass_condition string**:
  plan.md AC-4.7 says `output contains "No issues found"`. The actual Flutter analyzer output string is `"No issues found!"` (with an exclamation mark in recent Flutter SDK versions). The validated AC-4.7 test_command uses a case-insensitive grep for `"no issues found"` to handle both variants (`No issues found` and `No issues found!`).

- **AC-4.4 test fixture source**:
  plan.md says the test verifies `verify()` "returns true when given valid bundle bytes and a correct base64 DER signature produced by the matching private key". Since `kBundleSigningPublicKey` is hardcoded as the production key, the test vector must be a signature produced by the matching production private key (from Phase 1). Builder generates this fixture offline using Phase 1's `sign_bundle.js` or equivalent Node.js `crypto.sign()` call over a small known byte sequence (e.g., `[0x01, 0x02, 0x03]`), then hardcodes both the bytes and the base64 signature as constants in `test/security/bundle_verifier_test.dart`. The test fixture is not sourced from network or file I/O at test runtime.

- **AC-4.6 "wrong public key" interpretation**:
  plan.md says "BundleVerifier.verify returns false when the public key constant is replaced with a different key." Since `kBundleSigningPublicKey` is a compile-time const and cannot be parameterised (out of scope per this phase), the test implements this as: generate a second test P-256 key pair offline; sign the fixture bytes with the second private key; call `BundleVerifier.verify(bytes, wrongKeySig)`. The verifier uses the hardcoded production public key, which does not match the second private key; verification returns `false`. The test does NOT replace the const — it proves the verifier correctly rejects a signature from a different key.

- **`lib/security/` directory is new**:
  The current Flutter project at `foundry-app/flutter/lib/` does not contain a `security/` subdirectory. Builder must create this directory as part of creating `bundle_verifier.dart`. No separate `pubspec.yaml` is required — it is a plain Dart source directory within the existing Flutter package.

- **Test directories**:
  `test/security/bundle_verifier_test.dart` and `test/services/module_registry_service_test.dart` are new files. The `test/` directory exists (implied by Flutter project structure with `flutter_test` dev dependency). Builder creates these files. No test helper or test fixture files from previous phases are assumed to exist.

### Assumptions Made

- **`cryptography ^2.7.0` has no version conflict with existing dependencies**: Current `pubspec.yaml` does not list `cryptography`. The existing `crypto: ^3.0.3` package is a separate package (dart:crypto hash utilities) with no known conflict with `cryptography ^2.7.0`. Assumption: `flutter pub get` resolves successfully. If a conflict arises, Builder reports it.
- **`cryptography` package provides pure-Dart ECDSA-P256 with SHA-256 hash**: `cryptography ^2.7.0` includes `EcdsaP256(Sha256())` in its pure-Dart backend. No native plugin, no additional platform-specific setup. Assumption valid for the Flutter SDK >= 3.0.0 target.
- **The production public key PEM is available to Builder from Phase 1 output**: Builder has access to the `public_key.pem` file produced by `generate_signing_key.js` in Phase 1. This is a prerequisite — if not available, Builder must request it from Orchestrator before proceeding.
- **No existing `ModuleEntry` call sites pass positional constructor arguments**: The current `ModuleEntry` constructor uses named parameters only. Adding `required this.signature` is a breaking change to any call site that omits it. The only call site in the current codebase is `fromJson` (which Builder updates). If other call sites exist in test files or other Dart files, Builder must update them. Current codebase inspection shows no other call sites for `ModuleEntry(...)` directly.

### Q&A References

- Phase 1 (locked): Public key format = SPKI DER bytes, base64-encoded (PEM). Applied: `kBundleSigningPublicKey` stores the PEM block; Builder decodes for `cryptography` package use.
- Phase 1 (locked): Signature format = base64-encoded DER, ECDSA-P256-SHA256. Applied: `verify()` base64-decodes the signature before passing to the `cryptography` package.
- Phase 1 (locked): Flutter SDK >= 3.0.0, Dart SDK >= 3.0.0 < 4.0.0. Applied: environment constraint unchanged; Dart sound null safety applies.
- Phase 3 (locked context): Flutter `ModuleEntry` must handle null: `(j['signature'] as String?) ?? ''`. Applied: mandated in fromJson spec.
- Phase 3 (locked context): This phase must NOT wire verification into the download flow — that is Phase 5. Applied: Out Of Scope section.
- Phase 3 validated.md: `api_module_response.signature` type is `string | null`. Applied: `fromJson` null-handles with `?? ''`; BundleVerifier input is `String` (non-nullable, already collapsed to `''` before reaching `verify()`).

### Drift Corrections
Not applicable — cycle 1, no baseline.
public key :- MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEsxoo7sQW+bHicHsnrSUuNEVO0YevJzIGRCO9ag/tyVe/wp38hToTqmZeDhK0I9fSySQzqfQBtxggtuf2vF5z+g==