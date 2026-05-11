# Phase 4 Validation Report

PHASE_ID: phase-4-native-capabilities
VALIDATED_AT: 2026-04-02
VALIDATOR: Claude Sonnet 4.6

## VALIDATION_STATUS: PASS_WITH_NOTES

## CHECK RESULTS

| # | Check | Status | Detail |
|---|-------|--------|--------|
| 1 | pubspec deps | PASS | connectivity_plus 5.0.0 present; image_picker + mobile_scanner absent — need adding |
| 2 | AndroidManifest | PASS | Only INTERNET permission exists; insertion point confirmed before application tag |
| 3 | shell_bridge stubs | PASS | All 4 stubs confirmed: capturePhoto, getNetworkState, submitTransaction, scanBarcode |
| 4 | ShellBridge constructor | NOTE | Currently no-arg; plan adds BuildContext — correct change |
| 5 | module_webview.dart | CRITICAL | Line 31: field initializer runs before context exists — must move to initState() |
| 6 | reports table schema | PASS | user_id, module_slug, payload (jsonb), created_at — matches plan exactly |
| 7 | App.jsx current state | PASS | Has capturePhoto + ping; needs 3 more capabilities wired up |
| 8 | package.json build | PASS | npm run build confirmed working |

## CORRECTIONS BUILDER MUST MAKE

### C1 — CRITICAL: module_webview.dart ShellBridge initialization

Current line 31:
  final ShellBridge _bridge = ShellBridge();

Change to:
  late final ShellBridge _bridge;

Add in initState() BEFORE _initWebView():
  _bridge = ShellBridge(context);

### C2 — HIGH: connectivity_plus 5.0 returns List not single value

Plan code `result != ConnectivityResult.none` will not compile.
Use instead:
  final results = await Connectivity().checkConnectivity();
  final isOnline = results.isNotEmpty && !results.contains(ConnectivityResult.none);
  String type = 'none';
  if (results.contains(ConnectivityResult.wifi)) type = 'wifi';
  else if (results.contains(ConnectivityResult.mobile)) type = 'mobile';

### C3 — Add import for barcode_scanner_screen.dart in shell_bridge.dart

## ALL 8 ACs CONFIRMED — proceed with Builder
