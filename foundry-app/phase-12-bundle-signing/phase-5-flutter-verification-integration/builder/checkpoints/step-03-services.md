# Checkpoint — Services/Logic
COMPLETED: 2026-04-15T00:03:00Z
STATUS: COMPLETE

## Modified
- foundry-app/flutter/lib/services/module_download_service.dart
  - Added: import 'package:sentry_flutter/sentry_flutter.dart'
  - Added: import '../security/bundle_verifier.dart'
  - Added: BundleSignatureException class
  - Added: Step 3 ECDSA verification block (after checksum, before writeAsBytes)
  - Sentry.captureException called before throw on invalid signature
  - Empty signature skips ECDSA check (backward compatibility)

- foundry-app/flutter/lib/screens/loading_screen.dart
  - Added: import 'package:sentry_flutter/sentry_flutter.dart'
  - Added: String? _signatureError state field
  - Added: on BundleSignatureException catch block (after on ChecksumMismatchException)
    - Calls Sentry.captureException(e)
    - Sets _signatureError = e.slug, _status = 'Module integrity check failed'
    - Returns early (no retry, no navigation)
  - Added: rethrow guard in outer catch(e) block
  - Added: if (_signatureError != null) return; guard before navigation
  - Added: error UI in build() when _signatureError != null
    - Shows Text('Module integrity check failed') [verbatim for AC-5.3]
    - Shows Text('Module: $_signatureError') for slug
    - Does NOT show CircularProgressIndicator or progress bar

- foundry-app/flutter/lib/security/bundle_verifier.dart
  - NO CHANGE NEEDED: kBundleSigningPublicKey already contains a real P-256 SPKI PEM
    (not a placeholder; key begins with MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE)

## Deliverables Covered
- Deliverable 1: ModuleDownloadService — ECDSA Verification Step (validated.md §1)
- Deliverable 2: LoadingScreen — BundleSignatureException Error UI (validated.md §2)
- Deliverable 3: BundleVerifier — Public Key Substitution (validated.md §3) — confirmed no change needed

SERVICES_READY: true
