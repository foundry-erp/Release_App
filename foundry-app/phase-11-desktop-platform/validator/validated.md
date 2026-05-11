# Phase 11 — Validator Output
PHASE_ID: phase-11-desktop-platform
VALIDATOR_DOC_VERSION: 6.1.0
CYCLE: 1
DRIFT_CHECK_STATUS: NOT_APPLICABLE (cycle 1)
STATUS: READY_FOR_BUILDER

---

## Critical Discovery — Scope Correction

**Planner listed `webview_flutter_windows: ^0.2.0` — this package does NOT exist on pub.dev.**

`webview_flutter` has NO Windows platform implementation. Windows WebView requires the
community package `webview_windows: ^0.4.0` which has a completely different API
(uses `window.chrome.webview.postMessage()` instead of JavaScriptChannel).

**Revised scope for this phase:**

| Platform | WebView | Status |
|---|---|---|
| macOS | `webview_flutter_wkwebview` (already in pubspec, supports macOS) | Full support |
| Windows | `webview_windows: ^0.4.0` (new, different API) | Full support via separate implementation |

Both platforms are in scope. Windows requires a new `module_webview_windows.dart` file
with a platform-specific WebView implementation and adapted bridge.

---

## UNCLEAR Resolutions

**UNCLEAR-1 (Android import in module_webview.dart):**
The `webview_flutter_android` import is pure Dart — it compiles on all platforms.
The runtime check `if (_controller.platform is AndroidWebViewController)` already
guards the Android block correctly. The import does NOT cause a compile error on macOS.
However, on Windows it WILL cause a runtime error if `webview_flutter` tries to
initialize with no registered platform — Windows needs `webview_windows` registered
before the app starts. Solution: keep existing `module_webview.dart` for mobile+macOS,
create `module_webview_windows.dart` for Windows, use `Platform.isWindows` conditional
in `module_list_screen.dart` to choose which widget to render.

**UNCLEAR-2 (file_picker for camera on desktop):**
Exact API:
```dart
import 'package:file_picker/file_picker.dart';

final result = await FilePicker.platform.pickFiles(
  type: FileType.image,
  allowMultiple: false,
);
if (result == null || result.files.isEmpty) {
  return BridgeResult.ok({'cancelled': true}).toJson();
}
final path = result.files.first.path!;
final bytes = await File(path).readAsBytes();
final b64 = base64Encode(bytes);
return BridgeResult.ok({
  'cancelled': false,
  'dataUrl': 'data:image/jpeg;base64,$b64',
  'filePath': path,
}).toJson();
```

**UNCLEAR-3 (Firebase Windows):**
Firebase Windows requires `flutterfire configure` run by operator — out of builder scope.
Builder does NOT touch `main.dart` or Firebase init. Windows builds will fail Firebase
init until operator provides config. This is documented in the phase, not blocked.

**UNCLEAR-4 (WebView2 runtime):**
WebView2 is built into Windows 10 version 1803+ and all Windows 11 versions via
Windows Update. No separate end-user installation required. Note only for deploy team.

---

## Deliverable 1: pubspec.yaml — two new dependencies

**File:** `flutter/pubspec.yaml`

Add under `dependencies` after `mobile_scanner`:
```yaml
  # Phase 11: Desktop platform support
  file_picker: ^11.0.2
  webview_windows: ^0.4.0
```

**Acceptance Criteria:**
- AC-11.1: `grep "webview_windows" flutter/pubspec.yaml` → match found
- AC-11.2: `grep "file_picker" flutter/pubspec.yaml` → match found

---

## Deliverable 2: lib/bridge/shell_bridge.dart — platform-conditional bridge

**File:** `flutter/lib/bridge/shell_bridge.dart`

**Add import at top** (after existing imports):
```dart
import 'package:file_picker/file_picker.dart';
```

**Replace `capturePhoto` case entirely:**
```dart
case 'capturePhoto':
  if (Platform.isAndroid || Platform.isIOS) {
    // Mobile: use camera
    final picker = ImagePicker();
    final XFile? photo = await picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1024,
    );
    if (photo == null) {
      return BridgeResult.ok({'cancelled': true}).toJson();
    }
    final directory = await getApplicationDocumentsDirectory();
    final photosDir = Directory('${directory.path}/photos');
    if (!await photosDir.exists()) {
      await photosDir.create(recursive: true);
    }
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final savedPath = '${photosDir.path}/$timestamp.jpg';
    await File(photo.path).copy(savedPath);
    final bytes = await File(savedPath).readAsBytes();
    final b64 = base64Encode(bytes);
    return BridgeResult.ok({
      'cancelled': false,
      'dataUrl': 'data:image/jpeg;base64,$b64',
      'filePath': savedPath,
    }).toJson();
  } else {
    // Desktop: use file picker
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      allowMultiple: false,
    );
    if (result == null || result.files.isEmpty) {
      return BridgeResult.ok({'cancelled': true}).toJson();
    }
    final path = result.files.first.path!;
    final bytes = await File(path).readAsBytes();
    final b64 = base64Encode(bytes);
    return BridgeResult.ok({
      'cancelled': false,
      'dataUrl': 'data:image/jpeg;base64,$b64',
      'filePath': path,
    }).toJson();
  }
```

**Replace `scanBarcode` case entirely:**
```dart
case 'scanBarcode':
  if (Platform.isAndroid || Platform.isIOS) {
    final result = await Navigator.push<Map<String, dynamic>>(
      context,
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => const BarcodeScannerScreen(),
      ),
    );
    if (result == null) {
      return BridgeResult.ok({'cancelled': true}).toJson();
    }
    return BridgeResult.ok(result).toJson();
  } else {
    return BridgeResult.err('Barcode scanning not supported on this platform').toJson();
  }
```

**Acceptance Criterion:**
- AC-11.4: `grep -n "Platform.is" flutter/lib/bridge/shell_bridge.dart` → at least 2 matches

---

## Deliverable 3: lib/webview/module_webview_windows.dart — NEW FILE

**File:** `flutter/lib/webview/module_webview_windows.dart`

This is a Windows-only WebView implementation using `webview_windows: ^0.4.0`.
The `webview_windows` package uses `window.chrome.webview.postMessage()` for JS→Dart
instead of JavaScriptChannel.

**Exact implementation:**
```dart
import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:webview_windows/webview_windows.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import '../bridge/shell_bridge.dart';

class ModuleWebViewWindows extends StatefulWidget {
  final String url;
  final Map<String, dynamic> authContext;

  const ModuleWebViewWindows({
    Key? key,
    required this.url,
    this.authContext = const {},
  }) : super(key: key);

  @override
  State<ModuleWebViewWindows> createState() => _ModuleWebViewWindowsState();
}

class _ModuleWebViewWindowsState extends State<ModuleWebViewWindows> {
  final _controller = WebviewController();
  late final ShellBridge _bridge;
  bool _ready = false;

  StreamSubscription<ConnectivityResult>? _connectivitySubscription;
  bool _wasOnline = false;

  @override
  void initState() {
    super.initState();
    _bridge = ShellBridge(context);
    _initWebView();
    _subscribeToConnectivity();
  }

  Future<void> _initWebView() async {
    await _controller.initialize();

    _controller.webMessage.listen((message) async {
      try {
        final Map<String, dynamic> req = jsonDecode(message.toString());
        final int id = req['id'] as int;
        final String method = req['method'] as String;
        final Map<String, dynamic> args =
            (req['args'] as Map<String, dynamic>?) ?? {};
        final result = await _bridge.handleCall(method, args);
        final payload = jsonEncode({'id': id, 'result': result});
        await _controller.executeScript('''
          window.dispatchEvent(new CustomEvent('flutterResponse', {
            detail: $payload
          }));
        ''');
      } catch (e) {
        print('[WebViewWindows] Bridge error: $e');
      }
    });

    await _controller.loadUrl(widget.url);
    await _controller.executeScript(_authScript());
    await _controller.executeScript(_bridgeScript());
    if (mounted) setState(() => _ready = true);
  }

  String _authScript() {
    final encoded = jsonEncode(widget.authContext);
    return 'window.__foundry_auth__ = $encoded;';
  }

  String _bridgeScript() => '''
    (function() {
      if (window.__foundryBridgeInjected) return;
      window.__foundryBridgeInjected = true;

      let _callbackId = 0;
      const _pending = {};

      window.addEventListener('flutterResponse', function(event) {
        const { id, result } = event.detail;
        const cb = _pending[id];
        if (cb) { cb.resolve(result); delete _pending[id]; }
      });

      window.shellBridge = {
        _call: function(method, args) {
          return new Promise(function(resolve, reject) {
            const id = ++_callbackId;
            _pending[id] = { resolve, reject };
            setTimeout(function() {
              if (_pending[id]) { delete _pending[id]; reject(new Error('Bridge timeout: ' + method)); }
            }, 30000);
            window.chrome.webview.postMessage(
              JSON.stringify({ id: id, method: method, args: args || {} })
            );
          });
        },
        ping:            function()  { return this._call('ping', {}); },
        capturePhoto:    function(a) { return this._call('capturePhoto', a || {}); },
        getAuthToken:    function()  { return this._call('getAuthToken', {}); },
        getNetworkState: function()  { return this._call('getNetworkState', {}); },
        readFile:        function(a) { return this._call('readFile', a || {}); },
        scanBarcode:     function()  { return this._call('scanBarcode', {}); },
      };
    })();
  ''';

  void _subscribeToConnectivity() {
    _connectivitySubscription = Connectivity()
        .onConnectivityChanged
        .listen((ConnectivityResult result) {
      final isOnline = result != ConnectivityResult.none;
      if (isOnline && !_wasOnline && _ready) {
        _controller.executeScript(
            'window.dispatchEvent(new CustomEvent("foundry:online"));');
      }
      _wasOnline = isOnline;
    });
  }

  @override
  void dispose() {
    _connectivitySubscription?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        if (_ready) Webview(_controller),
        if (!_ready) const Center(child: CircularProgressIndicator()),
      ],
    );
  }
}
```

---

## Deliverable 4: lib/screens/module_list_screen.dart — platform-conditional WebView

**File:** `flutter/lib/screens/module_list_screen.dart`

**Add import at top:**
```dart
import 'dart:io';
import '../webview/module_webview_windows.dart';
```

**Replace the `ModuleWebView` usage in `_buildBody()`:**

Find this line:
```dart
return ModuleWebView(url: url, authContext: _authContext);
```

Replace with:
```dart
return Platform.isWindows
    ? ModuleWebViewWindows(url: url, authContext: _authContext)
    : ModuleWebView(url: url, authContext: _authContext);
```

---

## Deliverable 5: macOS Entitlements

**File:** `flutter/macos/Runner/DebugProfile.entitlements`

Replace entire file content with:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.cs.allow-jit</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
	<key>com.apple.security.network.server</key>
	<true/>
	<key>com.apple.security.files.user-selected.read-only</key>
	<true/>
</dict>
</plist>
```

**File:** `flutter/macos/Runner/Release.entitlements`

Replace entire file content with:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.app-sandbox</key>
	<true/>
	<key>com.apple.security.network.client</key>
	<true/>
	<key>com.apple.security.network.server</key>
	<true/>
	<key>com.apple.security.files.user-selected.read-only</key>
	<true/>
</dict>
</plist>
```

**Entitlements explained:**
- `network.client` — allows outbound HTTP (API calls to Vercel backend + CDN downloads)
- `network.server` — allows local HTTP server on localhost (shelf serving React modules)
- `files.user-selected.read-only` — allows file picker to read image files user selects

**Acceptance Criteria:**
- AC-11.5: `grep "network.client" flutter/macos/Runner/DebugProfile.entitlements` → match
- AC-11.6: `grep "network.client" flutter/macos/Runner/Release.entitlements` → match

---

## Build Order

1. Edit `pubspec.yaml` — add `file_picker` and `webview_windows`
2. Run `flutter pub get`
3. Edit `lib/bridge/shell_bridge.dart` — platform-conditional camera + barcode
4. Create `lib/webview/module_webview_windows.dart` — new Windows WebView
5. Edit `lib/screens/module_list_screen.dart` — platform-conditional WebView selector
6. Edit `macos/Runner/DebugProfile.entitlements`
7. Edit `macos/Runner/Release.entitlements`
8. Run `flutter analyze` on modified files
9. Verify all ACs

---

## What Builder Must NOT Do

- Do not modify `main.dart` (Firebase init stays as-is)
- Do not touch `google-services.json` or any existing plist files
- Do not modify `module_webview.dart` (keep unchanged — still used for Android/iOS/macOS)
- Do not add Firebase Windows config (operator action)

---

## Operator Actions (NOT Builder)

1. macOS Firebase: Register macOS app in Firebase Console → download `GoogleService-Info.plist`
   → place at `flutter/macos/Runner/GoogleService-Info.plist`
2. Windows Firebase: Run `flutterfire configure` after installing FlutterFire CLI

---

## Acceptance Criteria Summary

| AC | Criterion | Test Command | Pass Condition |
|---|---|---|---|
| AC-11.1 | webview_windows in pubspec | `grep "webview_windows" flutter/pubspec.yaml` | match found |
| AC-11.2 | file_picker in pubspec | `grep "file_picker" flutter/pubspec.yaml` | match found |
| AC-11.3 | module_webview_windows.dart exists | `ls flutter/lib/webview/module_webview_windows.dart` | file listed |
| AC-11.4 | Platform.is guards in shell_bridge | `grep -n "Platform.is" flutter/lib/bridge/shell_bridge.dart` | >= 2 matches |
| AC-11.5 | macOS DebugProfile has network.client | `grep "network.client" flutter/macos/Runner/DebugProfile.entitlements` | match found |
| AC-11.6 | macOS Release has network.client | `grep "network.client" flutter/macos/Runner/Release.entitlements` | match found |
| AC-11.7 | flutter analyze clean | `cd flutter && flutter analyze lib/bridge/shell_bridge.dart lib/webview/module_webview_windows.dart lib/screens/module_list_screen.dart` | zero errors |
