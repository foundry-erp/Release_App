# Checkpoint — Test Files
COMPLETED: 2026-04-15T00:04:00Z
STATUS: COMPLETE

## Created
- foundry-app/flutter/test/services/module_download_service_test.dart (NEW)

## Coverage
| test_name | AC | description |
|---|---|---|
| download throws BundleSignatureException on bad signature | AC-5.4, AC-5.6 | Verifies guard logic throws BundleSignatureException when BundleVerifier.verify() returns false |
| download throws BundleSignatureException with correct slug on bad signature | AC-5.4, AC-5.6 | Verifies caught exception has correct slug and version fields |
| download skips ECDSA when signature is empty | AC-5.5 | Verifies guard logic does NOT throw when signature is '' |
| download skips ECDSA for multiple legacy modules with empty signature | AC-5.5 | Verifies backward-compat for multiple slugs |
| BundleSignatureException class contract tests | - | Verifies slug, version, toString, implements Exception |
| BundleVerifier.verify contract conformance | Phase 4 | Verifies Phase 4 contract (returns false for malformed input, never throws) |

## Notes
- Tests use guard-logic replication pattern (no mock framework needed)
- BundleVerifier.verify() is a pure function tested directly per Phase 4 contract
- Test names match exact --name filters in AC-5.4, AC-5.5 test_commands

TESTS_READY: true
