# Validator Questions — Phase 5
PHASE_ID: phase-5-flutter-verification-integration
VALIDATOR_CYCLE: 1
GENERATED: 2026-04-15T00:00:00Z
STATUS: WAITING_FOR_ANSWERS

---

## Question 1
SCOPE: [phase-local]
CONTEXT:
  AC-5.3 requires the app to show an error screen "Module integrity check failed" when
  BundleSignatureException is thrown, and AC-5.6 requires that BundleSignatureException
  "propagates to the loading screen and is visible in the UI."

  However, loading_screen.dart is NOT listed as a deliverable in plan.md. The current
  loading_screen.dart has this structure:

    for each outdated module:
      try {
        await ModuleDownloadService.download(entry, ...)
      } on ChecksumMismatchException {
        // retries once
        await ModuleDownloadService.download(entry, ...)
      }
      // BundleSignatureException is NOT caught here — falls through to...

    } catch (e) {
      // OUTER CATCH — catches ALL exceptions including BundleSignatureException
      print('[LoadingScreen] OTA check failed (continuing): $e');
      setState(() { _downloadProgress = null; });
      // then navigates to DashboardScreen ANYWAY
    }

  If BundleSignatureException is thrown by the service, the current code silently swallows
  it in the outer catch and navigates to DashboardScreen. No error screen is shown.
  AC-5.3 and AC-5.6 cannot pass without a modification to loading_screen.dart.

  Additionally, loading_screen.dart contains _buildFallbackFromCache() which constructs
  ModuleEntry without a `signature:` field (line 108–115). After Phase 4 adds
  `required this.signature` to ModuleEntry, this becomes a compile error. The plan's
  AC-5.1 requires the project to compile — so this must also be fixed.

QUESTION: Should loading_screen.dart be added to the Phase 5 deliverables and file
  manifest as a MODIFY target, with an explicit spec for how BundleSignatureException
  is caught and displayed?

OPTIONS:
  A) YES — add loading_screen.dart to Phase 5 deliverables as a MODIFY target.
     Validator will spec exactly:
       (1) A new `on BundleSignatureException catch (e)` block inside the module
           download loop (after the ChecksumMismatchException block), which calls
           Sentry.captureException(e), calls setState to set _status to a defined
           error string, and rethrows so the outer catch does NOT swallow it silently.
       (2) OR: the outer catch is changed to re-throw BundleSignatureException after
           logging, showing a persistent error dialog before NavigationScreen.
       (3) Fix _buildFallbackFromCache() to add `signature: ''` to the ModuleEntry
           constructor call.
     Impact: Builder has a complete, unambiguous spec for loading_screen.dart changes.
     AC-5.1, AC-5.3, AC-5.6 can all pass.

  B) YES — add loading_screen.dart to Phase 5 deliverables, but with a MINIMAL change:
     only fix _buildFallbackFromCache() (compile fix) and add `on BundleSignatureException`
     to propagate the exception out of the outer catch, showing whatever default Flutter
     error widget appears. The "Module integrity check failed" string is shown via a
     setState on _status before rethrowing (no modal dialog).
     Impact: Simpler change; compile fix + minimal error propagation. The exact error
     screen string "Module integrity check failed" would be the `_status` text visible
     in the LoadingScreen body, not a modal dialog.

  C) NO — loading_screen.dart changes are out of scope for Phase 5. Only the
     _buildFallbackFromCache() compile fix is permitted (as a necessary side-effect of
     Phase 4's breaking change to ModuleEntry). The error screen for BundleSignatureException
     is deferred to a separate phase. AC-5.3 and AC-5.6 are marked as manual-only
     criteria with no automated test coverage for the UI path.
     Impact: AC-5.3 and AC-5.6 cannot fully pass as written. Planner must revise
     the acceptance criteria to reflect the actual scope.

DEFAULT_IF_NOT_ANSWERED: A (the error screen is explicitly required by AC-5.3 and
  AC-5.6; Option A makes the spec coherent without deferring any stated requirement).

---

## Question 2
SCOPE: [phase-local]
CONTEXT:
  REQ-VERIFY-FLOW states: "if false: delete file, throw SecurityException, log to Sentry"
  (using the term SecurityException, though the locked context and plan deliverables use
  BundleSignatureException — this is treated as the same exception).

  The current download() method in module_download_service.dart does NOT write bundle.js
  until AFTER the checksum check passes (line 74–75 in the current file). The locked
  context confirms: "Signature verified AFTER checksum, BEFORE writeAsBytes."

  At the point of signature failure, bundle.js has NOT yet been written to disk by the
  current download call. There is no newly-downloaded file to delete.

  However, the device may have a stale bundle.js on disk from a previous successful
  download (e.g., the tampered-bundle TAMPER test case in AC-5.3 requires the user to
  manually flip a byte in the cached file, then restart — the cached file IS on disk
  when re-download is triggered by getOutdatedModules returning it as outdated).

  Wait — in the TAMPER case (AC-5.3): the user flips a byte in the cached bundle.js,
  then restarts. On restart, getOutdatedModules detects the module as "outdated" (by
  version mismatch or checksum) and calls download(). The new download fetches the
  original bytes from CDN (the CDN copy is not tampered). The checksum passes (CDN bytes
  are correct). The signature passes (CDN bytes are correctly signed). So the TAMPER
  test case as described in AC-5.3 does NOT trigger a BundleSignatureException during
  a fresh download — it only triggers if the in-memory bundleBytes (just downloaded)
  fail signature check, NOT the on-disk cached file.

  This creates a contradiction: if the TAMPER case is supposed to test a download
  flow rejection, the byte flip must occur in the bytes BEING downloaded (impossible
  for a CDN-hosted file), OR the test case description is about reading the existing
  on-disk file rather than fresh download.

  The Manual Test Step 3 says: "locate the cached bundle.js in device storage, open a
  hex editor, flip byte 0 from its current value, save, restart the app."
  But restart triggers a re-download from CDN — which would produce clean bytes and
  PASS verification, overwriting the tampered cache file.

  UNLESS getOutdatedModules does NOT detect the module as outdated (version matches)
  and the app serves the existing cached bundle.js to the WebView without re-downloading.
  In that case, the tampered file is served directly — but verification happens in
  download(), not in serve(). So if re-download is skipped, verification is also skipped.

QUESTION: In the TAMPER test case (Manual Step 3 / AC-5.3), at which point does
  signature verification actually catch the tampered file?

OPTIONS:
  A) Verification catches tampering on re-download: getOutdatedModules returns the module
     as outdated (e.g., because the cached version string is stale or checksumming
     the on-disk file is part of the "outdated" check). download() fetches fresh bytes
     from CDN — the CDN bytes are NOT tampered. Checksum passes. Signature passes.
     The tampered on-disk file is overwritten. The TAMPER case does NOT trigger a
     BundleSignatureException in this scenario.
     Impact: Manual Test Step 3 and AC-5.3 are misleading — they describe a case that
     cannot work as written. The TAMPER test must be redesigned (e.g., tamper the CDN
     or use a test mode with a locally-served bundle).

  B) Verification catches tampering at serve time: the download flow is extended to
     ALSO verify the signature of the on-disk bundle.js before loading it into the
     WebView (not only at download time). This would mean BundleSignatureException
     can be thrown from a serve-path, not just the download-path.
     Impact: The spec for module_download_service.dart or a new serve method must
     include on-disk verification. This is a larger scope than plan.md implies.

  C) The TAMPER test is intentionally designed as a replay of the download step:
     flipping a byte in the cached file causes getOutdatedModules to consider the
     module as "outdated" because of a checksum mismatch against stored metadata.
     On re-download, if the server returns the tampered bytes (a test server, not
     the real CDN), checksum fails (throws ChecksumMismatchException) — which is
     a RETRY, not a BundleSignatureException. If the checksum also passes (the
     test server provides bytes matching a tampered checksum), then signature
     verification would be the gate. This requires a specially-configured test server.
     Impact: The TAMPER manual test step is only achievable in a controlled test
     environment, not with real CDN. Plan.md's manual steps need to document this.

  D) Manual Test Step 3 intends for the test to verify the SERVE path behavior:
     the version is current (no re-download triggered), but before serving the
     cached file to WebView, the app reads and re-verifies the bundle.js signature.
     This means the serve path, not the download path, is where the tamper is caught.
     Impact: A separate verification step in the serve/load path is required, which
     is outside the current plan.md deliverables.

DEFAULT_IF_NOT_ANSWERED: A (most internally consistent with the locked context that
  verification is in the download path, BEFORE writeAsBytes — implying on-disk files
  are not re-verified at serve time. Manual Test Step 3 may be a spec error that
  Planner should correct to describe a test that actually works, e.g., testing with
  a local test server that returns tampered bytes).
