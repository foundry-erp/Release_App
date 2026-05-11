# Validated Spec — Phase 8.5: Reference Data Caching + Product Description Edit
PHASE_ID: phase-8-5-ref-data-products
VALIDATED: 2026-04-03T00:00:00Z
VALIDATOR_CYCLE: 1
VALIDATOR_DOC_VERSION: 6.1.0
DRIFT_CHECK_STATUS: NOT_APPLICABLE

---

## What To Build

Add three backend changes: a new GET /api/products endpoint returning up to 100 rows from the products table ordered by name ascending, a new PATCH /api/products/update endpoint that updates a single product's description field by UUID, and a new action-type handler `update_product_description` inside the existing POST /api/sync dispatch block that writes the description directly to the products table and logs to sync_logs. Upgrade quality-inspector to v1.2.0 with five UI additions: a product `<select>` dropdown populated from a RefDataManager TTL cache (key: `'products'`, TTL: 300,000 ms), a description text input that appears on product selection and shows "(edited)" in its label when the current value differs from the originally loaded description, a Refresh Products button that re-fetches from the API when auth is available and shows an error message "Offline — using cached data" for 2,000 ms when offline, a 5-minute background `setInterval` that calls `fetchProducts()`, and auto-selection of the matching product when a barcode scan returns a value that matches a product's `barcode` field. When submitting a report with a changed description, enqueue a second `update_product_description` action in the same IndexedDB queue and optimistically overwrite the cached products array in RefDataManager. Build the module (`npm run build`), upload the bundle to Supabase CDN, deploy the backend to Vercel, and activate v1.2.0 in the module_versions table via SQL.

---

## Deliverables

### D1 — GET /api/products endpoint
- type: file
- path: backend/api/products/index.js
- purpose: Return up to 100 products for populating the quality-inspector dropdown
- interface:
  - Method: GET
  - Auth: Authorization header — `Bearer <JWT>` verified by `requireAuth` middleware
  - Response 200: `{ products: Array<{ id: string, barcode: string, name: string, description: string }> }` ordered by name ASC
  - Response 401: `{ error: "Missing authorization header" }` or `{ error: "Invalid or expired token" }`
  - Response 405: `{ error: "Method not allowed" }` for any method other than GET and OPTIONS
  - Response 204: empty body for OPTIONS preflight
  - Response 500: `{ error: "Failed to fetch products" }` on Supabase query failure
- constraints:
  - Exactly 100 rows maximum returned (Supabase `.limit(100)`)
  - Columns selected: id, barcode, name, description only (no category, unit)
  - Ordered by name ascending
  - CORS headers set inline: `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, Authorization`
  - Must NOT touch or import from `backend/api/products/[barcode].js`
- edge_cases:
  - Empty products table → return `{ products: [] }` with HTTP 200
  - Supabase unreachable → catch error, return HTTP 500 `{ error: "Failed to fetch products" }`
  - Missing Authorization header → requireAuth returns 401 before query runs
  - Expired JWT → requireAuth returns 401 before query runs
  - Method is POST/PUT/DELETE → return 405 immediately before auth check

### D2 — PATCH /api/products/update endpoint
- type: file
- path: backend/api/products/update.js
- purpose: Update a single product's description field by product UUID
- interface:
  - Method: PATCH
  - Auth: Authorization header — `Bearer <JWT>` verified by `requireAuth`
  - Request body: `{ id: string (UUID), description: string }`
  - Response 200: `{ success: true, product: { id: string, description: string } }`
  - Response 400: `{ error: "Both id and description are required" }` when either field is missing or null
  - Response 401: from requireAuth
  - Response 404: `{ error: "Product not found" }` when id does not exist in products table
  - Response 405: `{ error: "Method not allowed" }` for non-PATCH, non-OPTIONS methods
  - Response 500: `{ error: "Failed to update product" }` on Supabase error
- constraints:
  - Uses Supabase `.update({ description }).eq('id', id).select('id, description').single()`
  - description may be an empty string — that is a valid value, not an error
  - CORS headers set inline same as D1
  - Response 204 for OPTIONS preflight
- edge_cases:
  - id is not a valid UUID format → Supabase returns error → return HTTP 500
  - id does not match any row → Supabase `.single()` returns error → return HTTP 404
  - description is undefined or null in body → return HTTP 400 (description === "" is allowed)
  - Concurrent PATCH on same product → last-write-wins (no optimistic locking required)

### D3 — update_product_description action in POST /api/sync
- type: file
- path: backend/api/sync/index.js
- purpose: Handle queued product description edits made offline, write directly to products table, log to sync_logs
- interface:
  - Action shape received from sync-manager: `{ type: "update_product_description", payload: { moduleSlug: "quality-inspector", payload: { productId: string, description: string } }, local_id: string }`
  - Extracts: `productId = action.payload.payload.productId`, `description = action.payload.payload.description`
  - DB write: `supabase.from('products').update({ description }).eq('id', productId)`
  - sync_logs insert: `{ user_id, module_slug: 'quality-inspector', action_type: 'update_product_description', local_id, status: 'success' | 'failed', error_message: string | null }`
  - Result pushed to results array: `{ local_id, success: true }` or `{ local_id, success: false, error: string }`
- constraints:
  - Writes directly to products table — does NOT call PATCH /api/products/update internally
  - Follows same try/catch pattern as existing `stock_count` and `submit_report` cases
  - Missing productId or description (undefined/null) → push failed result with error "Missing productId or description in payload", do NOT throw
  - Empty string description is valid — do not reject it
- edge_cases:
  - productId not found in products table → Supabase returns no error (update affects 0 rows) → still log as success (no rollback)
  - Supabase write fails → catch error, log sync_log with status 'failed', push failed result
  - Malformed payload (payload.payload missing) → productId and description both undefined → push failed result

### D4 — quality-inspector App.jsx (v1.2.0)
- type: file
- path: modules/quality-inspector/src/App.jsx
- purpose: Add product dropdown, description edit, refresh button, fetchProducts, background refresh, barcode auto-select, and dual-action submit
- interface:
  - New state variables:
    - `products: Array<{ id:string, barcode:string, name:string, description:string }>` — initialized `[]`
    - `selectedProduct: { id:string, barcode:string, name:string, description:string } | null` — initialized `null`
    - `editDescription: string` — initialized `''`
    - `refreshing: boolean` — initialized `false`
  - New ref: `refRef = React.useRef(null)` — holds refDataManager instance
  - `fetchProducts(): Promise<void>`
    - Reads `window.__foundry_auth__.token` and `window.__foundry_auth__.apiBaseUrl`
    - If either is missing → return without error (offline/unauthenticated)
    - Calls `fetch(`${apiBaseUrl}/api/products`, { headers: { Authorization: 'Bearer ${token}' } })`
    - On HTTP non-200 → return without updating state
    - On success → `setProducts(data.products)`, `refRef.current.set('products', data.products, 300000)`
    - On network error (fetch throws) → swallow error, return (offline path)
  - `handleRefresh(): Promise<void>`
    - Sets `refreshing = true`
    - If `window.__foundry_auth__.token` missing → sets error "Offline — using cached data", clears after 2000 ms via setTimeout, sets `refreshing = false`, returns
    - Calls `fetchProducts()`, catches any error → sets error "Offline — using cached data", clears after 2000 ms
    - Sets `refreshing = false` in finally block
  - Product dropdown rendered when `products.length > 0`:
    - `<select>` with value = `selectedProduct?.id || ''`
    - First option: `<option value="">— Select product —</option>`
    - Each product: `<option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>`
    - onChange: find product by id, call `setSelectedProduct(p)`, `setItemCode(p.barcode)`, `setEditDescription(p.description || '')`
  - Description edit field rendered only when `selectedProduct !== null`:
    - Input value = `editDescription`
    - Label text = `Description${editDescription !== selectedProduct.description ? ' (edited)' : ''}`
  - Refresh button label = `Refresh Products (${products.length})` while not refreshing; `Refreshing...` while `refreshing === true`
  - Barcode scan auto-select: after setting barcode state, call `products.find(p => p.barcode === res.data.value)` → if found, `setSelectedProduct(match)`, `setEditDescription(match.description || '')`
  - handleSubmit dual-action: if `selectedProduct !== null` AND `editDescription !== selectedProduct.description`:
    1. Enqueue second action: `{ id: uuid, type: 'update_product_description', payload: { moduleSlug: 'quality-inspector', payload: { productId: selectedProduct.id, description: editDescription } }, filePath: null }`
    2. Read cached array: `const cached = await refRef.current.get('products') || []`
    3. Update in place: `const updated = cached.map(p => p.id === selectedProduct.id ? { ...p, description: editDescription } : p)`
    4. Write back: `await refRef.current.set('products', updated, 300000)`
    5. `setSelectedProduct({ ...selectedProduct, description: editDescription })`
  - canSubmit: `!loading && (itemCode.trim() !== '' || selectedProduct !== null) && offlineReady`
  - On successful submit: also call `setSelectedProduct(null)` and `setEditDescription('')`
- constraints:
  - `setInterval(fetchProducts, 300000)` added in useEffect; interval ID cleared in cleanup
  - On init: load `refRef.current.get('products')` immediately → if non-null, `setProducts(cached)`; then call `fetchProducts()` (fire-and-forget)
  - Must not remove any existing buttons (Scan Barcode, Capture Photo, Check Network, Submit Report, Ping Bridge)
  - Refresh button placed between Check Network and Submit Report
- edge_cases:
  - products list empty on first load → show text input fallback (existing itemCode input)
  - refDataManager returns null (cache miss or expired) → `setProducts([])`, then fetchProducts() fills it
  - selectedProduct set but product removed from cache after refresh → `setSelectedProduct(null)`, `setEditDescription('')` when new products list does not include selectedProduct.id
  - Network error during fetchProducts on init → silently continue with empty/cached list

### D5 — CDN Upload + SQL Activation (operational)
- type: config
- path: phase-5-module-cdn/upload-to-supabase.js (already updated to 1.2.0 paths)
- purpose: Push built bundle to Supabase Storage and activate v1.2.0 in module_versions
- interface:
  - Upload script paths: `quality-inspector/1.2.0/bundle.js` and `quality-inspector/1.2.0/index.html`
  - CDN base URL: `https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles`
  - bundle_url: `https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.2.0/bundle.js`
  - index_url: `https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.2.0/index.html`
  - SQL deactivate: `UPDATE module_versions SET is_active = false WHERE module_id = (SELECT id FROM modules WHERE slug = 'quality-inspector');`
  - SQL insert: `INSERT INTO module_versions (module_id, version, cdn_url, index_url, checksum, is_active) VALUES ((SELECT id FROM modules WHERE slug = 'quality-inspector'), '1.2.0', '<bundle_url>', '<index_url>', '', true);`
- constraints:
  - upload-to-supabase.js run from directory: `foundry-app/phase-5-module-cdn/`
  - Must run `npm run build` in `foundry-app/modules/quality-inspector/` BEFORE upload
  - SQL must be run in Supabase dashboard SQL editor AFTER successful upload
  - checksum field: empty string `''` (skip validation — same pattern as 1.1.2)
- edge_cases:
  - dist/bundle.js missing → upload script logs MISSING error and skips — do not run SQL
  - Upload fails → do not run SQL deactivate/insert
  - Old active rows not deactivated before INSERT → INSERT succeeds but registry returns wrong version — always run deactivate first

---

## File Manifest

| filepath | action | description |
|----------|--------|-------------|
| backend/api/products/index.js | create | GET /api/products — product list endpoint |
| backend/api/products/update.js | create | PATCH /api/products/update — description update endpoint |
| backend/api/sync/index.js | modify | Add update_product_description case to action dispatch |
| modules/quality-inspector/src/App.jsx | modify | Add dropdown, description edit, refresh, fetchProducts, dual-action submit |
| modules/quality-inspector/package.json | modify | Version → 1.2.0 |
| modules/quality-inspector/dist/bundle.js | generate | Built output from npm run build |
| modules/quality-inspector/dist/index.html | generate | Built output from npm run build |
| phase-5-module-cdn/upload-to-supabase.js | modify | quality-inspector CDN paths → 1.2.0 |

---

## Acceptance Criteria

- [ ] AC-8.5.1
      criterion: GET /api/products with valid JWT returns HTTP 200 and JSON body `{ products: [...] }` where each element has id, barcode, name, description fields and array is ordered by name ascending
      test_command: curl -s -H "Authorization: Bearer $(curl -s -X POST https://foundry-app-rouge.vercel.app/api/auth/login -H 'Content-Type: application/json' -d '{}' | jq -r '.token // empty')" https://foundry-app-rouge.vercel.app/api/products | jq '.products | length'
      pass_condition: stdout is a number >= 0 (exit code 0); if products table has rows, number > 0
      blocking: true

- [ ] AC-8.5.2
      criterion: GET /api/products without Authorization header returns HTTP 401
      test_command: curl -s -o /dev/null -w "%{http_code}" https://foundry-app-rouge.vercel.app/api/products
      pass_condition: stdout is exactly `401`
      blocking: true

- [ ] AC-8.5.3
      criterion: PATCH /api/products/update with valid JWT and valid body returns HTTP 200 with `{ success: true, product: { id, description } }`
      test_command: curl -s -X PATCH -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"id":"<product_uuid>","description":"Validator test desc"}' https://foundry-app-rouge.vercel.app/api/products/update | jq '.success'
      pass_condition: stdout is exactly `true`
      blocking: true

- [ ] AC-8.5.4
      criterion: PATCH /api/products/update without body id returns HTTP 400
      test_command: curl -s -o /dev/null -w "%{http_code}" -X PATCH -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"description":"no id"}' https://foundry-app-rouge.vercel.app/api/products/update
      pass_condition: stdout is exactly `400`
      blocking: true

- [ ] AC-8.5.5
      criterion: POST /api/sync with action type update_product_description returns HTTP 200 with results array containing local_id and success:true; sync_logs row exists
      test_command: curl -s -X POST -H "Authorization: Bearer <JWT>" -H "Content-Type: application/json" -d '{"actions":[{"type":"update_product_description","payload":{"moduleSlug":"quality-inspector","payload":{"productId":"<product_uuid>","description":"sync test"}},"local_id":"test-001"}]}' https://foundry-app-rouge.vercel.app/api/sync | jq '.results[0].success'
      pass_condition: stdout is exactly `true`
      blocking: true

- [ ] AC-8.5.6
      criterion: quality-inspector package.json version field is 1.2.0
      test_command: node -e "console.log(require('./modules/quality-inspector/package.json').version)"
      pass_condition: stdout is exactly `1.2.0`
      blocking: true

- [ ] AC-8.5.7
      criterion: npm run build completes without error and produces dist/bundle.js
      test_command: cd modules/quality-inspector && npm run build 2>&1 | tail -5
      pass_condition: exit code 0; output contains "successfully" or no "ERROR" string; dist/bundle.js exists
      blocking: true

- [ ] AC-8.5.8
      criterion: Supabase module_versions has exactly one active row for quality-inspector at version 1.2.0
      test_command: Run in Supabase SQL editor — SELECT version, is_active FROM module_versions mv JOIN modules m ON m.id = mv.module_id WHERE m.slug = 'quality-inspector' AND mv.is_active = true;
      pass_condition: Exactly one row returned; version column = '1.2.0'; is_active = true
      blocking: true

- [ ] AC-8.5.9
      criterion: quality-inspector module on device shows product <select> dropdown populated within 10 seconds of module open
      test_command: Manual — open Flutter app as test@foundry.com, navigate to quality-inspector, observe UI within 10 seconds
      pass_condition: <select> element visible with at least one <option> in format "name (barcode)"; "— Select product —" placeholder present
      blocking: true

- [ ] AC-8.5.10
      criterion: Selecting a product from dropdown shows description edit field pre-filled with that product's description; editing the field changes label to "Description (edited)"
      test_command: Manual — select any product from dropdown; observe description field; type one character change
      pass_condition: Field appears immediately on selection; label text includes "(edited)" after any change; original description was pre-filled
      blocking: true

- [ ] AC-8.5.11
      criterion: Scanning a barcode that matches a known product auto-selects that product in the dropdown
      test_command: Manual — tap Scan Barcode button; scan or simulate barcode value matching a product's barcode field
      pass_condition: Dropdown value changes to the matching product without additional user interaction; description field appears with that product's description
      blocking: false

- [ ] AC-8.5.12
      criterion: Submitting a report with a changed description while offline enqueues two IndexedDB actions: submit_report and update_product_description
      test_command: Manual — enable airplane mode; select product, change description, tap Submit Report; open browser devtools > Application > IndexedDB > quality-inspector_queue > actions
      pass_condition: Two records present with types submit_report and update_product_description; both have status = pending
      blocking: true

- [ ] AC-8.5.13
      criterion: Tapping Refresh Products button while offline shows "Offline — using cached data" message and it disappears within 3 seconds
      test_command: Manual — enable airplane mode; tap Refresh Products button
      pass_condition: Error text "Offline — using cached data" appears within 1 second of tap and disappears within 3 seconds; no JS crash
      blocking: false

---

## Dependencies

- name: "@supabase/supabase-js"
  version: "2.39.0"
  install_command: already installed in backend/
- name: "jsonwebtoken"
  version: "9.0.0"
  install_command: already installed in backend/
- name: "react"
  version: "18.2.0"
  install_command: already installed in modules/quality-inspector/
- name: "webpack"
  version: "5.88.0"
  install_command: already installed in modules/quality-inspector/ devDependencies

No new packages required for this phase.

---

## Out Of Scope

- inventory-checker module: unchanged at v1.1.2 — do not modify any inventory-checker files
- Editing product name, barcode, category, or unit fields: only description is editable in this phase
- Pagination: maximum 100 products; no cursor or page parameters
- User-scoped or tenant-scoped products: products table has no user_id column — all products returned to all authenticated users
- Product creation or deletion via UI: read + description-update only
- Photo attachment to description edits: filePath is always null for update_product_description queue entries
- Retry UI for permanently failed sync items: existing countFailed badge covers this; no new UI
- iOS build or App Store submission: deferred to phase-9-store-submission
- Android Play Store submission: deferred to phase-9-store-submission

---

## Phase Boundaries

### Receives From Previous Phase
- QueueManager: `{ enqueue(entry: { id:string, type:string, payload:object, filePath:string|null }): Promise<void>, getPending(): Promise<Action[]>, updateStatus(id:string, status:string, error?:string|null): Promise<void>, countPending(): Promise<number>, countFailed(): Promise<number>, remove(id:string): Promise<void>, resetSyncing(): Promise<void> }`
- SyncManager: `{ sync(): Promise<void> }`
- RefDataManager: `{ get(key:string): Promise<any|null>, set(key:string, value:any, ttlMs:number): Promise<void>, delete(key:string): Promise<void> }`
- initOfflineSystem(moduleId:string): `Promise<{ queueManager:QueueManager, syncManager:SyncManager, refDataManager:RefDataManager }>`
- window.__foundry_auth__: `{ token:string, apiBaseUrl:string }`
- window event 'foundry:online': `CustomEvent` — dispatched on network reconnect, already triggers SyncManager.sync()

### Provides To Next Phase
- quality-inspector v1.2.0 active in Supabase module_versions (functional — no code interface)
- GET /api/products deployed at `${apiBaseUrl}/api/products` (functional)
- PATCH /api/products/update deployed at `${apiBaseUrl}/api/products/update` (functional)
- Flutter app downloads and runs quality-inspector v1.2.0 end-to-end on Android device (functional)

---

## Environment Requirements

- Node.js: 20.x LTS
- Webpack: 5.88.0 (pinned in quality-inspector devDependencies)
- Vercel CLI: latest stable — deploy command: `vercel --prod` run from `foundry-app/backend/`
- Supabase JS client: 2.39.0 (pinned in backend dependencies)
- Android device: API 21 minimum, API 34 target
- Firebase test account: test@foundry.com / test1234 (stored in project memory)
- CDN upload: run `node upload-to-supabase.js` from `foundry-app/phase-5-module-cdn/`
- SQL: run in Supabase dashboard SQL editor at https://gbjmxskxkqyfvqifvelg.supabase.co

---

## Manual Test Steps

1. Run `cd modules/quality-inspector && npm run build` → Expected: exit 0, dist/bundle.js created, no ERROR in output
2. Run `cd phase-5-module-cdn && node upload-to-supabase.js` → Expected: both quality-inspector/1.2.0/bundle.js and quality-inspector/1.2.0/index.html print "OK" lines
3. Run SQL in Supabase: UPDATE to deactivate old rows, then INSERT 1.2.0 row → Expected: SELECT returns exactly one row with version='1.2.0' and is_active=true
4. Run `cd backend && vercel --prod` → Expected: Vercel CLI prints deployment URL with no errors
5. `curl -s https://foundry-app-rouge.vercel.app/api/products` (no auth) → Expected: HTTP 401
6. Get JWT via login, then `curl -s -H "Authorization: Bearer <JWT>" https://foundry-app-rouge.vercel.app/api/products` → Expected: HTTP 200, JSON with products array
7. Open Flutter app on Android device, log in as test@foundry.com — navigate to quality-inspector → Expected: module loads, product dropdown visible with options in "name (barcode)" format
8. Select a product from dropdown → Expected: description field appears below, pre-filled with product's description text
9. Edit the description text → Expected: field label changes to "Description (edited)"
10. Tap Submit Report while connected → Expected: badge shows 0 pending; Supabase sync_logs has two new rows (submit_report + update_product_description); products table has updated description
11. Select product, edit description, enable airplane mode, tap Submit Report → Expected: badge shows "2 pending"; IndexedDB has two pending records
12. Disable airplane mode → Expected: foundry:online fires; both actions sync; badge returns to "All synced"
13. Tap Refresh Products (N) button while in airplane mode → Expected: "Offline — using cached data" appears and disappears within 3 seconds

---

## Phase Achievement

When this phase passes, users can select a product from a live-cached dropdown in the quality-inspector, edit its description inline, and have both the quality report and description update sync to the backend automatically whether submitted online or queued offline.

---

## Validation Notes

### Ambiguities Resolved

- UNCLEAR (from planner): "`upload-to-supabase.js` directory name" → RESOLVED: file exists at `foundry-app/phase-5-module-cdn/upload-to-supabase.js`. The planner note was a false alarm — the directory is named `phase-5-module-cdn` which matches the CDN phase, not the store-submission phase. Run from that directory.
- UNCLEAR (from planner): "sync handler — call PATCH endpoint internally or write DB directly?" → RESOLVED: write directly to Supabase DB. Inspected existing `stock_count` and `submit_report` cases in backend/api/sync/index.js — both use `supabase.from(...).insert(...)` directly. The `update_product_description` case must match this pattern using `supabase.from('products').update(...).eq('id', productId)`.
- UNCLEAR (from planner): "SQL INSERT requires CDN bundle_url" → RESOLVED: URL pattern is deterministic: `https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles/quality-inspector/1.2.0/bundle.js`. Upload script also prints the exact URL after a successful upload — capture from stdout if uncertain.
- "approximately 2 seconds" for offline toast → RESOLVED: exactly `setTimeout(() => setError(null), 2000)` — 2000 ms
- "5-minute TTL" → RESOLVED: exactly 300,000 ms passed to `refDataManager.set('products', list, 300000)`
- "5-minute background refresh" → RESOLVED: exactly `setInterval(fetchProducts, 300000)`
- "up to 100 products" → RESOLVED: Supabase `.limit(100)` — no pagination

### Assumptions Made

- Products table does not require RLS — backend uses service role key via `supabase` client in `backend/lib/supabase.js` which bypasses RLS
- Empty string description is a valid value for PATCH (not treated as missing)
- When selectedProduct's id is no longer in the refreshed products list, component resets selectedProduct to null silently (no error shown to user)
- `window.__foundry_auth__` is always set when quality-inspector module runs — Flutter injects it in `onPageFinished` before any JS executes; no null-guard needed beyond the `|| {}` fallback already in fetchProducts

### Q&A References
None — all ambiguities resolved from codebase inspection and known facts. No questions raised.
