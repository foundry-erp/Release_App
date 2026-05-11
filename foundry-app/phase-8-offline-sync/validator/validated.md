# Validated Spec — Phase 8: Offline Queue + Sync + Network Detection
PHASE_ID: phase-8-offline-sync
VALIDATED: 2026-04-03
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 1.0.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE

---

## What To Build

React modules (quality-inspector, inventory-checker) gain offline-first capability via a
shared JS library called offline-core. Every user action is written to a per-module
IndexedDB queue immediately — regardless of connectivity. Photos are persisted to the
Flutter device file system; only their absolute file path is stored in the queue. When
network connectivity returns, each module's sync-manager drains its own queue
independently by reading queued entries, fetching file bytes from Flutter via the readFile
bridge method, and POSTing all actions as a batch to POST /api/sync. The user sees a
live pending-count badge at all times. On app reopen while online, any items that were
queued before a force-close sync automatically without user intervention.

Two Flutter-side changes underpin this:
1. shell_bridge.dart: capturePhoto is upgraded to save the photo to device storage and
   return filePath alongside dataUrl; a new readFile case is added; the submitTransaction
   case is completely removed.
2. module_webview.dart: apiBaseUrl is added to the __foundry_auth__ injection;
   connectivity_plus stream subscription is added inside each ModuleWebView instance,
   which dispatches a foundry:online CustomEvent to its own WebViewController when
   online state is detected.

---

## Deliverables

### DELIVERABLE 1 — modules/shared/offline-core/queue-manager.js
- **type**: New JavaScript module (ES module, .js)
- **path**: `modules/shared/offline-core/queue-manager.js`
- **purpose**: Provides all IndexedDB queue operations for a single module. Namespaced by moduleId so no module can touch another module's data.
- **interface**:
  ```js
  // Factory — call once per module, returns bound instance
  export function createQueueManager(moduleId) {
    // Returns object with these methods:
    return {
      // Open or reuse the IndexedDB database '{moduleId}_queue'
      // Object store name: 'actions'
      // keyPath: 'id' (auto-increment: false — id is caller-assigned UUID)
      // Indexes: status (non-unique)
      async init(),                          // Opens DB, creates store if needed

      // Add one entry. id must be a caller-supplied UUID string (crypto.randomUUID()).
      // filePath is optional — pass null when no file is associated.
      async enqueue({ id, type, payload, filePath }),
      // Stored record shape:
      // { id: string, type: string, payload: object, filePath: string|null,
      //   status: 'pending'|'syncing'|'synced'|'failed',
      //   retryCount: number (starts at 0), error: string|null,
      //   createdAt: number (Date.now()) }

      // Return all records where status === 'pending', ordered by createdAt ASC
      async getPending(),                    // returns Array<QueueRecord>

      // Update status (and optionally error string) for a single record by id
      async updateStatus(id, status, error), // error defaults to null

      // Count records where status === 'pending'
      async countPending(),                  // returns number

      // Remove a single record by id (called after confirmed sync, optional housekeeping)
      async remove(id),
    };
  }
  ```
- **constraints**:
  - DB name pattern: `{moduleId}_queue` — e.g., `quality-inspector_queue`, `inventory-checker_queue`
  - Object store name: `actions` (fixed string, same in every module's DB)
  - IDB version: 1 (do not increment unless schema changes)
  - Must use IndexedDB directly (no idb wrapper library) — no new npm dependencies
  - Must be an ES module (export/import syntax) — webpack bundles it per module
  - Must NOT reference window.shellBridge or window.__foundry_auth__ — pure data layer
- **edge_cases**:
  - IDB unavailable (private browsing restriction): catch the openDB error and throw `new Error('IndexedDB unavailable')` — caller catches and surfaces to user
  - Concurrent enqueue calls (e.g., double-tap Submit): each enqueue opens its own IDB transaction; no deduplication — duplicates are expected and acceptable (user submitted twice)
  - DB upgrade event fires for new installs: create 'actions' object store with keyPath 'id' and add index on 'status'
  - getPending on empty store: return `[]` not null
  - updateStatus called with unknown id: IDB put silently does nothing — this is acceptable

---

### DELIVERABLE 2 — modules/shared/offline-core/sync-manager.js
- **type**: New JavaScript module (ES module, .js)
- **path**: `modules/shared/offline-core/sync-manager.js`
- **purpose**: Reads pending queue entries, fetches file bytes for entries that have a filePath, and POSTs all actions as one batch to POST /api/sync. Marks entries synced or failed based on per-item response. Exposes getPendingCount so the UI can display the badge.
- **interface**:
  ```js
  // Factory — binds to one module's queue and auth context
  export function createSyncManager(moduleId, queueManager) {
    return {
      // Drain the queue: read all pending items, fetch any file bytes,
      // POST to /api/sync, mark each item synced or failed.
      // Returns { synced: number, failed: number }
      // MUST be idempotent — safe to call when queue is already empty (returns {synced:0,failed:0})
      async sync(),

      // Return the current count of pending items (delegates to queueManager.countPending())
      async getPendingCount(),   // returns number
    };
  }
  ```
- **sync() algorithm** (Builder must implement exactly this):
  1. Call `queueManager.getPending()`. If result is `[]`, return `{ synced: 0, failed: 0 }`.
  2. For each pending entry: call `queueManager.updateStatus(entry.id, 'syncing')`.
  3. For each syncing entry where `entry.filePath !== null`:
     - Call `window.shellBridge._call('readFile', { filePath: entry.filePath })`.
     - Response shape: `{ success: boolean, data: { dataUrl: string }, error: string }`.
     - If `success === false` OR dataUrl is absent: set `photoBase64 = null` (non-fatal — photo lost, proceed without it).
     - If `success === true`: set `photoBase64 = result.data.dataUrl` (the full `data:image/jpeg;base64,...` string).
  4. Build the actions array for the POST body:
     ```js
     const actions = entries.map(entry => ({
       type: entry.type,                          // e.g. 'submit_report' or 'stock_count'
       payload: {
         moduleSlug: moduleId,                    // 'quality-inspector' or 'inventory-checker'
         payload: entry.payload,                  // the original form data object
         ...(entry.filePath ? { photo: photoBase64Map[entry.id] } : {}),
       },
       local_id: entry.id,
     }));
     ```
  5. Read auth from `window.__foundry_auth__`: extract `token` (string) and `apiBaseUrl` (string).
  6. POST to `${apiBaseUrl}/api/sync` with headers:
     ```
     Content-Type: application/json
     Authorization: Bearer ${token}
     ```
     Body: `JSON.stringify({ actions })`.
  7. If HTTP response status is not 200: mark ALL syncing entries as `'failed'` with `error: 'HTTP ${status}'`. Return `{ synced: 0, failed: entries.length }`.
  8. Parse response JSON. Shape: `{ results: [{ local_id, success, server_id?, error? }] }`.
  9. For each result item:
     - If `success === true`: call `queueManager.updateStatus(local_id, 'synced')`.
     - If `success === false`: call `queueManager.updateStatus(local_id, 'failed', result.error)`. Also call `queueManager.updateStatus` to increment retryCount — see note below.
  10. Return `{ synced: countOfSucceeded, failed: countOfFailed }`.
- **retryCount**: When marking an entry failed, read current retryCount from queue record, increment by 1, store back. If `retryCount >= 3`, do NOT reset to 'pending' on the next foundry:online event — leave as 'failed' permanently and exclude from getPending(). Implement this by adding a filter in getPending: `status === 'pending' AND retryCount < 3`.
- **constraints**:
  - Max batch size per POST: 50 actions (matches backend limit). If getPending() returns more than 50, slice to first 50 and sync only those in this call. Remaining items will sync on the next foundry:online event.
  - Network error (fetch throws): catch, mark all syncing entries as 'failed', return `{ synced: 0, failed: n }`.
  - Timeout: use `AbortController` with 30-second timeout on the fetch call.
  - Must NOT import or use axios — use native `fetch` only.
  - photoBase64Map: a local `Map<string, string|null>` keyed by entry.id built in step 3.
- **edge_cases**:
  - Token missing from `window.__foundry_auth__`: throw `new Error('No auth token')`, mark all syncing entries failed.
  - apiBaseUrl missing: throw `new Error('No apiBaseUrl')`, mark all syncing entries failed.
  - Server returns results array shorter than actions array (partial response): only items present in results are processed; items NOT present in results are left as 'syncing' — they will be re-picked on next sync as 'syncing' items are treated as pending on re-init (see initOfflineSystem).
  - readFile called for a filePath that no longer exists on device (user cleared storage): bridge returns success:false — set photo to null, proceed.
  - sync() called concurrently (double foundry:online): second call sees entries already in 'syncing' state; getPending() returns empty (syncing entries are excluded from getPending); second sync returns {synced:0, failed:0} harmlessly.

---

### DELIVERABLE 3 — modules/shared/offline-core/ref-data-manager.js
- **type**: New JavaScript module (ES module, .js)
- **path**: `modules/shared/offline-core/ref-data-manager.js`
- **purpose**: TTL-based IndexedDB cache for reference data (product lists, dropdowns). Prevents repeated API calls. Each module has its own isolated ref DB.
- **interface**:
  ```js
  export function createRefDataManager(moduleId) {
    // DB name: '{moduleId}_ref'
    // Object store name: 'cache'
    // keyPath: 'key' (string — caller-defined cache key, e.g. 'products')
    return {
      async init(),

      // Store value under key with TTL in milliseconds
      async set(key, value, ttlMs),
      // Stored record: { key: string, value: any, expiresAt: number (Date.now() + ttlMs) }

      // Return value if exists and not expired; null otherwise
      async get(key),           // returns value or null

      // Explicitly delete a key
      async delete(key),
    };
  }
  ```
- **constraints**:
  - DB version: 1
  - No automatic TTL sweep — get() checks expiresAt at read time only
  - No new npm dependencies — native IDB only
- **edge_cases**:
  - get() on expired entry: return null (do NOT delete the entry — lazy cleanup only)
  - get() on missing key: return null
  - IDB unavailable: catch and throw `new Error('IndexedDB unavailable')`

---

### DELIVERABLE 4 — modules/shared/offline-core/index.js
- **type**: New JavaScript module (ES module, .js)
- **path**: `modules/shared/offline-core/index.js`
- **purpose**: The single entry point that modules import. Wires queue + sync + ref together, registers the foundry:online event listener, performs startup sync check.
- **interface**:
  ```js
  // Returns { queueManager, syncManager, refDataManager, getPendingCount }
  // moduleId: 'quality-inspector' | 'inventory-checker'
  export async function initOfflineSystem(moduleId) {
    // 1. Create and init all three managers
    // 2. Register window event listener for 'foundry:online'
    //    On fire: call syncManager.sync() — fire-and-forget (don't await in listener)
    // 3. Startup sync check:
    //    a. Call window.shellBridge._call('getNetworkState', {})
    //    b. If result.data.isOnline === true AND await queueManager.countPending() > 0:
    //       call syncManager.sync() — fire-and-forget
    // 4. Return { queueManager, syncManager, refDataManager }
  }
  ```
- **constraints**:
  - initOfflineSystem must be called exactly once, inside a React useEffect with empty dependency array `[]`
  - If shellBridge is not yet available at call time (race condition on very slow devices): wrap step 3a in try/catch; if it throws, skip startup sync silently (the next foundry:online event will trigger sync)
  - Re-register foundry:online listener is safe — each WebView is a separate JS context, so no duplicate listeners across modules
  - 'syncing' entries left over from a crashed previous session: on init, call a cleanup step that resets any entries with status='syncing' back to status='pending' (retryCount unchanged) before performing the startup sync check
- **edge_cases**:
  - Module loaded while already online with 0 pending items: startup check completes, does nothing
  - Module loaded while offline: startup check finds isOnline=false, does nothing; sync waits for foundry:online event
  - foundry:online fires before initOfflineSystem completes (extremely unlikely given IndexedDB init speed, but defensive): listener registration is the last step after managers are init'd — any event arriving before listener registration is lost; this is acceptable given the startup sync check covers the boot-time case

---

### DELIVERABLE 5 — modules/quality-inspector/webpack.config.js
- **type**: Modified file (replace existing)
- **path**: `modules/quality-inspector/webpack.config.js`
- **purpose**: Add `@shared` webpack alias so `import { ... } from '@shared/offline-core'` resolves to `modules/shared/`.
- **exact change**: In the `resolve` section, add an `alias` key:
  ```js
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  ```
- **constraints**: No other changes to webpack.config.js. The `path` module is already available via `require('path')` at line 1 — no new require needed.
- **edge_cases**:
  - If `__dirname` is the quality-inspector root (`modules/quality-inspector/`), then `../shared` resolves to `modules/shared/` — this is correct.

---

### DELIVERABLE 6 — modules/inventory-checker/webpack.config.js
- **type**: Modified file (replace existing)
- **path**: `modules/inventory-checker/webpack.config.js`
- **purpose**: Same @shared alias as quality-inspector.
- **exact change**: Identical alias block as Deliverable 5. The inventory-checker webpack.config.js is currently identical to quality-inspector's config (confirmed by file read) — same change applies.
- **constraints**: No other changes.

---

### DELIVERABLE 7 — modules/quality-inspector/src/App.jsx
- **type**: Modified file (complete rewrite of App component logic — styles and ErrorBoundary class are preserved)
- **path**: `modules/quality-inspector/src/App.jsx`
- **purpose**: Replace the direct submitTransaction bridge call with offline-core queue; add pendingCount badge; add useEffect to init offline system; add photo filePath capture.

**Current state (from file read)**:
- Calls `callBridge('submitTransaction', {...})` directly in handleSubmit
- No pending count state
- No useEffect for offline init
- capturePhoto only reads `res.data?.dataUrl` — does not read `res.data?.filePath`
- Badge element exists in styles but is hard-coded to "Phase 4 — Native Capabilities"

**Required new behavior** (Builder implements exactly this):

```jsx
import React, { useState, useEffect } from 'react';
import { initOfflineSystem } from '@shared/offline-core';
// ... ErrorBoundary class unchanged ...
// ... styles object unchanged EXCEPT badge text will change at runtime ...

function App() {
  const [itemCode,      setItemCode]      = useState('');
  const [notes,         setNotes]         = useState('');
  const [photoDataUrl,  setPhotoDataUrl]  = useState(null);
  const [photoFilePath, setPhotoFilePath] = useState(null);  // NEW
  const [barcode,       setBarcode]       = useState(null);
  const [networkState,  setNetworkState]  = useState(null);
  const [result,        setResult]        = useState(null);
  const [error,         setError]         = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [pendingCount,  setPendingCount]  = useState(0);     // NEW
  const [offlineReady,  setOfflineReady]  = useState(false); // NEW — gates submit until init done

  // Refs to hold manager instances across renders
  const queueRef   = React.useRef(null);
  const syncRef    = React.useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { queueManager, syncManager } = await initOfflineSystem('quality-inspector');
        if (cancelled) return;
        queueRef.current = queueManager;
        syncRef.current  = syncManager;
        const count = await queueManager.countPending();
        if (!cancelled) {
          setPendingCount(count);
          setOfflineReady(true);
        }
      } catch (e) {
        console.error('[QI] Offline init failed:', e);
      }
    }
    init();
    // Poll pending count every 3 seconds to update badge after sync completes
    const interval = setInterval(async () => {
      if (queueRef.current) {
        const count = await queueRef.current.countPending();
        setPendingCount(count);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handleCapturePhoto() {
    await withBridge('capturePhoto', async () => {
      const res = await callBridge('capturePhoto');
      if (!res.success) { setError(res.error); return; }
      if (res.data?.cancelled) return;
      setPhotoDataUrl(res.data?.dataUrl);
      setPhotoFilePath(res.data?.filePath ?? null);  // CHANGED — capture filePath
      setResult({ method: 'capturePhoto', response: { success: res.success } });
    });
  }

  async function handleSubmit() {
    if (!queueRef.current) { setError('Offline system not ready'); return; }
    await withBridge('submit', async () => {
      const entry = {
        id:       crypto.randomUUID(),
        type:     'submit_report',
        payload:  { itemCode, notes, barcode },
        filePath: photoFilePath ?? null,
      };
      await queueRef.current.enqueue(entry);
      // Optimistically update badge
      const count = await queueRef.current.countPending();
      setPendingCount(count);
      // Try immediate sync if online
      if (syncRef.current) {
        syncRef.current.sync().then(async () => {
          const updated = await queueRef.current.countPending();
          setPendingCount(updated);
        }).catch(() => {/* offline — ignore */});
      }
      // Clear form
      setItemCode('');
      setNotes('');
      setPhotoDataUrl(null);
      setPhotoFilePath(null);
      setBarcode(null);
      setResult({ method: 'submit', response: { queued: true } });
    });
  }
  // handleScanBarcode, handleGetNetwork, handlePing — UNCHANGED from current file

  // Badge rendering:
  // REPLACE the hard-coded badge text 'Phase 4 — Native Capabilities' with:
  // {pendingCount > 0 ? `${pendingCount} pending` : 'All synced'}
  // Badge background color: unchanged (#6C63FF) whether pending or synced

  // Submit button:
  // disabled condition: loading || !itemCode || !offlineReady
  // button label: loading ? 'Saving...' : 'Submit Report'
  // NOTE: button no longer says 'Submitting...' — it saves to queue then returns immediately
}
```

- **constraints**:
  - Do NOT remove handleScanBarcode, handleGetNetwork, handlePing, handleCapturePhoto from the file
  - Do NOT remove the "Check Network" button or "Ping Bridge" buttons from the JSX
  - Do NOT remove the photo display `<img>` or barcode strip
  - The `callBridge` local function at top of file (direct `window.shellBridge._call`) can remain for non-submit bridge calls — only handleSubmit changes to use offline-core
  - Remove the old `handleSubmit` that called `callBridge('submitTransaction', ...)` entirely
  - ErrorBoundary class: no changes
  - styles object: no changes
- **edge_cases**:
  - offlineReady is false when user taps submit: disabled button prevents call; setError('Offline system not ready') is defensive belt-and-suspenders
  - crypto.randomUUID() not available on old Android WebView: unlikely (Android 6+), but if it throws, catch and fall back to `Date.now().toString() + Math.random().toString(36).slice(2)`

---

### DELIVERABLE 8 — modules/inventory-checker/src/App.jsx
- **type**: Modified file (complete rewrite of App component logic — styles and ErrorBoundary preserved)
- **path**: `modules/inventory-checker/src/App.jsx`
- **purpose**: Replace the direct submitTransaction bridge call with offline-core queue; add pendingCount badge; add useEffect to init offline system.

**Current state (from file read)**:
- Calls `callBridge('submitTransaction', {...})` directly in handleSubmit
- No pending count state, no useEffect, no badge

**Required new behavior** (Builder implements exactly this):

```jsx
import React, { useState, useEffect } from 'react';
import { initOfflineSystem } from '@shared/offline-core';
// ErrorBoundary and styles: UNCHANGED

function App() {
  const [sku,          setSku]          = useState('');
  const [location,     setLocation]     = useState('');
  const [quantity,     setQuantity]     = useState('');
  const [result,       setResult]       = useState(null);
  const [error,        setError]        = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [pendingCount, setPendingCount] = useState(0);     // NEW
  const [offlineReady, setOfflineReady] = useState(false); // NEW

  const queueRef = React.useRef(null);
  const syncRef  = React.useRef(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const { queueManager, syncManager } = await initOfflineSystem('inventory-checker');
        if (cancelled) return;
        queueRef.current = queueManager;
        syncRef.current  = syncManager;
        const count = await queueManager.countPending();
        if (!cancelled) {
          setPendingCount(count);
          setOfflineReady(true);
        }
      } catch (e) {
        console.error('[IC] Offline init failed:', e);
      }
    }
    init();
    const interval = setInterval(async () => {
      if (queueRef.current) {
        const count = await queueRef.current.countPending();
        setPendingCount(count);
      }
    }, 3000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  async function handleSubmit() {
    if (!queueRef.current) { setError('Offline system not ready'); return; }
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const entry = {
        id:       crypto.randomUUID(),
        type:     'stock_count',
        payload:  { sku, location, quantity: parseInt(quantity, 10) || 0 },
        filePath: null,  // inventory-checker never has photos
      };
      await queueRef.current.enqueue(entry);
      const count = await queueRef.current.countPending();
      setPendingCount(count);
      if (syncRef.current) {
        syncRef.current.sync().then(async () => {
          const updated = await queueRef.current.countPending();
          setPendingCount(updated);
        }).catch(() => {});
      }
      setSku('');
      setLocation('');
      setQuantity('');
      setResult({ method: 'submit', response: { queued: true } });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  // handlePing: UNCHANGED

  // Badge: ADD a badge element below the existing header div (above the fields):
  // <span style={styles.badge}>
  //   {pendingCount > 0 ? `${pendingCount} pending` : 'All synced'}
  // </span>
  // Use existing styles.badge (background '#1a7a4a') — no new style needed

  // canSubmit condition: !loading && sku.trim() && quantity.trim() && offlineReady
  // Submit button label: loading ? 'Saving...' : 'Submit Count'
}
```

- **constraints**:
  - Do NOT remove handlePing, Ping Bridge button, or result/error display sections
  - Remove the old handleSubmit that called `callBridge('submitTransaction', ...)` entirely
  - The local `callBridge` function at top of file: keep it for handlePing
  - ErrorBoundary: no changes; styles: no changes
- **edge_cases**:
  - quantity field is empty string: parseInt('', 10) returns NaN; `|| 0` coerces to 0 — this matches current behavior, acceptable
  - sku required by canSubmit: empty SKU prevents submit — same gate as current code

---

### DELIVERABLE 9 — flutter/lib/bridge/shell_bridge.dart
- **type**: Modified file
- **path**: `flutter/lib/bridge/shell_bridge.dart`
- **purpose**: Three changes: (a) upgrade capturePhoto to save to file system and return filePath; (b) add readFile case; (c) remove submitTransaction case entirely.

**Change A — capturePhoto upgrade**:

Replace the entire existing `case 'capturePhoto':` block (lines 60–76 in current file) with:

```dart
case 'capturePhoto':
  final picker = ImagePicker();
  final XFile? photo = await picker.pickImage(
    source: ImageSource.camera,
    imageQuality: 80,
    maxWidth: 1024,
  );
  if (photo == null) {
    return BridgeResult.ok({'cancelled': true}).toJson();
  }
  // Save to app documents directory for queue persistence
  final directory = await getApplicationDocumentsDirectory();
  final photosDir = Directory('${directory.path}/photos');
  if (!await photosDir.exists()) {
    await photosDir.create(recursive: true);
  }
  final timestamp = DateTime.now().millisecondsSinceEpoch;
  final savedPath = '${photosDir.path}/$timestamp.jpg';
  await File(photo.path).copy(savedPath);
  // Read bytes for immediate display in React UI
  final bytes = await File(savedPath).readAsBytes();
  final b64 = base64Encode(bytes);
  return BridgeResult.ok({
    'cancelled': false,
    'dataUrl': 'data:image/jpeg;base64,$b64',
    'filePath': savedPath,
  }).toJson();
```

New import required at top of file (if not already present):
```dart
import 'package:path_provider/path_provider.dart';
```
`path_provider` is already in pubspec.yaml at `^2.1.0` — no new dependency needed.
`dart:io` is already imported at line 2 — `Directory` and `File` are available.

**Change B — add readFile case**:

Insert after the capturePhoto case and before the getNetworkState case:

```dart
case 'readFile':
  final filePath = args['filePath'] as String?;
  if (filePath == null || filePath.isEmpty) {
    return BridgeResult.err('filePath is required').toJson();
  }
  final file = File(filePath);
  if (!await file.exists()) {
    return BridgeResult.err('File not found: $filePath').toJson();
  }
  final bytes = await file.readAsBytes();
  final b64 = base64Encode(bytes);
  return BridgeResult.ok({
    'dataUrl': 'data:image/jpeg;base64,$b64',
  }).toJson();
```

**Change C — remove submitTransaction**:

Delete the entire `case 'submitTransaction':` block (lines 91–113 in current file, from `case 'submitTransaction':` through the closing `).toJson();` of that case).

After deletion, the switch will go directly from `getNetworkState` case to `scanBarcode` case.

Also remove the `import 'package:http/http.dart' as http;` import IF it is only used by submitTransaction (it is — confirmed by file read). Remove that import line entirely.

**Class docstring**: Update the phase comment at line 37–38 from:
```dart
/// Phase 4: capturePhoto (real), getNetworkState, submitTransaction, scanBarcode
```
to:
```dart
/// Phase 4: capturePhoto (upgraded), getNetworkState, scanBarcode
/// Phase 8: capturePhoto saves to file system + returns filePath; readFile added; submitTransaction removed
```

- **constraints**:
  - No other changes to shell_bridge.dart beyond the three described above
  - The BridgeResult class, handleCall signature, all other cases: untouched
  - getApplicationDocumentsDirectory() is from path_provider — already in pubspec
- **edge_cases**:
  - photos directory creation fails (disk full): the Directory.create() call throws; caught by outer try/catch in handleCall; returns BridgeResult.err(e.toString())
  - readFile: path traversal attack (malicious JS passes '../../../../etc/passwd'): not defended against in this phase — out of scope; bridge is only called from app-controlled JS
  - readFile: file is very large (>10MB photo): readAsBytes loads entirely into memory; this is acceptable given imageQuality:80 and maxWidth:1024 cap at roughly 200-400KB
  - capturePhoto: user denies camera permission: picker.pickImage returns null; handled by `if (photo == null)` returning `{'cancelled': true}`

---

### DELIVERABLE 10 — flutter/lib/webview/module_webview.dart
- **type**: Modified file
- **path**: `flutter/lib/webview/module_webview.dart`
- **purpose**: Two changes: (a) add apiBaseUrl to the __foundry_auth__ injection; (b) add connectivity stream subscription inside _ModuleWebViewState that dispatches foundry:online CustomEvent to this widget's WebViewController when connectivity returns.

**Change A — apiBaseUrl injection**:

In `_injectAuthContext()`, the current code does:
```dart
final encoded = jsonEncode(widget.authContext);
await _controller.runJavaScript('''
  window.__foundry_auth__ = $encoded;
```

The `widget.authContext` map is passed from ModuleListScreen._startServer() which currently builds:
```dart
_authContext = {'token': token, 'user': user ?? {}};
```

The authContext map does NOT currently contain apiBaseUrl. The fix is in ModuleListScreen (see Deliverable 11) which adds apiBaseUrl to the map before passing it to ModuleWebView. Because `_injectAuthContext` already does `jsonEncode(widget.authContext)` and the map will now contain the apiBaseUrl key, no change is needed inside module_webview.dart for this specific injection — the existing jsonEncode handles the new key automatically.

HOWEVER: the injected bridge interface in `_injectBridgeInterface()` still declares:
```js
submitTransaction: function(a){ return this._call('submitTransaction', a); },
```
This line must be REMOVED from the injected JS string. The full updated `window.shellBridge = { ... }` object after removal:
```js
window.shellBridge = {
  _call: function(method, args) { /* unchanged */ },
  ping:            function()   { return this._call('ping', {}); },
  capturePhoto:    function(a)  { return this._call('capturePhoto', a || {}); },
  getAuthToken:    function()   { return this._call('getAuthToken', {}); },
  getNetworkState: function()   { return this._call('getNetworkState', {}); },
  readFile:        function(a)  { return this._call('readFile', a || {}); },
  scanBarcode:     function()   { return this._call('scanBarcode', {}); },
};
```
Note: `readFile` is added; `submitTransaction` is removed.

**Change B — connectivity stream subscription**:

Add the following imports at the top of module_webview.dart (after existing imports):
```dart
import 'dart:async';
import 'package:flutter_dotenv/flutter_dotenv.dart';
```
`connectivity_plus` is already imported in shell_bridge.dart but NOT in module_webview.dart — add:
```dart
import 'package:connectivity_plus/connectivity_plus.dart';
```

Add a new field to `_ModuleWebViewState`:
```dart
StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
bool _wasOnline = false;
```

In `initState()`, after `_initWebView();`, add:
```dart
_subscribeToConnectivity();
```

Add new method `_subscribeToConnectivity()`:
```dart
void _subscribeToConnectivity() {
  _connectivitySubscription = Connectivity()
      .onConnectivityChanged
      .listen((List<ConnectivityResult> results) {
    final isOnline = results.any((r) => r != ConnectivityResult.none);
    if (isOnline && !_wasOnline) {
      // Transitioned from offline to online — notify JS
      _dispatchOnlineEvent();
    }
    _wasOnline = isOnline;
  });
}
```

Add new method `_dispatchOnlineEvent()`:
```dart
Future<void> _dispatchOnlineEvent() async {
  if (!_pageLoaded) return;
  print('[WebView] Dispatching foundry:online to ${widget.url}');
  await _controller.runJavaScript('''
    window.dispatchEvent(new CustomEvent('foundry:online'));
  ''');
}
```

In `dispose()`, cancel the subscription:
```dart
@override
void dispose() {
  _connectivitySubscription?.cancel();
  super.dispose();
}
```

- **connectivity_plus v5.x API** (confirmed resolved from planner's UNCLEAR flag):
  - `onConnectivityChanged` stream emits `List<ConnectivityResult>` (not a single value)
  - Online detection: `results.any((r) => r != ConnectivityResult.none)`
  - pubspec.yaml already has `connectivity_plus: 5.0.0` (exact version, not caret) — confirmed by file read
  - Do NOT use `await Connectivity().checkConnectivity()` in the stream listener — use the emitted list directly

- **constraints**:
  - The subscription lives INSIDE _ModuleWebViewState — NOT in ModuleListScreen. Each WebView widget manages its own subscription. This avoids any need to expose _controller to external classes.
  - ModuleListScreen does NOT change its connectivity handling (it has none currently — keep it that way)
  - _wasOnline initial value is `false` — this means the very first stream event, if it says "online", WILL fire _dispatchOnlineEvent. This is correct for the boot-while-online scenario: module loads, first stream event arrives saying "online", JS gets notified, initOfflineSystem's startup sync check also runs. The startup sync check in offline-core handles this gracefully (idempotent).
  - `_pageLoaded` guard in _dispatchOnlineEvent ensures we don't try to runJavaScript before the page has finished loading.
- **edge_cases**:
  - connectivity stream fires multiple rapid events (WiFi scan): `_wasOnline` gate deduplicates — only the first transition from false→true fires the event
  - WebView is in IndexedStack but not visible (user on module list overlay): JS still executes in IndexedStack hidden WebViews — foundry:online fires and sync proceeds in background; this is the intended behavior per architecture decision
  - dispose() called before stream subscription is set up (extremely fast unmount): `?` null-safety on `_connectivitySubscription?.cancel()` handles this

---

### DELIVERABLE 11 — flutter/lib/screens/module_list_screen.dart
- **type**: Modified file
- **path**: `flutter/lib/screens/module_list_screen.dart`
- **purpose**: Add apiBaseUrl to the _authContext map so it gets injected into window.__foundry_auth__.
- **exact change**: In `_startServer()`, find the line:
  ```dart
  _authContext = {'token': token, 'user': user ?? {}};
  ```
  Replace with:
  ```dart
  _authContext = {
    'token': token,
    'user': user ?? {},
    'apiBaseUrl': dotenv.env['API_BASE_URL'] ?? '',
  };
  ```
- **import required**: Add at top of file:
  ```dart
  import 'package:flutter_dotenv/flutter_dotenv.dart';
  ```
  `flutter_dotenv` is already in pubspec.yaml at `^5.1.0`.
- **constraints**: No other changes to module_list_screen.dart.
- **edge_cases**:
  - API_BASE_URL missing from .env: dotenv.env['API_BASE_URL'] returns null; `?? ''` coerces to empty string; sync-manager will throw 'No apiBaseUrl' and fail gracefully without crashing

---

### DELIVERABLE 12 — flutter/pubspec.yaml
- **type**: Modified file
- **path**: `flutter/pubspec.yaml`
- **purpose**: Register inventory-checker asset path so Flutter's local HTTP server can serve the module bundle.
- **exact change**: In the `flutter: > assets:` section, add:
  ```yaml
  - assets/modules/inventory-checker/
  ```
  After the existing `- assets/modules/quality-inspector/` line.
- **final assets section** after change:
  ```yaml
  flutter:
    uses-material-design: true
    assets:
      - assets/test_module/
      - assets/modules/quality-inspector/
      - assets/modules/inventory-checker/
      - .env
  ```
- **constraints**: No other changes to pubspec.yaml.
- **edge_cases**:
  - The directory `flutter/assets/modules/inventory-checker/` must exist with at least `index.html` and `bundle.js` before `flutter run` (populated by Deliverable 14b). If the directory is missing, flutter build will fail with "asset not found".

---

### DELIVERABLE 13 — backend/api/sync/index.js
- **type**: Modified file
- **path**: `backend/api/sync/index.js`
- **purpose**: Add moduleSlug validation for submit_report action type. The plan (plan.md) flagged this as a carry-forward item from Phase 7 reviewer.
- **exact change**: In the `submit_report` action handler, after extracting `moduleSlug`:
  ```js
  const moduleSlug = action.payload?.moduleSlug;
  ```
  Add validation immediately after:
  ```js
  const VALID_MODULE_SLUGS = ['quality-inspector', 'inventory-checker'];
  if (!moduleSlug || !VALID_MODULE_SLUGS.includes(moduleSlug)) {
    results.push({
      local_id: localId,
      success: false,
      error: `Invalid or missing moduleSlug: ${moduleSlug}`,
    });
    continue;
  }
  ```
- **constraints**:
  - The `VALID_MODULE_SLUGS` constant must be defined inside the `if (action.type === 'submit_report')` block, not at module scope — to keep the change minimal and avoid future drift.
  - The `stock_count` action handler does NOT need moduleSlug validation — it hardcodes 'inventory-checker' internally.
  - No other changes to backend/api/sync/index.js.
- **edge_cases**:
  - moduleSlug is undefined (old client without the field): caught by `!moduleSlug` check; returns success:false with descriptive error; entry stays in queue; retryCount increments; after 3 retries it is permanently failed. This is intentional — old clients without moduleSlug would have broken sync anyway.
  - moduleSlug is a valid string but not in VALID_MODULE_SLUGS (e.g., 'test-module'): rejected with descriptive error.

---

### DELIVERABLE 14a — modules/quality-inspector dist rebuild
- **type**: Build artifact (not a source file — Builder runs the build command)
- **path**: `modules/quality-inspector/dist/` → copied to `flutter/assets/modules/quality-inspector/`
- **purpose**: Rebuilt bundle includes offline-core and the new App.jsx submit logic.
- **build command**:
  ```bash
  cd modules/quality-inspector && npm run build
  ```
  Then copy:
  ```bash
  cp -r modules/quality-inspector/dist/. flutter/assets/modules/quality-inspector/
  ```
- **constraints**: `npm run build` must run with `NODE_ENV=production` (webpack uses `argv.mode` — ensure package.json build script passes `--mode production`). Check existing package.json before running — if script is `webpack`, add `--mode production`.
- **pass condition**: `flutter/assets/modules/quality-inspector/bundle.js` exists and is newer than before the build.

---

### DELIVERABLE 14b — modules/inventory-checker dist rebuild
- **type**: Build artifact
- **path**: `modules/inventory-checker/dist/` → copied to `flutter/assets/modules/inventory-checker/`
- **purpose**: Rebuilt bundle includes offline-core and the new App.jsx submit logic.
- **build command**:
  ```bash
  cd modules/inventory-checker && npm run build
  ```
  Then copy:
  ```bash
  cp -r modules/inventory-checker/dist/. flutter/assets/modules/inventory-checker/
  ```
- **constraints**: Same as 14a. The `flutter/assets/modules/inventory-checker/` directory must be created if it does not exist before copying: `mkdir -p flutter/assets/modules/inventory-checker/`.

---

### DELIVERABLE 15 — modules/shared/bridge_helper.js
- **type**: Modified file
- **path**: `modules/shared/bridge_helper.js`
- **purpose**: Remove the `submitTransaction` export; add `readFile` export.
- **exact changes**:
  - Remove the `submitTransaction` function export entirely (lines 56–61 in current file).
  - Add new export:
    ```js
    /** Read a file from Flutter file system by absolute path (Phase 8). */
    export function readFile(filePath) {
      return callBridge('readFile', { filePath });
    }
    ```
  - Update the `capturePhoto` JSDoc to reflect Phase 8 return shape:
    ```js
    /**
     * Capture a photo. Returns { success, data: { cancelled, dataUrl?, filePath? } }.
     * filePath is the absolute device path for queue storage.
     * dataUrl is the base64 data URL for immediate display.
     */
    ```
- **constraints**: All other exports (ping, getAuthToken, getNetworkState, scanBarcode, getAuthContext, callBridge) remain unchanged.

---

## File Manifest

| filepath | action | description |
|---|---|---|
| `modules/shared/offline-core/queue-manager.js` | CREATE | IndexedDB action queue, namespaced per module |
| `modules/shared/offline-core/sync-manager.js` | CREATE | Queue drain + /api/sync POST, readFile bridge call |
| `modules/shared/offline-core/ref-data-manager.js` | CREATE | TTL-based IndexedDB reference data cache |
| `modules/shared/offline-core/index.js` | CREATE | Factory: wires all managers, registers foundry:online listener |
| `modules/quality-inspector/webpack.config.js` | MODIFY | Add `@shared` resolve alias |
| `modules/inventory-checker/webpack.config.js` | MODIFY | Add `@shared` resolve alias |
| `modules/quality-inspector/src/App.jsx` | MODIFY | Replace submitTransaction with offline queue; add pending badge; capture filePath |
| `modules/inventory-checker/src/App.jsx` | MODIFY | Replace submitTransaction with offline queue; add pending badge |
| `modules/shared/bridge_helper.js` | MODIFY | Remove submitTransaction export; add readFile export; update capturePhoto JSDoc |
| `flutter/lib/bridge/shell_bridge.dart` | MODIFY | capturePhoto saves to FS + returns filePath; add readFile case; remove submitTransaction case; remove http import |
| `flutter/lib/webview/module_webview.dart` | MODIFY | Remove submitTransaction from injected bridge JS; add readFile to injected bridge JS; add connectivity stream subscription; dispatch foundry:online on reconnect |
| `flutter/lib/screens/module_list_screen.dart` | MODIFY | Add apiBaseUrl to _authContext map; add flutter_dotenv import |
| `flutter/pubspec.yaml` | MODIFY | Add `assets/modules/inventory-checker/` asset path |
| `backend/api/sync/index.js` | MODIFY | Add moduleSlug validation for submit_report action type |
| `modules/quality-inspector/dist/` | BUILD+COPY | Rebuild webpack bundle; copy to flutter/assets/modules/quality-inspector/ |
| `modules/inventory-checker/dist/` | BUILD+COPY | Rebuild webpack bundle; copy to flutter/assets/modules/inventory-checker/ |
| `flutter/assets/modules/inventory-checker/` | CREATE DIR | Must exist before flutter build; populated by inventory-checker dist copy |

---

## Acceptance Criteria

### AC-8.1 — Offline queue write (quality-inspector)
- **criterion**: Submitting quality-inspector form while WiFi is off writes one entry to `quality-inspector_queue` IndexedDB with status='pending' and does not show an error to the user.
- **test_command**:
  1. Disable WiFi on Android device (Settings > WiFi off).
  2. Open Foundry app → quality-inspector.
  3. Fill "Item Code" field with any value (e.g. "ITEM-001").
  4. Tap "Submit Report".
  5. Open Chrome on desktop → `chrome://inspect` → inspect the quality-inspector WebView.
  6. DevTools > Application > IndexedDB > `quality-inspector_queue` > `actions`.
- **pass_condition**: Exactly one record visible with `status: "pending"`, `type: "submit_report"`, `payload.itemCode: "ITEM-001"`. No red error banner shown in the module UI.
- **blocking**: true

### AC-8.2 — Auto-sync on reconnect (quality-inspector)
- **criterion**: When WiFi is restored after an offline submission, the record appears in Supabase `reports` table within 10 seconds without user action.
- **test_command**:
  1. Complete AC-8.1 (one pending item in queue).
  2. Re-enable WiFi on device.
  3. Wait 10 seconds. Do NOT tap anything.
  4. Open Supabase dashboard → Table Editor → `reports` table.
- **pass_condition**: A new row exists with `module_slug: 'quality-inspector'` and the submitted item code in `payload`. The `quality-inspector_queue` IndexedDB entry now has `status: 'synced'` (verify via DevTools).
- **blocking**: true

### AC-8.3 — Photo sync (quality-inspector)
- **criterion**: A quality-inspector submission that included a photo results in a non-null `photo_url` in the Supabase `reports` row after sync.
- **test_command**:
  1. Disable WiFi.
  2. Open quality-inspector, fill item code, tap "Capture Photo", take a photo.
  3. Tap "Submit Report".
  4. Re-enable WiFi, wait 10 seconds.
  5. Check Supabase → reports → most recent row.
- **pass_condition**: `photo_url` column contains a URL starting with `https://` (Supabase Storage public URL). Column is NOT null.
- **blocking**: true

### AC-8.4 — Startup sync after force-close (kill-app scenario)
- **criterion**: After force-closing the app with a pending item queued, reopening while online causes the item to sync without user interaction.
- **test_command**:
  1. Disable WiFi.
  2. Open quality-inspector, submit one item (confirm pending badge shows "1 pending").
  3. Force-close the app (Android Recent Apps > swipe away).
  4. Re-enable WiFi.
  5. Reopen the Foundry app.
  6. Navigate to quality-inspector.
  7. Wait 10 seconds.
  8. Check Supabase reports table.
- **pass_condition**: The queued item appears in Supabase reports. The pending badge in quality-inspector shows "0 pending" or disappears within 10 seconds of the module loading.
- **blocking**: true

### AC-8.5 — Pending count badge accuracy
- **criterion**: The pending count badge reflects the correct unsynced item count and updates to zero after sync.
- **test_command**:
  1. Disable WiFi.
  2. Submit 3 items in quality-inspector (item codes: "A", "B", "C").
  3. Observe pending badge in quality-inspector UI.
  4. Re-enable WiFi, wait 10 seconds.
  5. Observe pending badge again.
- **pass_condition**: After 3 offline submits, badge reads "3 pending". After WiFi restored and sync completes, badge reads "All synced" (or hides — either is acceptable as long as the number is 0).
- **blocking**: true

### AC-8.6 — Module isolation
- **criterion**: quality-inspector and inventory-checker queue entries are isolated — submitting in one does not affect the other's pending count.
- **test_command**:
  1. Disable WiFi.
  2. Submit 2 items in quality-inspector. Badge shows "2 pending".
  3. Switch to inventory-checker.
  4. Observe inventory-checker pending badge.
  5. In Chrome DevTools, inspect both `quality-inspector_queue` and `inventory-checker_queue` IndexedDB databases.
- **pass_condition**: inventory-checker badge shows "0 pending" or "All synced". `inventory-checker_queue` has 0 entries. `quality-inspector_queue` has 2 entries.
- **blocking**: true

### AC-8.7 — Simultaneous multi-module sync (non-blocking)
- **criterion**: Both modules sync simultaneously when network restores, not sequentially.
- **test_command**:
  1. Disable WiFi.
  2. Submit 1 item in quality-inspector.
  3. Switch to inventory-checker, submit 1 item.
  4. Re-enable WiFi.
  5. Wait 10 seconds. Check Supabase reports.
  6. In Android Studio Logcat, filter tag `[WebView]` — look for two "Dispatching foundry:online" log lines.
- **pass_condition**: Both records appear in Supabase reports within 10 seconds. Logcat shows `[WebView] Dispatching foundry:online to http://127.0.0.1:8080/quality-inspector/` AND `[WebView] Dispatching foundry:online to http://127.0.0.1:8080/inventory-checker/` (order irrelevant). Both appear before either sync completes.
- **blocking**: false

### AC-8.8 — readFile bridge method
- **criterion**: The readFile bridge method returns a base64 data URL for a previously-captured photo path.
- **test_command**:
  1. Open quality-inspector, tap "Capture Photo", take a photo.
  2. In Chrome DevTools Console for quality-inspector WebView, run:
     ```js
     window.shellBridge._call('readFile', { filePath: '<path from capturePhoto response>' })
       .then(r => console.log(JSON.stringify(r)))
     ```
     (Get the filePath by first running:
     `window.shellBridge._call('capturePhoto', {}).then(r => console.log(r.data.filePath))`)
  3. Observe console output.
- **pass_condition**: Response object has `success: true` and `data.dataUrl` starting with `data:image/jpeg;base64,`. The base64 string is non-empty (length > 100 characters).
- **blocking**: true

### AC-8.9 — Webpack @shared alias build success
- **criterion**: Both module webpack builds succeed with the @shared alias resolving correctly.
- **test_command**:
  ```bash
  cd modules/quality-inspector && npm run build 2>&1 | tail -5
  cd modules/inventory-checker && npm run build 2>&1 | tail -5
  ```
- **pass_condition**: Both commands exit code 0. Output includes "successfully compiled" or webpack stats output with 0 errors. Files `modules/quality-inspector/dist/bundle.js` and `modules/inventory-checker/dist/bundle.js` exist and have size > 50KB (confirming offline-core is bundled in).
- **blocking**: true

### AC-8.10 — submitTransaction bridge method removed end-to-end
- **criterion**: Calling `submitTransaction` from JS now returns an error (method removed from bridge), and no HTTP call is made to /api/reports.
- **test_command**:
  1. In Chrome DevTools Console for any module WebView, run:
     ```js
     window.shellBridge._call('submitTransaction', { moduleSlug: 'test', payload: {} })
       .then(r => console.log(JSON.stringify(r)))
     ```
  2. Watch Android Studio Logcat for any outbound HTTP requests to /api/reports.
- **pass_condition**: Console output shows `{"success":false,"data":null,"error":"Unknown method: submitTransaction"}`. No HTTP request to /api/reports appears in Logcat within 5 seconds.
- **blocking**: true

---

## Dependencies

### Runtime Dependencies (no new installs required)
- `connectivity_plus: 5.0.0` — already in pubspec.yaml (exact version, confirmed)
- `path_provider: ^2.1.0` — already in pubspec.yaml (used by new capturePhoto code)
- `flutter_dotenv: ^5.1.0` — already in pubspec.yaml (used by module_list_screen for apiBaseUrl)
- `image_picker: ^1.1.2` — already in pubspec.yaml (unchanged)
- IndexedDB — native browser API available in Android WebView (Chromium-based), no npm install needed
- `fetch` — native browser API available in Android WebView, no npm install needed
- `crypto.randomUUID()` — available in Android WebView (Chromium 92+, Android 8+)

### Build Dependencies (no new installs required)
- webpack, babel-loader, @babel/preset-env, @babel/preset-react — already installed in each module's node_modules (confirmed by existing webpack.config.js using these)
- No new npm packages to install in offline-core — it uses only native IndexedDB and fetch APIs

### What Must Pre-Exist Before Builder Starts
- Phase 7 backend must be deployed: POST https://foundry-app-rouge.vercel.app/api/sync must respond to authenticated requests (confirmed — API_BASE_URL in .env points to Vercel deployment)
- `flutter/assets/modules/quality-inspector/` directory must exist (confirmed — already in pubspec.yaml assets)
- `modules/quality-inspector/node_modules/` must exist (`npm install` must have been run previously)
- `modules/inventory-checker/node_modules/` must exist
- A physical Android device must be available for AC testing (Chrome DevTools remote inspect requires USB connection; emulator is acceptable for functional tests but not for camera tests AC-8.3, AC-8.8)

---

## Out Of Scope

The following items are explicitly NOT part of Phase 8. Builder must not implement these.

1. **Conflict resolution**: If a queued item's data has been superseded server-side, Phase 8 does not detect or resolve this. Last-write-wins.
2. **Queue UI management**: No "clear failed items" button, no "retry now" button. Users cannot manually manage the queue.
3. **ref-data-manager integration into App.jsx**: Deliverable 3 creates the ref-data-manager module, but neither quality-inspector nor inventory-checker currently has reference data dropdowns. The module is created for future use — do NOT wire it up in App.jsx.
4. **Background sync (WorkManager/service worker)**: Sync only triggers on app-foreground connectivity events. No background sync when app is fully closed.
5. **Push notifications for sync completion**: No toasts, alerts, or OS notifications when sync completes (badge update only).
6. **Photo compression beyond imageQuality:80 and maxWidth:1024**: Already set in capturePhoto — no additional compression step.
7. **SQLite**: Explicitly excluded by architecture decision. IndexedDB only.
8. **Multiple photo support per submission**: Each queue entry holds at most one filePath. Multi-photo is out of scope.
9. **iOS support**: All changes target Android. The platform params in module_webview.dart's initState include WKWebView handling — do not break it, but do not test against it.
10. **Pagination of pending items beyond 50**: The 50-item batch cap is a hard limit per the backend. Items beyond 50 sync on the next network event. No UI pagination.
11. **capturePhoto from gallery**: source remains `ImageSource.camera`. Gallery pick is out of scope.

---

## Phase Boundaries

### Receives From Previous Phase (Phase 7 — Backend API)
- **SyncEndpoint**: `POST https://foundry-app-rouge.vercel.app/api/sync` accepting `{ actions: Array<{ type, payload: { moduleSlug, payload, photo? }, local_id }> }` returning `{ results: Array<{ local_id, success, server_id?, error? }> }` — deployed and live
- **AuthToken**: JWT token returned from Firebase Auth, stored in flutter_secure_storage, injected as `window.__foundry_auth__.token` in WebView
- **BridgeInterface**: `window.shellBridge` with existing methods (ping, capturePhoto, getNetworkState, scanBarcode, getAuthToken)
- **ModuleAssetPath**: `flutter/assets/modules/quality-inspector/` exists with a working index.html + bundle.js
- **ConnectivityPlugin**: `connectivity_plus: 5.0.0` already declared in pubspec.yaml
- **BackendValidation**: `/api/sync` currently accepts any moduleSlug string — Phase 8 adds server-side whitelist validation

### Provides To Next Phase (Phase 9 — Android Play Store)
- **OfflineSyncVerified**: boolean — all 9 blocking ACs pass on real Android device
- **ModuleAssetPath**: `flutter/assets/modules/{slug}/` — rebuilt bundles with offline-core included (both quality-inspector and inventory-checker)
- **BridgeInterface extended**: `window.shellBridge` now includes `readFile(filePath) → { dataUrl }` method; `submitTransaction` is removed
- **AuthInjection extended**: `window.__foundry_auth__ = { token: string, user: object, apiBaseUrl: string }` — apiBaseUrl now always present
- **QueueSchema**: IndexedDB store `'{moduleId}_queue'` with object store `'actions'` holding records of shape `{ id, type, payload, filePath, status, retryCount, error, createdAt }`
- **OfflineCoreLibrary**: `modules/shared/offline-core/` — 4 JS modules ready for future module authors to import

---

## Environment Requirements

| Item | Required Value | Source | Confirmed |
|---|---|---|---|
| Flutter SDK | >=3.0.0 <4.0.0 | pubspec.yaml environment constraint | Confirmed from pubspec.yaml |
| Dart SDK | >=3.0.0 <4.0.0 | Same | Confirmed |
| connectivity_plus version | 5.0.0 (exact) | pubspec.yaml | Confirmed — line 29 of pubspec.yaml |
| path_provider version | ^2.1.0 | pubspec.yaml | Confirmed — line 24 |
| flutter_dotenv version | ^5.1.0 | pubspec.yaml | Confirmed — line 34 |
| API_BASE_URL | https://foundry-app-rouge.vercel.app | flutter/.env | Confirmed from .env |
| Android WebView | Chromium-based (Android 7+) | Required for IndexedDB + fetch + crypto.randomUUID | Assumed; standard for Android 7+ |
| Node.js | Any version supporting ES modules (≥14) | Module builds | Not pinned — use whatever is installed |
| npm build script | Must support `--mode production` | package.json in each module | Builder must verify before running |
| Flutter assets directory | `flutter/assets/modules/inventory-checker/` must be created | pubspec.yaml change | Builder creates this directory |
| Supabase bucket | `user-photos` (public bucket) | backend/api/sync/index.js line 13 | Confirmed — used in existing backend code |

---

## Manual Test Steps

Execute in order on a physical Android device connected via USB with Chrome DevTools remote inspection active (`chrome://inspect`).

**Prerequisite**: App is installed and logged in with test@foundry.com / test1234. USB debugging enabled.

**Step 1 — Offline submit (quality-inspector)**
- Action: Settings > WiFi off. Open Foundry → quality-inspector. Fill "Item Code" = "TEST-001". Tap "Submit Report".
- Expected: Form clears immediately. Badge changes to "1 pending". No error shown.
- Verify: DevTools → Application → IndexedDB → `quality-inspector_queue` → `actions` → 1 record with `status: "pending"`.

**Step 2 — Offline submit (inventory-checker)**
- Action: Switch to inventory-checker (tap back, tap inventory-checker). Fill SKU = "SKU-001", Stock Count = "5". Tap "Submit Count".
- Expected: Form clears. Badge changes to "1 pending" in inventory-checker. quality-inspector badge unchanged (still "1 pending" — verify by switching back).
- Verify: DevTools → `inventory-checker_queue` → 1 record. `quality-inspector_queue` → 1 record. Neither database has entries in the other's DB.

**Step 3 — Reconnect and auto-sync**
- Action: Settings > WiFi on. Wait 10 seconds. Do NOT interact with the app.
- Expected: Both module badges show "All synced" (or 0). No error banners.
- Verify: Supabase reports table → 2 new rows (one `module_slug: 'quality-inspector'`, one `module_slug: 'inventory-checker'`). Both `status: 'submitted'`. DevTools → both queues show `status: "synced"` on entries.

**Step 4 — Online submit (immediate sync)**
- Action: WiFi is on. In quality-inspector, fill item code "ONLINE-001". Tap Submit.
- Expected: Badge briefly shows "1 pending" then changes to "All synced" within a few seconds (sync fires immediately after enqueue).
- Verify: Supabase reports shows new row for "ONLINE-001".

**Step 5 — Photo submit offline**
- Action: WiFi off. In quality-inspector, fill item code "PHOTO-001". Tap "Capture Photo". Take a photo. Tap "Submit Report".
- Expected: Form clears. Badge shows "1 pending". Photo preview disappears (form cleared).
- Action: WiFi on. Wait 10 seconds.
- Verify: Supabase reports row for "PHOTO-001" has non-null `photo_url` starting with `https://`.

**Step 6 — Kill-app scenario**
- Action: WiFi off. Submit 1 item in quality-inspector. Badge shows "1 pending".
- Action: Force-close app (Android Recent Apps → swipe to close).
- Action: WiFi on. Reopen app. Log in if needed. Navigate to quality-inspector.
- Expected: Badge may briefly show "1 pending" then clears to "All synced" within 10 seconds.
- Verify: Supabase reports has the row from before the force-close.

**Step 7 — readFile bridge smoke test**
- Action: WiFi on. quality-inspector. Tap "Capture Photo". Take a photo.
- Action: DevTools Console:
  ```js
  window.shellBridge._call('capturePhoto', {}).then(r => {
    console.log('filePath:', r.data.filePath);
    return window.shellBridge._call('readFile', { filePath: r.data.filePath });
  }).then(r => console.log('readFile success:', r.success, 'dataUrl starts:', r.data?.dataUrl?.substring(0,30)));
  ```
- Expected: Console shows `filePath: /data/user/0/com.foundry.app/files/photos/[timestamp].jpg` and `readFile success: true dataUrl starts: data:image/jpeg;base64,`.

**Step 8 — submitTransaction removed**
- Action: DevTools Console:
  ```js
  window.shellBridge._call('submitTransaction', {}).then(r => console.log(JSON.stringify(r)))
  ```
- Expected: `{"success":false,"data":null,"error":"Unknown method: submitTransaction"}`.

---

## Phase Achievement

Phase 8 is complete when:
1. All 9 blocking ACs pass on a real Android device (AC-8.1 through AC-8.9, excluding AC-8.7 which is non-blocking).
2. All 8 manual test steps produce the expected outcomes.
3. Both module webpack builds exit 0 with bundle.js files present in flutter/assets/modules/{slug}/.
4. No regressions: existing quality-inspector and inventory-checker functionality (barcode scan, photo display, ping, network check) continues to work.

When this phase passes, users can capture and submit inspection data and stock counts with full confidence that no data is lost regardless of connectivity — the app works completely offline and syncs automatically when the network returns.

---

## Validation Notes

### Resolved: connectivity_plus v5.x API (was UNCLEAR in plan.md)
The planner flagged the stream API as unclear. This is now fully resolved:
- `Connectivity().onConnectivityChanged` emits `List<ConnectivityResult>` (not a single value) in v5.x.
- Online detection uses: `results.any((r) => r != ConnectivityResult.none)`.
- pubspec.yaml confirms the exact version is `connectivity_plus: 5.0.0` (pinned, no caret).
- The subscription lives INSIDE _ModuleWebViewState, not in ModuleListScreen. Reason: _controller is a private field of _ModuleWebViewState; exposing it to ModuleListScreen would require significant refactoring. Each ModuleWebView owns its own Connectivity() instance and its own subscription. This creates N subscriptions for N modules — acceptable overhead (typically 2 subscriptions for 2 modules). All subscriptions are cancelled in dispose().

### Resolved: Architecture placement of connectivity subscription (was UNCLEAR in plan.md)
Confirmed: ModuleWebView (per-widget subscription). ModuleListScreen: no connectivity awareness added.

### Resolved: submitTransaction removal scope
The plan says "submitTransaction case removed from shell_bridge.dart." This validator extends that to three coordinated removals:
1. `shell_bridge.dart`: case deleted; `http` import deleted (http was only used by submitTransaction).
2. `module_webview.dart`: `submitTransaction` method removed from injected `window.shellBridge` JS object; `readFile` method added.
3. `modules/shared/bridge_helper.js`: `submitTransaction` export removed; `readFile` export added.
All three must be done together. If only the Dart case is removed, JS calls to `window.shellBridge.submitTransaction()` still exist in the injected interface and will call through to the dart `default` case returning "Unknown method" — which is the correct error behavior (AC-8.10 tests this). The JS removal from the injected interface is belt-and-suspenders cleanup.

### Resolved: getNetworkState API in shell_bridge.dart for v5.x
The existing `getNetworkState` case uses `await Connectivity().checkConnectivity()` and compares `result != ConnectivityResult.none`. In connectivity_plus v5.x, `checkConnectivity()` returns `List<ConnectivityResult>`, not a single value. The existing code at line 79-89 of shell_bridge.dart is therefore BROKEN for v5.x. Builder MUST also fix this case:

```dart
case 'getNetworkState':
  final results = await Connectivity().checkConnectivity();
  final isOnline = results.any((r) => r != ConnectivityResult.none);
  String type = 'none';
  if (results.any((r) => r == ConnectivityResult.wifi)) {
    type = 'wifi';
  } else if (results.any((r) => r == ConnectivityResult.mobile)) {
    type = 'mobile';
  } else if (isOnline) {
    type = 'other';
  }
  return BridgeResult.ok({'isOnline': isOnline, 'type': type}).toJson();
```

This fix was not in the original plan but is required for correctness. The validator adds it here. It is a mandatory change to shell_bridge.dart Deliverable 9 (add as Change D).

### Resolved: authContext passed to ModuleWebView does not include apiBaseUrl yet
ModuleListScreen currently builds `_authContext = {'token': token, 'user': user ?? {}}`. The ModuleWebView._injectAuthContext() does `jsonEncode(widget.authContext)` — so adding the apiBaseUrl key to the map in ModuleListScreen is the correct and minimal fix (Deliverable 11). No changes to module_webview.dart's _injectAuthContext() method are needed.

### Noted: stock_count action type for inventory-checker
The backend `api/sync/index.js` already handles `action.type === 'stock_count'` separately from `submit_report`. This means inventory-checker must enqueue entries with `type: 'stock_count'` (not `submit_report`). This is reflected in Deliverable 8 — inventory-checker App.jsx enqueues `type: 'stock_count'`. The sync-manager posts the type as-is from the queue entry — no mapping needed.

### Noted: sync-manager payload shape for stock_count
For `stock_count` actions, the backend handler (lines 114-153 of sync/index.js) reads `action.payload` directly (no nested `moduleSlug` or `payload` fields — it hardcodes `module_slug: 'inventory-checker'`). However, the sync-manager wraps everything with `moduleSlug` and `payload` keys. The backend stock_count handler ignores `action.payload.moduleSlug` and `action.payload.payload` — it uses `action.payload` as the entire payload object. This means the stock_count row's `payload` column in Supabase will be `{ moduleSlug: 'inventory-checker', payload: { sku, location, quantity } }` — a nested structure. This is a minor schema inconsistency that is out of scope to fix in Phase 8. Do NOT try to fix it by changing the sync-manager to produce different shapes per action type — the backend already works this way.

### Noted: offline-core has no npm package.json
`modules/shared/offline-core/` is imported via webpack alias, not as an npm package. It does not need its own `package.json`. Webpack resolves the alias at build time and bundles the source directly into each module's bundle.js. No `npm install` step is needed for offline-core.

### Noted: 3-second polling interval for badge update
The 3-second setInterval in both App.jsx files provides badge freshness. It is not a WebSocket or push update. After sync completes (which may take 1-5 seconds), the poll will pick up the change within the next 3-second tick. Maximum badge staleness: ~6 seconds (poll fires, sync starts, sync completes 3 seconds later, next poll picks it up). This is acceptable per the plan's 10-second tolerance window.
