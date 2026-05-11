# Phase Index
# Written by PLANNER — updated by ORCHESTRATOR
# Source doc: docs/IMPLEMENTATION_PLAN.md

GENERATED: 2026-04-03T00:00:00Z
PLANNER_DOC_VERSION: 6.1.0
TOTAL_PHASES: 7

## Phases

### Phase 1 — Flutter Shell + Local HTTP + WebView Bridge
PHASE_ID: phase-1-flutter-shell
STATUS: COMPLETE
DEPENDS_ON: none
PROVIDES_TO: phase-2-backend-auth
COVERS_IMPL_PHASES: 1, 2
ACHIEVEMENT: Flutter app runs, WebView loads React module from localhost, FoundryBridge works end-to-end (capturePhoto stub returns response to JS UI).

### Phase 2 — Backend API + Firebase Auth + JWT Flow
PHASE_ID: phase-2-backend-auth
STATUS: PLANNING
DEPENDS_ON: phase-1-flutter-shell
PROVIDES_TO: phase-3-module-delivery
COVERS_IMPL_PHASES: 3, 4
ACHIEVEMENT: Supabase schema created, Vercel API deployed, login returns JWT, Flutter login screen works, token stored securely, token injected into WebView.

### Phase 3 — Module Delivery + CDN + Downloader + Cache
PHASE_ID: phase-3-module-delivery
STATUS: PENDING
DEPENDS_ON: phase-2-backend-auth
PROVIDES_TO: phase-4-offline-sync
COVERS_IMPL_PHASES: 5, 6
ACHIEVEMENT: Modules hosted on Supabase CDN, Flutter downloads and caches them with checksum verification, progress shown, version updates detected automatically.

### Phase 4 — Offline Queue + Sync + Reports API
PHASE_ID: phase-4-offline-sync
STATUS: PENDING
DEPENDS_ON: phase-3-module-delivery
PROVIDES_TO: phase-5-store-submission
COVERS_IMPL_PHASES: 7, 8
ACHIEVEMENT: Reports queue offline in IndexedDB, sync triggers automatically on network restore, zero data loss, backend reports/sync APIs fully functional.

### Phase 8.5 — Reference Data Caching + Product Description Edit
PHASE_ID: phase-8-5-ref-data-products
STATUS: PENDING
DEPENDS_ON: phase-4-offline-sync
PROVIDES_TO: phase-5-store-submission
COVERS_IMPL_PHASES: 8.5
ACHIEVEMENT: Backend exposes product list and description-update endpoints; quality-inspector v1.2.0 loads cached products into a dropdown, auto-selects on barcode scan, allows inline description editing, and enqueues both report and description-update actions when offline.

### Phase 5 — Store Submission Prep (Android + iOS)
PHASE_ID: phase-5-store-submission
STATUS: PENDING
DEPENDS_ON: phase-4-offline-sync
PROVIDES_TO: final
COVERS_IMPL_PHASES: 9, 10
ACHIEVEMENT: App Bundle built and signed, Play Store internal track live, iOS IPA built, App Store submission checklist complete.

### Phase 9 — Android Play Store Submission
PHASE_ID: phase-9-android-playstore
STATUS: PENDING
DEPENDS_ON: phase-8-5-ref-data-products
PROVIDES_TO: final
ACHIEVEMENT: Foundry app live on Google Play Store internal testing track; AAB signed, uploaded, installable from Play Store link.

## Status Values
- PENDING: Not started
- PLANNING: Plan written, awaiting review
- VALIDATING: Validator running
- BUILDING: Builder running
- TESTING: Tester running
- COMPLETE: All ACs passed
- FAILED: Max cycles reached
