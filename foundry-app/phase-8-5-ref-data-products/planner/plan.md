# Phase 8.5 — Reference Data Caching + Product Description Edit
PHASE_ID: phase-8-5-ref-data-products
PLANNER_DOC_VERSION: 6.1.0
DEPENDS_ON: [phase-8-offline-sync]
PROVIDES_TO: [phase-9-store-submission]

## What This Phase Builds

Adds two backend endpoints (product list GET and product description PATCH) plus a new `update_product_description` sync action type to the existing sync pipeline. Upgrades the quality-inspector WebView module to v1.2.0 with a product dropdown populated from cached reference data, a description edit field with change detection, background refresh with TTL-based caching, and auto-select on barcode scan. When a report is submitted with an edited description, a second offline queue action is enqueued alongside the existing `submit_report` and the local cache is optimistically updated.

## Requirements Covered

- REQ-8.5.BE.1: `GET /api/products` — returns up to 100 products `{ id, barcode, name, description }` ordered by name, requires JWT
- REQ-8.5.BE.2: `PATCH /api/products/update` — updates product description `{ id, description }`, requires JWT, returns `{ success: true, product: { id, description } }`
- REQ-8.5.BE.3: `POST /api/sync` extension — handles new action type `update_product_description` with payload `{ productId: string, description: string }`, logs to sync_logs
- REQ-8.5.MOD.4: `fetchProducts()` — fetches GET /api/products using bridge-injected `window.__foundry_auth__.token` and `.apiBaseUrl`, stores result in refDataManager with 5-minute TTL under key `'products'`
- REQ-8.5.MOD.5: On module init, load cached products from RefDataManager immediately then fire-and-forget fetchProducts()
- REQ-8.5.MOD.6: 5-minute background refresh interval calling fetchProducts()
- REQ-8.5.MOD.7: Product dropdown `<select>` showing `name (barcode)` when product list is non-empty; falls back to free-text input when list is empty
- REQ-8.5.MOD.8: Auto-select on barcode scan — if scanned barcode matches a product's barcode field, auto-select that product in the dropdown
- REQ-8.5.MOD.9: Description edit field appears when a product is selected, pre-filled with that product's current description; label appends "(edited)" when value differs from original
- REQ-8.5.MOD.10: Refresh button calls fetchProducts() when online/authenticated; shows "Offline — using cached data" toast (2 s) when offline or no auth token
- REQ-8.5.MOD.11: handleSubmit extension — if selectedProduct is set AND editDescription differs from selectedProduct.description, enqueue a second action of type `update_product_description` alongside the existing `submit_report` action; optimistically update local RefDataManager cache entry for `'products'`
- REQ-8.5.MOD.12: Version bump — quality-inspector package.json → 1.2.0; upload-to-supabase.js path references → 1.2.0
- REQ-8.5.INF.13: Run `npm run build` in quality-inspector after all code changes
- REQ-8.5.INF.14: Run `node upload-to-supabase.js` from phase-5-module-cdn to push the 1.2.0 bundle to Supabase CDN
- REQ-8.5.INF.15: Run `vercel --prod` to deploy updated backend
- REQ-8.5.INF.16: SQL — deactivate all existing quality-inspector module_versions rows; insert new row for v1.2.0

## Deliverables

- [ ] `backend/api/products/index.js`: New file — GET /api/products handler; reads all products ordered by name (limit 100), requires JWT via Authorization header
- [ ] `backend/api/products/update.js`: New file — PATCH /api/products/update handler; validates `{ id, description }` body, updates products table, returns `{ success: true, product: { id, description } }`
- [ ] `backend/api/sync.js`: Modify existing file — add `update_product_description` case in the action-type dispatch block; on match, call PATCH /api/products/update internally (or perform the DB update directly) and write a sync_log entry
- [ ] `backend/vercel.json`: Verify routes include `/api/products/update` and `/api/products` (index route) — add only if missing; do not break existing routes
- [ ] `quality-inspector/package.json`: Version field → `"1.2.0"`
- [ ] `quality-inspector/src/` (relevant source files): Add `fetchProducts()`, RefDataManager integration, 5-min interval, product dropdown component, description edit field, refresh button, handleSubmit extension, auto-select on scan
- [ ] `quality-inspector/dist/` (build output): Rebuilt 1.2.0 bundle produced by `npm run build`
- [ ] `phase-5-module-cdn/upload-to-supabase.js`: Update version path references from current version → `1.2.0` (if hardcoded)
- [ ] SQL migration (inline commands, not a migration file): `UPDATE module_versions SET is_active = false WHERE module_id = (SELECT id FROM modules WHERE slug = 'quality-inspector');` then `INSERT INTO module_versions (module_id, version, bundle_url, is_active) VALUES (..., '1.2.0', '<cdn-url>', true);`

## Inputs From Previous Phase

- `QueueManager`: `{ enqueue(action: { type: string, payload: object }): Promise<void>, getPending(): Promise<Action[]>, updateStatus(id, status): Promise<void>, countPending(): Promise<number>, countFailed(): Promise<number>, remove(id): Promise<void>, resetSyncing(): Promise<void> }` — IndexedDB-backed, provided by phase-8 offline system init
- `SyncManager`: `{ sync(): Promise<void> }` — triggers POST /api/sync with all pending actions; provided by phase-8 offline system init
- `RefDataManager`: `{ get(key: string): Promise<any|null>, set(key: string, value: any, ttlMs: number): Promise<void>, delete(key: string): Promise<void> }` — IndexedDB-backed TTL cache; provided by phase-8 offline system init
- `initOfflineSystem(moduleId: string)`: `Promise<{ queueManager: QueueManager, syncManager: SyncManager, refDataManager: RefDataManager }>` — entry point called at module init
- `window.__foundry_auth__`: `{ token: string, apiBaseUrl: string }` — injected by Flutter bridge before WebView JS runs
- `window` event `foundry:online`: fires when network reconnects — already wired in phase-8 to trigger sync; phase 8.5 may also listen to trigger fetchProducts()

## Outputs To Next Phase

- No code interfaces consumed by Phase 9. Phase 9 (Android Play Store submission) only requires the app to be fully functional end-to-end. The implicit output is: quality-inspector v1.2.0 active in Supabase, backend deployed to Vercel, Flutter app able to download and run the new module with all phase 8.5 features operational.

## Acceptance Criteria

- [ ] AC-8.5.1
      criterion: GET /api/products returns 200 with array of `{ id, barcode, name, description }` objects (up to 100), ordered by name, when a valid JWT is provided
      test_command: curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer <valid_jwt>" https://<vercel-domain>/api/products
      pass_condition: exit 0 and HTTP status 200; response body is a JSON array
      blocking: true

- [ ] AC-8.5.2
      criterion: GET /api/products returns 401 when no Authorization header is sent
      test_command: curl -s -o /dev/null -w "%{http_code}" https://<vercel-domain>/api/products
      pass_condition: HTTP status 401
      blocking: true

- [ ] AC-8.5.3
      criterion: PATCH /api/products/update returns `{ success: true, product: { id, description } }` with updated description when valid JWT and valid `{ id, description }` body are sent
      test_command: curl -s -X PATCH -H "Authorization: Bearer <valid_jwt>" -H "Content-Type: application/json" -d '{"id":"<product_id>","description":"Updated desc"}' https://<vercel-domain>/api/products/update
      pass_condition: HTTP status 200; response JSON contains `"success":true` and `product.description` equals `"Updated desc"`
      blocking: true

- [ ] AC-8.5.4
      criterion: POST /api/sync with action type `update_product_description` and payload `{ productId, description }` processes without error and creates a sync_log entry
      test_command: curl -s -X POST -H "Authorization: Bearer <valid_jwt>" -H "Content-Type: application/json" -d '{"actions":[{"type":"update_product_description","payload":{"productId":"<id>","description":"test"}}]}' https://<vercel-domain>/api/sync
      pass_condition: HTTP status 200; Supabase sync_logs table contains a new row with action_type `update_product_description`
      blocking: true

- [ ] AC-8.5.5
      criterion: quality-inspector module version field reads 1.2.0
      test_command: node -e "console.log(require('./quality-inspector/package.json').version)"
      pass_condition: stdout is exactly `1.2.0`
      blocking: true

- [ ] AC-8.5.6
      criterion: Built dist bundle exists and references version 1.2.0 (bundle filename or internal version string)
      test_command: ls quality-inspector/dist/
      pass_condition: exit 0; at least one file present in dist/ directory; no build errors were emitted during `npm run build`
      blocking: true

- [ ] AC-8.5.7
      criterion: Supabase module_versions table has exactly one active row for quality-inspector and it is version 1.2.0
      test_command: Query via Supabase dashboard or psql: `SELECT version, is_active FROM module_versions mv JOIN modules m ON m.id = mv.module_id WHERE m.slug = 'quality-inspector' AND mv.is_active = true;`
      pass_condition: Exactly one row returned with version = '1.2.0' and is_active = true
      blocking: true

- [ ] AC-8.5.8
      criterion: In the running Flutter app (dev device), the quality-inspector module loads and the product dropdown is populated (non-empty select element) within 10 seconds of module open
      test_command: Manual — open app on dev device, navigate to quality-inspector module, observe UI
      pass_condition: A `<select>` element is visible with at least one `<option>` showing `name (barcode)` format
      blocking: true

- [ ] AC-8.5.9
      criterion: Barcode scan auto-selects the matching product in the dropdown
      test_command: Manual — with module open, simulate or scan a barcode that matches a known product barcode; observe dropdown
      pass_condition: Dropdown selection changes to the matching product without user interaction
      blocking: false

- [ ] AC-8.5.10
      criterion: Description edit field appears when a product is selected, is pre-filled with the product's description, and label shows "(edited)" when the field value is changed
      test_command: Manual — select a product from the dropdown; observe description field; edit the text
      pass_condition: Field appears with correct pre-filled text; label changes to include "(edited)" after modification
      blocking: true

- [ ] AC-8.5.11
      criterion: Submitting a report with a modified description enqueues two actions in IndexedDB: one `submit_report` and one `update_product_description`
      test_command: Manual — select product, edit description, submit form while offline; then inspect IndexedDB (browser devtools > Application > IndexedDB) for the offline queue store
      pass_condition: Two pending records visible in the queue: types `submit_report` and `update_product_description`
      blocking: true

- [ ] AC-8.5.12
      criterion: Refresh button shows "Offline — using cached data" message for approximately 2 seconds when device is offline
      test_command: Manual — disable network on dev device, tap Refresh button in quality-inspector module
      pass_condition: Message "Offline — using cached data" appears and disappears after ~2 seconds; no crash
      blocking: false

- [ ] AC-8.5.13
      criterion: Background refresh interval fires every 5 minutes without crashing the module
      test_command: Manual — leave module open for 5+ minutes with network connected; observe no JS errors in Flutter debug console
      pass_condition: No error output; product list remains populated
      blocking: false

## Manual Test Steps

1. Deploy backend (`vercel --prod`) and confirm deployment URL is accessible. Expected: Vercel CLI outputs deployment URL with no errors.
2. Send `GET /api/products` with a valid JWT (test@foundry.com / test1234 credentials via login flow). Expected: JSON array of product objects returned; each has `id`, `barcode`, `name`, `description` fields.
3. Send `PATCH /api/products/update` with a valid JWT and a known product id. Expected: Response contains `{ success: true, product: { id, description } }` with the new description value.
4. Send `POST /api/sync` with an `update_product_description` action. Expected: 200 response; sync_logs entry created in Supabase.
5. Upload quality-inspector 1.2.0 bundle (`node upload-to-supabase.js`) and run SQL to activate it. Expected: Supabase module_versions has exactly one active row at 1.2.0.
6. Open the Flutter app on dev device (test@foundry.com / test1234). Navigate to quality-inspector. Expected: Module loads v1.2.0; product dropdown is populated within ~5 seconds.
7. Scan or enter a barcode that matches a known product. Expected: Dropdown auto-selects the matching product; description edit field appears pre-filled with that product's description.
8. Edit the description text and submit the form while online. Expected: Both `submit_report` and `update_product_description` actions are sent to backend; product description is updated in Supabase.
9. Edit the description and submit while offline (airplane mode). Expected: Both actions are queued in IndexedDB; optimistic cache update applied; on network restore the sync fires and both actions process.
10. Tap Refresh button while offline. Expected: "Offline — using cached data" message displays for ~2 seconds.
11. Tap Refresh button while online. Expected: Products list reloads from API; dropdown updates if product data changed.
12. With module open and products loaded, disconnect network for 5 minutes then reconnect. Expected: Background interval attempted refresh while offline (graceful fail); on reconnect, `foundry:online` event triggers sync; subsequent interval refresh succeeds.

## Phase Achievement

When this phase passes, users can browse a cached product list in the quality-inspector, auto-select by barcode scan, edit product descriptions inline, and have both the quality report and description update reliably reach the backend whether online or offline.

## Planner Notes

⚠ UNCLEAR: "Run `node upload-to-supabase.js` from phase-5-module-cdn" — The requirement references a directory named `phase-5-module-cdn` but the PHASE_INDEX lists Phase 5 as `phase-5-store-submission`. Builder must locate the actual path of `upload-to-supabase.js` before executing this step; it may live in a differently named directory.

⚠ UNCLEAR: "logs to sync_logs" for `update_product_description` — It is not specified whether the sync handler should also call the PATCH /api/products/update endpoint internally or write directly to the DB. Builder must inspect the existing sync.js action dispatch pattern to match the established convention.

⚠ UNCLEAR: The SQL INSERT for module_versions requires the CDN bundle_url for 1.2.0. Builder must capture the URL output from `node upload-to-supabase.js` before running the INSERT.
