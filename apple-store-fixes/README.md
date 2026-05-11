# Apple App Store Fixes — Orchestration Plan

## Execution Order

Run each phase through the orchestrator ONE AT A TIME. Review output before moving to next phase.

```
./run.sh --doc apple-store-fixes/phase-01-privacy-manifest.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-02-info-plist-permissions.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-03-privacy-policy.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-04-account-deletion.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-05-native-dashboard.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-06-settings-screen.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-07-review-notes.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-08-dart-obfuscation.md
  ↓ REVIEW → approve
./run.sh --doc apple-store-fixes/phase-09-launch-screen.md
  ↓ REVIEW → DONE
```

## Phase Summary

| Phase | What | Type | Effort | Apple Guideline |
|-------|------|------|--------|-----------------|
| 01 | Privacy Manifest (PrivacyInfo.xcprivacy) | iOS config | 1 hr | **Blocks submission** |
| 02 | Info.plist Permission Strings | iOS config | 10 min | **Crash = reject** |
| 03 | Privacy Policy (HTML + Flutter screen + login link) | New screen + asset | 2-3 hrs | 5.1.1 mandatory |
| 04 | Account Deletion (AuthService + dialog + trigger) | New feature | 4-6 hrs | 5.1.1(v) mandatory |
| 05 | Native Dashboard (replace flat module list) | New screen | 1-2 days | 4.2 risk reduction |
| 06 | Settings Screen (privacy, delete, logout, cache) | New screen | 4-6 hrs | Multiple guidelines |
| 07 | App Store Review Notes & Metadata | Documentation | 1 hr | 2.1 demo account |
| 08 | Dart Obfuscation (release build scripts) | Build config | 10 min | Security best practice |
| 09 | Launch Screen (branded splash) | iOS storyboard | 30 min | 2.1 completeness |

## Dependencies Between Phases

```
Phase 01 ─── independent
Phase 02 ─── independent
Phase 03 ─── independent
Phase 04 ─── independent
Phase 05 ─── independent (but Phase 06 depends on it)
Phase 06 ─── depends on Phase 03, 04, 05
Phase 07 ─── independent (but best written after 01-06 are done)
Phase 08 ─── independent
Phase 09 ─── independent
```

**Safe parallel groups (if you want to batch):**
- Group A (can run together): Phase 01, 02, 08, 09
- Group B (can run together): Phase 03, 04
- Group C (sequential): Phase 05, then Phase 06
- Group D (last): Phase 07

## Core Architecture Guarantee

NONE of these phases touch:
- WebView-based module rendering
- Local HTTP server (shelf on localhost)
- Dynamic bundle download from CDN
- OTA module updates
- IndexedStack multi-module management
- React bundle handling
- JavaScript bridge (shell_bridge.dart)
- Module download/registry services (core logic)
- Offline-first queue + sync

## After All 9 Phases — Expected Approval: ~80%
