# Phase 1 — Flutter Shell + Local HTTP Server + WebView Bridge

PHASE_ID: phase-1-flutter-shell
PLANNER_DOC_VERSION: 6.1.0
GENERATED: 2026-04-02T00:00:00Z

---

## WHAT_TO_BUILD

Create the Flutter shell application from scratch. This phase establishes the
entire structural foundation of the app: a Flutter project with a local HTTP
server (shelf) that serves React module bundles from the device's filesystem,
a WebView that loads from localhost, and a bidirectional JavaScript bridge
(FoundryBridge) that allows React modules to call native Flutter methods and
receive responses asynchronously. A first real React module (quality-inspector)
is built with webpack and served through the local HTTP server. The bridge is
validated end-to-end with a stubbed capturePhoto call. No auth, no backend,
no downloads — just the shell running a local module in a WebView with a
working bridge.

---

## DELIVERABLES

| # | File | Purpose |
|---|------|---------|
| 1 | flutter/pubspec.yaml | Flutter project config + all dependencies |
| 2 | flutter/lib/main.dart | App entry point, starts HTTP server, routes to WebView |
| 3 | flutter/lib/services/local_http_server.dart | shelf-based static file server |
| 4 | flutter/lib/webview/module_webview.dart | WebViewController widget |
| 5 | flutter/lib/bridge/shell_bridge.dart | JS↔Dart bridge, handles capturePhoto + ping |
| 6 | flutter/assets/test_module/index.html | Static fallback test page |
| 7 | modules/quality-inspector/package.json | React module npm config |
| 8 | modules/quality-inspector/webpack.config.js | Webpack build config |
| 9 | modules/quality-inspector/src/index.js | React entry point |
| 10 | modules/quality-inspector/src/App.jsx | Form + Capture Photo button + bridge display |
| 11 | modules/quality-inspector/public/index.html | Module HTML shell |
| 12 | modules/shared/bridge_helper.js | window.FoundryBridge promise wrapper |

---

## ACCEPTANCE_CRITERIA

### AC-1: Flutter project compiles
- pass_condition: `flutter build apk --debug` exits with code 0
- test_command: `cd foundry-app/flutter && flutter build apk --debug`

### AC-2: Local HTTP server starts on port 8080
- pass_condition: Server starts, GET http://localhost:8080/ returns 200 within 3s
- test_command: Start app in debug, check Flutter log for "LocalHttpServer: started on port 8080"

### AC-3: WebView loads from localhost
- pass_condition: WebView renders HTML content served from localhost (no blank screen)
- test_command: Run app on emulator, verify WebView shows content

### AC-4: Bridge receives capturePhoto call
- pass_condition: Flutter log shows "Bridge: received capturePhoto call" when button tapped
- test_command: Run app, tap "Capture Photo" in WebView, inspect Flutter debug log

### AC-5: Bridge returns response to JS
- pass_condition: WebView UI displays `{ "success": true, "path": "test.jpg" }` after tap
- test_command: Run app, tap button, verify response rendered in React UI

### AC-6: React module builds with webpack
- pass_condition: `npm run build` produces dist/index.html and dist/bundle.js
- test_command: `cd foundry-app/modules/quality-inspector && npm install && npm run build && ls dist/`

### AC-7: bridge_helper.js resolves promise
- pass_condition: callBridge() returns a Promise; callback fires within 2s on stub method
- test_command: Syntax check + runtime verification via AC-4/AC-5

---

## INPUTS_FROM_PREVIOUS_PHASE

none — this is phase 1

---

## OUTPUTS_TO_NEXT_PHASE

| Field | Type | Description |
|-------|------|-------------|
| flutter_project_path | string | Path to flutter/ directory |
| bridge_protocol | object | { method: string, args: object, callbackId: string } JSON shape |
| bridge_response_protocol | object | { success: bool, ...data } response shape |
| local_http_server_port | int | Default port (8080) used by shell |
| module_bundle_structure | object | { index.html, bundle.js } in dist/ |
| shared_bridge_helper_path | string | Path to modules/shared/bridge_helper.js |

---

## OUT_OF_SCOPE

- Firebase authentication (Phase 2)
- JWT tokens or secure storage (Phase 2)
- Module download from CDN (Phase 3)
- Offline queue or sync (Phase 4)
- Play Store / App Store submission (Phase 5)
- Multiple modules / tab navigation (Phase 3)
- Real camera capture (Phase 4)
- Supabase or any backend (Phase 2)

---

## POC_REFERENCE

A working POC exists at:
`C:\Users\bijay\OneDrive\Desktop\auto_agent3\pocs\output\foundry-position-shell-poc\src\shell`

### USE from POC (copy and adapt):
| POC file | What to use |
|----------|------------|
| `lib/services/local_http_server.dart` | Entire file verbatim — shelf CORS + port-finding + logging is production-ready |
| `lib/main.dart` | WebView init pattern (platform params), `_injectBridgeInterface()`, `_handleBridgeMessage()`, `_sendBridgeResponse()` — these are proven |
| `lib/bridge/shell_bridge.dart` | `BridgeResult` class + switch routing pattern only |
| `pubspec.yaml` | shelf, webview_flutter, path_provider, http, crypto, connectivity_plus versions |

### EXCLUDE from POC (do NOT copy — these belong to later phases):
- `lib/auth/mock_auth_service.dart` — replaced by real Firebase auth in Phase 2
- `lib/position/`, `lib/session/` — position/session model is POC-specific, not in production plan
- `lib/modules/module_registry.dart`, `module_cache.dart`, `module_updater.dart` — Phase 3
- `lib/offline/`, `lib/network/` — Phase 4
- `lib/bridge/scanner_bridge_extension.dart`, `photo_bridge_extension.dart` — Phase 4
- `lib/bridge/storage_bridge_extension.dart` — Phase 4
- `lib/database/`, `lib/security/` — Phase 3
- `lib/demo/` — POC only

### Bridge pattern (from POC — use this, not IMPL plan's simpler version):
- JS → Flutter: `shellBridge.postMessage(JSON.stringify({ id, method, args }))`
- Flutter → JS: `window.dispatchEvent(new CustomEvent('flutterResponse', { detail: { id, result } }))`
- JS bridge injected via `runJavaScript` after page load (not inline HTML)
- Channel name: `shellBridge` (matches POC)

---

## ENVIRONMENT_REQUIREMENTS

- Flutter SDK 3.x installed (`flutter --version`)
- Node.js 18+ installed (`node --version`)
- Android emulator or physical device connected (`flutter devices`)
- npm available (`npm --version`)
- Windows 11 host (paths use forward slashes in code)
