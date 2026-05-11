# Phase 8 — React Modules: Offline Queue + Sync + Network Detection

PHASE_ID: phase-8-offline-sync
PLANNER_DOC_VERSION: 1.0.0
DEPENDS_ON: phase-7-backend-api
PROVIDES_TO: phase-9-android-playstore

---

## What This Phase Builds

React modules gain offline-first capability through a shared offline-core library.
Any user action — form submission, photo capture — is written to a per-module
IndexedDB queue immediately, regardless of connectivity. Large files such as photos
are stored on the Flutter file system with only a path reference held in the queue.
When network connectivity restores, the sync manager drains each module's queue
automatically and uploads records to the backend. The user sees a live pending count
and never loses a submission.

---

## Requirements Covered

- REQ-8.1: React modules must queue actions locally when offline and sync automatically when online
- REQ-8.2: Photos and large files must be stored on the Flutter file system, not in IndexedDB
- REQ-8.3: Offline queue logic must be a shared library reused across all React modules (no duplication)
- REQ-8.4: Each module's data must be isolated — one module's queue cannot affect another's
- REQ-8.5: Flutter must detect network restoration and notify all active WebViews simultaneously
- REQ-8.6: On app reopen when online, any pending items from before force-close must sync
- REQ-8.7: The Flutter bridge must provide a file-read method for sync manager to retrieve stored photos
- REQ-8.8: The Flutter bridge capturePhoto must persist photos to device storage and return both display URL and file path
- REQ-8.9: Users must see a pending count badge indicating unsynced items in each module

---

## Deliverables

- [ ] modules/shared/offline-core/queue-manager.js: IndexedDB action queue, per-module namespaced
- [ ] modules/shared/offline-core/sync-manager.js: reads queue, retrieves files via bridge, posts to /api/sync
- [ ] modules/shared/offline-core/ref-data-manager.js: TTL-based IndexedDB cache for reference data (products, dropdowns)
- [ ] modules/shared/offline-core/index.js: initOfflineSystem factory — wires queue + sync + ref, registers foundry:online listener
- [ ] modules/quality-inspector/webpack.config.js: @shared alias added so offline-core can be imported
- [ ] modules/inventory-checker/webpack.config.js: @shared alias added
- [ ] modules/quality-inspector/src/App.jsx: uses offline-core queue on submit, shows pending count, startup sync
- [ ] modules/inventory-checker/src/App.jsx: uses offline-core queue on submit, shows pending count, startup sync
- [ ] flutter/lib/bridge/shell_bridge.dart: capturePhoto saves to file system and returns filePath; readFile method added; submitTransaction case removed
- [ ] flutter/lib/webview/module_webview.dart: injects apiBaseUrl into window.__foundry_auth__; subscribes to connectivity stream; dispatches foundry:online to its WebView on reconnect
- [ ] flutter/pubspec.yaml: inventory-checker asset path registered
- [ ] backend/api/sync/index.js: moduleSlug validation added for submit_report (carry from Phase 7 reviewer)
- [ ] modules/quality-inspector/dist/: rebuilt and copied to flutter/assets/modules/quality-inspector/
- [ ] modules/inventory-checker/dist/: rebuilt and copied to flutter/assets/modules/inventory-checker/

---

## Inputs From Previous Phase

- SyncEndpoint: POST /api/sync accepting { actions: Array<{ type: string, payload: { moduleSlug: string, payload: object, photo?: string }, local_id: string }> } returning { results: Array<{ local_id: string, success: boolean, server_id?: string, error?: string }> }
- AuthToken: { token: string, user: object } injected as window.__foundry_auth__ in WebView
- BridgeInterface: window.shellBridge with capturePhoto, getNetworkState, scanBarcode methods available in WebView
- ModuleAssetPath: flutter/assets/modules/{slug}/ serving index.html + bundle.js via localhost:8080/{slug}/
- ConnectivityPlugin: connectivity_plus at version 5.0.0 in pubspec.yaml

---

## Outputs To Next Phase

- OfflineSyncVerified: boolean — Milestone D passes on real device (all 5 test scenarios)
- ModuleAssetPath: flutter/assets/modules/{slug}/ — rebuilt bundles with offline-core included
- BridgeInterface: window.shellBridge extended with readFile(filePath: string) → { dataUrl: string }
- AuthInjection: window.__foundry_auth__ = { token: string, user: object, apiBaseUrl: string }
- QueueSchema: IndexedDB store '{moduleId}_queue' with fields { id, type, payload, filePath, status, retryCount, error, createdAt }

---

## Acceptance Criteria

- [ ] AC-8.1
      criterion: Submitting a form in quality-inspector while WiFi is off saves one entry to quality-inspector_queue IndexedDB with status=pending and does not show an error to the user
      test_command: Turn off WiFi on device, open quality-inspector, fill form, tap Submit, open Chrome DevTools → Application → IndexedDB → quality-inspector_queue
      pass_condition: One record visible with status=pending; no error toast shown
      blocking: true

- [ ] AC-8.2
      criterion: When WiFi is restored after an offline submission, the record appears in Supabase reports table within 10 seconds without user action
      test_command: After AC-8.1, turn WiFi on, wait 10 seconds, check Supabase Table Editor → reports
      pass_condition: New row present with correct module_slug and payload
      blocking: true

- [ ] AC-8.3
      criterion: A quality-inspector submission that included a photo results in a non-null photo_url in the Supabase report row after sync
      test_command: Repeat AC-8.2 with photo captured before submit, check Supabase reports.photo_url
      pass_condition: photo_url is a valid Supabase Storage URL (not null)
      blocking: true

- [ ] AC-8.4
      criterion: After force-closing the app with a pending item and reopening while online, the item syncs without user intervention
      test_command: Submit offline, force-close app, turn WiFi on, reopen app, navigate to quality-inspector, wait 10 seconds, check Supabase
      pass_condition: Record appears in Supabase reports table
      blocking: true

- [ ] AC-8.5
      criterion: The pending count badge in each module reflects the correct number of unsynced items and updates to zero after sync
      test_command: Submit 3 items offline in quality-inspector, observe badge, turn WiFi on, observe badge after sync
      pass_condition: Badge shows "3 pending" before sync; "0 pending" or badge hidden after sync
      blocking: true

- [ ] AC-8.6
      criterion: quality-inspector and inventory-checker queue entries are isolated — submitting in one module does not affect the pending count of the other
      test_command: Submit 2 items in quality-inspector offline, switch to inventory-checker, observe pending count
      pass_condition: inventory-checker shows 0 pending; quality-inspector shows 2 pending
      blocking: true

- [ ] AC-8.7
      criterion: Both modules sync simultaneously when network restores — not sequentially waiting for each other
      test_command: Submit 1 item in quality-inspector and 1 in inventory-checker while offline, restore WiFi, check Supabase
      pass_condition: Both records appear in Supabase reports within 10 seconds; Flutter logs show both foundry:online events firing
      blocking: false

- [ ] AC-8.8
      criterion: The Flutter bridge readFile method returns a base64 data URL for a file path previously returned by capturePhoto
      test_command: Capture photo in quality-inspector, note filePath in bridge response, call readFile with that path via bridge, check response
      pass_condition: Response contains dataUrl starting with data:image/jpeg;base64,
      blocking: true

- [ ] AC-8.9
      criterion: The @shared webpack alias resolves correctly in both modules — build succeeds without module-not-found errors
      test_command: cd modules/quality-inspector && npm run build && cd ../inventory-checker && npm run build
      pass_condition: Both commands exit 0 with no errors; dist/bundle.js generated in each
      blocking: true

---

## Manual Test Steps

1. Turn WiFi off → open quality-inspector → fill all fields including photo → tap Submit → Expected: form clears, pending badge shows "1 pending", no error
2. Open inventory-checker → fill SKU, location, quantity → tap Submit → Expected: pending badge shows "1 pending" in inventory-checker
3. Turn WiFi on → wait 10 seconds → Expected: both modules show "0 pending"; check Supabase reports table — 2 rows exist, quality-inspector row has non-null photo_url
4. Submit 3 more items in quality-inspector while online → Expected: badge briefly shows "3 pending" then clears to "0" as sync fires immediately after each save
5. Submit 1 item offline → force-close app → turn WiFi on → reopen app → navigate to quality-inspector → Expected: pending badge may briefly appear then clears; record in Supabase

---

## Phase Achievement

When this phase passes, users can capture and submit inspection data and stock counts
with full confidence that no data is lost regardless of connectivity — the app works
completely offline and syncs automatically when the network returns.

---

## Planner Notes

⚠ UNCLEAR: connectivity_plus v5.x returns List<ConnectivityResult> not a single ConnectivityResult — Validator must confirm the correct stream API for transitioning offline→online detection on Android and verify the connectivity_plus version in pubspec.yaml before Builder uses it.

⚠ UNCLEAR: The flutter/lib/webview/module_webview.dart currently holds WebViewController as an internal field. Validator must confirm whether the connectivity subscription should live inside ModuleWebView (each widget manages its own broadcast) or at the ModuleListScreen level (one subscription broadcasts to all) — and which avoids controller exposure issues.
