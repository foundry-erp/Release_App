# Validator Output — Phase 1

PHASE_ID: phase-1-flutter-shell
VALIDATOR_DOC_VERSION: 6.1.0
CYCLE: 1
DRIFT_CHECK_STATUS: N/A (cycle 1)
VALIDATED_AT: 2026-04-02T00:00:00Z

---

## WHAT_TO_BUILD

Build the complete Flutter shell foundation: a Flutter project that starts a
local HTTP server (shelf/shelf_static) on port 8080, serves React module bundles
from the device filesystem, and loads them in a WebView (webview_flutter). A
bidirectional JavaScript bridge (FoundryBridge channel) allows React modules to
call Flutter methods asynchronously via Promise-based callbacks. The
quality-inspector React module is built with webpack and served through this
server. Bridge is validated with stub capturePhoto and ping methods.

---

## DELIVERABLES

| # | Path | Purpose | Required |
|---|------|---------|---------|
| 1 | flutter/pubspec.yaml | Flutter deps: webview_flutter, shelf, shelf_static, shelf_router, path_provider, http, flutter_secure_storage, connectivity_plus, flutter_dotenv, firebase_core, firebase_auth, crypto, sentry_flutter | YES |
| 2 | flutter/lib/main.dart | Entry: starts LocalHttpServer on 8080, navigates to ModuleWebView | YES |
| 3 | flutter/lib/services/local_http_server.dart | Class LocalHttpServer: start(moduleName, modulePath, port), stop(), serves static files via shelf_static | YES |
| 4 | flutter/lib/webview/module_webview.dart | StatefulWidget, WebViewController, loads URL, basic nav bar | YES |
| 5 | flutter/lib/bridge/shell_bridge.dart | addJavaScriptChannel 'FoundryBridge', parses {method,args,callbackId}, routes capturePhoto→stub, ping→pong, sends response via runJavaScript | YES |
| 6 | flutter/assets/test_module/index.html | Static fallback: "Hello from WebView" | YES |
| 7 | modules/quality-inspector/package.json | React 18, webpack 5, babel, html-webpack-plugin | YES |
| 8 | modules/quality-inspector/webpack.config.js | entry: src/index.js, output: dist/bundle.js, HtmlWebpackPlugin | YES |
| 9 | modules/quality-inspector/src/index.js | ReactDOM.createRoot render | YES |
| 10 | modules/quality-inspector/src/App.jsx | Form + Capture Photo button + bridge response display, imports bridge_helper | YES |
| 11 | modules/quality-inspector/public/index.html | HTML template for HtmlWebpackPlugin | YES |
| 12 | modules/shared/bridge_helper.js | window.FoundryBridge.callBridge(method,args)→Promise, registers __foundryCallback_{id} | YES |

---

## ACCEPTANCE_CRITERIA

### AC-1: Flutter project compiles (debug APK)
- pass_condition: Exit code 0 from flutter build apk --debug; no compilation errors in output
- test_command: cd foundry-app/flutter && flutter build apk --debug 2>&1 | tail -5
- failure_classification: DETERMINISTIC if source error; ENVIRONMENTAL if SDK missing

### AC-2: Local HTTP server starts
- pass_condition: Flutter log contains "LocalHttpServer: started on port 8080"
- test_command: flutter run --debug 2>&1 | grep "LocalHttpServer: started"
- failure_classification: DETERMINISTIC

### AC-3: WebView loads localhost content
- pass_condition: WebView renders HTML — no blank white screen, content visible
- test_command: Manual — run on emulator, inspect screen
- failure_classification: DETERMINISTIC if URL wrong; ENVIRONMENTAL if emulator unavailable

### AC-4: Bridge receives JS message
- pass_condition: Flutter log contains "Bridge: received capturePhoto call"
- test_command: Manual — tap "Capture Photo" in running app, check debug log
- failure_classification: DETERMINISTIC

### AC-5: Bridge returns response to JS UI
- pass_condition: React UI renders { "success": true, "path": "test.jpg" } after tap
- test_command: Manual — observe WebView after tapping Capture Photo
- failure_classification: DETERMINISTIC

### AC-6: React module webpack build succeeds
- pass_condition: dist/index.html and dist/bundle.js both exist after npm run build; exit code 0
- test_command: cd foundry-app/modules/quality-inspector && npm install && npm run build && test -f dist/bundle.js && echo PASS
- failure_classification: DETERMINISTIC if config error; ENVIRONMENTAL if Node missing

### AC-7: bridge_helper.js is valid JavaScript
- pass_condition: node --check returns exit code 0 (no syntax errors)
- test_command: node --check foundry-app/modules/shared/bridge_helper.js && echo PASS
- failure_classification: DETERMINISTIC

---

## ENVIRONMENT_REQUIREMENTS

| Requirement | Check command | Min version |
|-------------|--------------|-------------|
| Flutter SDK | flutter --version | 3.x |
| Dart SDK | dart --version | 3.x |
| Node.js | node --version | 18+ |
| npm | npm --version | 9+ |
| Android emulator OR physical device | flutter devices | any |

Confirmed available on this machine:
- Flutter 3.41.2 ✓
- Node.js v22.19.0 ✓

---

## OUT_OF_SCOPE

- Firebase authentication
- JWT / secure token storage
- Module download from CDN or internet
- Offline queuing or sync
- Multiple module tabs
- Real camera capture (stub only)
- Supabase or any database
- Play Store / App Store submission

---

## INTERFACE_CONTRACTS

### Outputs this phase provides to Phase 2

| Field | Type | Value |
|-------|------|-------|
| flutter_project_path | string | foundry-app/flutter/ |
| bridge_channel_name | string | "FoundryBridge" |
| bridge_message_shape | object | { method: string, args: object, callbackId: string } |
| bridge_response_shape | object | window.__foundryCallback_{callbackId}(jsonString) |
| local_server_default_port | int | 8080 |
| module_bundle_files | string[] | ["index.html", "bundle.js"] |
| bridge_helper_path | string | foundry-app/modules/shared/bridge_helper.js |

---

## POC_REFERENCE_CONSTRAINTS

Builder MUST follow these rules when using the POC:

**COPY (adapt, not blindly paste) from POC:**
- `local_http_server.dart` → use verbatim, only change package name if needed
- WebView init pattern from `main.dart` → `_initializeWebView()` with platform-specific params
- `_injectBridgeInterface()` from `main.dart` → use the Promise + CustomEvent pattern exactly
- `_handleBridgeMessage()` + `_sendBridgeResponse()` from `main.dart` → proven routing
- `BridgeResult` class from `shell_bridge.dart` → keep as-is
- pubspec.yaml dep versions: shelf ^1.4.0, webview_flutter ^4.4.0, etc.

**DO NOT copy from POC:**
- Any import of `mock_auth_service.dart`, `position_resolver.dart`, `session_broker.dart`
- Any Phase 3/4/5 services (ModuleRegistry, OfflineQueue, SyncManager, Scanner, Photo)
- The module selection UI screen
- The `ModuleLoadingMode` enum (Phase 1 always uses HTTP server)
- The `_runCryptoDemo()` call

**Bridge for Phase 1 (simplified from POC):**
The full POC bridge has ~15 methods. Phase 1 only implements:
- `capturePhoto` → stub returns `{ success: true, path: 'test.jpg' }`
- `ping` → returns `{ pong: true }`
All other methods return `{ success: false, error: 'not implemented in Phase 1' }`

---

## VALIDATOR_NOTES

- AC-3, AC-4, AC-5 require a running device/emulator — classified ENVIRONMENTAL if device unavailable; Tester must document this correctly
- AC-6 and AC-7 are fully automatable and must not be classified ENVIRONMENTAL
- No ACs use no-op commands (echo/true/exit 0)
- All pass_conditions are specific and measurable
- Out of scope section is explicit — PASS
- What To Build section is >50 words — PASS
- Sanity checks: PASS
