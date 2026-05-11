# Phase 4 — Native Capabilities

```
PHASE_ID: phase-4-native-capabilities
PLANNER_DOC_VERSION: 1.0.0
GENERATED: 2026-04-02T00:00:00Z
```

---

## WHAT_TO_BUILD

Replace four bridge stubs in `shell_bridge.dart` with real native implementations:

| Method | Current | Phase 4 |
|--------|---------|---------|
| `capturePhoto` | stub → `{path: 'test.jpg', stub: true}` | Real Android camera via `image_picker` |
| `getNetworkState` | "not implemented" | Real connectivity via `connectivity_plus` (already in pubspec) |
| `submitTransaction` | "not implemented" | POST to `/api/reports` → Supabase `reports` table |
| `scanBarcode` | "not implemented" | Full-screen camera scanner via `mobile_scanner` |

Four tracks ship together: Flutter packages + bridge + backend endpoint + React module update.

---

## NEW PUBSPEC DEPENDENCIES

Add to `flutter/pubspec.yaml` under `dependencies`:
```yaml
image_picker: ^1.1.2
mobile_scanner: ^5.2.3
```

`connectivity_plus: 5.0.0` already present — no change.

---

## ANDROID PERMISSIONS

File: `flutter/android/app/src/main/AndroidManifest.xml`
Add inside `<manifest>` before `<application>`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="false" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29" />
```

---

## DATA FLOW DIAGRAMS

### capturePhoto
```
React: shellBridge._call('capturePhoto', {})
  → ShellBridge.handleCall
       ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85)
       ← XFile? (null = cancelled)
       → { path: xFile.path, cancelled: false }
  → JS: { success: true, data: { path: '/data/.../image.jpg' } }
React: <img src="file:///data/..." />
```

### getNetworkState
```
React: shellBridge._call('getNetworkState', {})
  → Connectivity().checkConnectivity()
  ← ConnectivityResult
  → { isOnline: bool, type: 'wifi'|'mobile'|'none' }
```

### submitTransaction
```
React: shellBridge._call('submitTransaction', { moduleSlug, payload })
  → ShellBridge reads JWT from AuthService
  → POST /api/reports  Authorization: Bearer <jwt>
       { moduleSlug, payload }
  ← { id, created_at }
  → JS: { success: true, data: { id: 'uuid', created_at: '...' } }
```

### scanBarcode
```
React: shellBridge._call('scanBarcode', {})
  → Navigator.push → BarcodeScannerScreen
       MobileScanner detects barcode → Navigator.pop({ value, format })
  → { value: '...', format: 'qr' }
```

---

## DELIVERABLES

### Flutter

| # | File | Action |
|---|------|--------|
| 1 | `flutter/pubspec.yaml` | Add image_picker + mobile_scanner |
| 2 | `flutter/android/app/src/main/AndroidManifest.xml` | Add camera permissions |
| 3 | `flutter/lib/bridge/barcode_scanner_screen.dart` | NEW — full-screen MobileScanner widget |
| 4 | `flutter/lib/bridge/shell_bridge.dart` | Replace 4 stubs, add imports, add BuildContext to constructor |
| 5 | `flutter/lib/webview/module_webview.dart` | Change `ShellBridge()` → `ShellBridge(context)` |

### Backend

| # | File | Action |
|---|------|--------|
| 6 | `backend/api/reports/index.js` | NEW — POST /api/reports, JWT protected, writes to Supabase |

No `vercel.json` change — existing `/api/(.*)` rewrite covers `/api/reports`.
No SQL migration — `reports` table already exists from Phase 2 schema.

### React Module

| # | File | Action |
|---|------|--------|
| 7 | `modules/quality-inspector/src/App.jsx` | Full update — wire all 4 new capabilities |
| 8 | Rebuild bundle | `npm run build` → copy dist to flutter/assets + backend/public |

---

## DETAILED FILE SPECS

### File 4: `shell_bridge.dart` changes

New imports:
```dart
import 'dart:convert';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:image_picker/image_picker.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter/material.dart';
import '../services/auth_service.dart';
```

Constructor change:
```dart
class ShellBridge {
  final BuildContext context;
  ShellBridge(this.context);
```

Case implementations:

**capturePhoto:**
```dart
case 'capturePhoto':
  final picker = ImagePicker();
  final XFile? photo = await picker.pickImage(
    source: ImageSource.camera,
    imageQuality: 85,
  );
  if (photo == null) return BridgeResult.ok({'cancelled': true}).toJson();
  return BridgeResult.ok({'path': photo.path, 'cancelled': false}).toJson();
```

**getNetworkState:**
```dart
case 'getNetworkState':
  final result = await Connectivity().checkConnectivity();
  final isOnline = result != ConnectivityResult.none;
  String type;
  switch (result) {
    case ConnectivityResult.wifi: type = 'wifi'; break;
    case ConnectivityResult.mobile: type = 'mobile'; break;
    default: type = 'none';
  }
  return BridgeResult.ok({'isOnline': isOnline, 'type': type}).toJson();
```

**submitTransaction:**
```dart
case 'submitTransaction':
  final moduleSlug = args['moduleSlug'] as String?;
  final payload = args['payload'] ?? {};
  if (moduleSlug == null) return BridgeResult.err('moduleSlug is required').toJson();
  final token = await AuthService().getToken();
  if (token == null) return BridgeResult.err('Not authenticated').toJson();
  final apiBase = dotenv.env['API_BASE_URL'] ?? '';
  final response = await http.post(
    Uri.parse('$apiBase/api/reports'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $token',
    },
    body: jsonEncode({'moduleSlug': moduleSlug, 'payload': payload}),
  );
  if (response.statusCode != 201) {
    final body = jsonDecode(response.body);
    return BridgeResult.err(body['error'] ?? 'Submit failed').toJson();
  }
  return BridgeResult.ok(jsonDecode(response.body) as Map<String, dynamic>).toJson();
```

**scanBarcode:**
```dart
case 'scanBarcode':
  final result = await Navigator.push<Map<String, dynamic>>(
    context,
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => const BarcodeScannerScreen(),
    ),
  );
  if (result == null) return BridgeResult.ok({'cancelled': true}).toJson();
  return BridgeResult.ok(result).toJson();
```

### File 3: `barcode_scanner_screen.dart`

Minimal full-screen scanner — `_scanned` guard prevents double-pop:
```dart
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

class BarcodeScannerScreen extends StatefulWidget {
  const BarcodeScannerScreen({super.key});
  @override State<BarcodeScannerScreen> createState() => _BarcodeScannerScreenState();
}

class _BarcodeScannerScreenState extends State<BarcodeScannerScreen> {
  bool _scanned = false;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Barcode'),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: MobileScanner(
        onDetect: (capture) {
          if (_scanned) return;
          final barcode = capture.barcodes.firstOrNull;
          if (barcode?.rawValue == null) return;
          _scanned = true;
          Navigator.pop(context, {
            'value': barcode!.rawValue,
            'format': barcode.format.toString().split('.').last.toLowerCase(),
            'cancelled': false,
          });
        },
      ),
    );
  }
}
```

---

## IMPLEMENTATION SEQUENCE

1. Add pubspec deps → `flutter pub get`
2. Add Android permissions to AndroidManifest.xml
3. Create `barcode_scanner_screen.dart`
4. Update `shell_bridge.dart` (4 stubs → real implementations)
5. Update `module_webview.dart` (pass context to ShellBridge)
6. Create `backend/api/reports/index.js`
7. Deploy backend (`vercel --prod`)
8. Update `App.jsx` (wire all 4 capabilities)
9. Rebuild React bundle → copy dist to flutter/assets + backend/public
10. Deploy backend again (new bundle.js in public/)
11. `flutter run` → test each bridge method

---

## ACCEPTANCE CRITERIA

| AC | Description |
|----|-------------|
| AC-1 | Capture Photo: real camera opens, image appears in WebView UI, path is a real filesystem path (not 'test.jpg') |
| AC-2 | Capture Photo cancel: user presses Back → bridge returns `{cancelled: true}`, no error shown |
| AC-3 | Network state on Wi-Fi: bridge returns `{isOnline: true, type: 'wifi'}`, UI shows "Online (wifi)" |
| AC-4 | Network state offline: airplane mode → `{isOnline: false, type: 'none'}`, UI shows "Offline" |
| AC-5 | Scan Barcode: scanner opens full-screen, QR code detected → Item Code field pre-filled, `{value, format}` in response |
| AC-6 | Submit Transaction: with itemCode filled, submit → row in Supabase reports table, response has `{id, created_at}` |
| AC-7 | Submit requires auth: expired/missing JWT → bridge returns error, no crash |
| AC-8 | No regression: ping → `{pong: true}`, getAuthToken → valid token string |

---

## NOTES

- `image_picker` handles Android activity result lifecycle automatically (no MainActivity changes)
- `file://` URIs from `image_picker` are accessible in Android WebView from app's own temp directory
- `ConnectivityResult` in `connectivity_plus 5.0`: wifi | mobile | ethernet | bluetooth | vpn | other | none
- No vercel.json change needed
- No SQL migration needed — `reports` table has `user_id, module_slug, payload, created_at`
