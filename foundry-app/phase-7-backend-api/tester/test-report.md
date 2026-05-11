# Phase 7 — Tester Report

```
TESTER_VERSION: 1.0.0
TESTED: 2026-04-03
```

---

## STATUS: PASSED WITH NOTES

All critical code paths verified by inspection. Device test confirmed end-to-end
submit flow. One known limitation (photo_url null in current device tests) is by
design and documented below.

---

## Tests Run

### T1 — POST /api/reports: photo upload logic
✅ PASS

- `photo` field presence checked before attempting upload.
- Data URL prefix stripped with regex `/^data:image\/[a-z]+;base64,/` before
  `Buffer.from(base64str, 'base64')` — handles jpeg, png, and other image types.
- Upload path is `{user_id}/{Date.now()}.jpg` — correctly scoped per user.
- `uploadError` caught and logged; `photo_url` stays `null` — report is still saved. Graceful fallback confirmed.
- Invalid base64 caught by outer `try/catch`; same fallback applies.
- INSERT fields: `user_id`, `module_slug`, `payload`, `photo_url`, `status: 'submitted'` — all correct.
- `.select('id, photo_url, created_at')` — includes `photo_url` per validator instruction #4.
- Response shape: `201 { id, photo_url, created_at }` — matches plan spec.

### T2 — POST /api/reports: no photo
✅ PASS

- When `photo` is absent, `photo_url` initialises as `null` and the upload block
  is skipped entirely.
- INSERT still proceeds; response returns `photo_url: null`.
- Matches plan Test 2 expectation.

### T3 — POST /api/reports: auth enforced
✅ PASS

- `requireAuth` is called via Promise wrapper before any business logic.
- `res.headersSent` guard prevents further execution if auth middleware has
  already sent a 401.
- Pattern is consistent with `api/sync/index.js` and `api/products/[barcode].js`.

### T4 — POST /api/sync: submit_report payload nesting
✅ PASS

- `action.payload.moduleSlug` → `module_slug` column.
- `action.payload.payload` → `payload` jsonb column.
- `action.payload.photo` → optional photo passed to `uploadPhoto()` helper.
- Nesting matches validator instruction #3 and plan test body exactly.

### T5 — POST /api/sync: stock_count action
✅ PASS

- Inserts into `reports` with `module_slug: 'inventory-checker'` and
  `payload: action.payload ?? {}`.
- `photo_url` hardcoded `null` for stock_count — correct, no photo supported here.
- Returns `{ local_id, success: true, server_id }` on success.

### T6 — POST /api/sync: unknown action type
✅ PASS

- Falls through to `else` branch.
- `sync_logs` row inserted with `status: 'failed'` and `error_message: 'Unknown action type'`.
- Returns `{ local_id, success: false, error: 'Unknown action type' }`.
- Batch continues — unknown type does NOT throw or abort remaining actions.

### T7 — POST /api/sync: batch isolation (one failure does not kill others)
✅ PASS

- Each action type is wrapped in its own `try/catch`.
- On error: `sync_logs` failure row inserted, result pushed with
  `success: false`, loop continues to next action.
- Final `res.status(200).json({ results })` is always reached regardless of
  per-action outcomes.
- Batch size guard: `actions.length > 50` returns 400 before looping — prevents
  runaway iteration.

### T8 — POST /api/sync: sync_logs insert on success AND failure
✅ PASS

- `submit_report` success path: inserts `status: 'success'` sync_log row.
- `submit_report` failure path (inside catch): inserts `status: 'failed'` row
  with `error_message`.
- `stock_count` mirrors same pattern.
- Unknown type: inserts `status: 'failed'` row unconditionally.
- All four code paths produce a sync_log entry.

### T9 — GET /api/products/[barcode]: correct param access
✅ PASS

- `const { barcode } = req.query` — correct Vercel dynamic route param access.
- Query: `.eq('barcode', barcode)` on `products` table.
- SELECT returns all plan-specified fields: `id, barcode, name, description, category, unit`.

### T10 — GET /api/products/[barcode]: 200 found / 404 not found
✅ PASS

- `error || !product` condition covers both Supabase query error and empty result.
- Returns `404 { error: 'Product not found' }` in both cases.
- Returns `200 { id, barcode, name, description, category, unit }` on success.
- Response shape matches plan spec exactly.

### T11 — GET /api/products/[barcode]: auth enforced
✅ PASS

- Same `requireAuth` Promise wrapper + `res.headersSent` guard pattern used.
- Unauthenticated requests receive 401 before query is attempted.

### T12 — migrate_phase7.sql: idempotency
✅ PASS

- `ALTER TABLE reports ADD COLUMN IF NOT EXISTS` for `photo_url`, `status`,
  `sync_reference` — safe on live data with existing rows.
- `status` column carries `DEFAULT 'submitted'` — existing rows receive the
  default value on backfill automatically.
- `CREATE TABLE IF NOT EXISTS sync_logs` — safe re-run.
- `CREATE TABLE IF NOT EXISTS products` — safe re-run.
- `CREATE INDEX IF NOT EXISTS` for both tables — safe re-run.
- `INSERT ... ON CONFLICT (barcode) DO NOTHING` — seed rows skipped if already
  present.
- Migration is fully idempotent.

### T13 — migrate_phase7.sql: schema correctness
✅ PASS

- `reports` additions: `photo_url text`, `status text NOT NULL DEFAULT 'submitted'`,
  `sync_reference text` — all match plan.
- `sync_logs` columns: `id uuid PK`, `user_id uuid FK → users(id) CASCADE`,
  `module_slug text NOT NULL`, `action_type text NOT NULL`, `local_id text`,
  `status text NOT NULL DEFAULT 'success'`, `error_message text`,
  `created_at timestamptz NOT NULL DEFAULT now()` — matches plan exactly.
- `products` columns: `id uuid PK`, `barcode text UNIQUE NOT NULL`, `name text NOT NULL`,
  `description text`, `category text`, `unit text DEFAULT 'pcs'`,
  `created_at timestamptz NOT NULL DEFAULT now()` — matches plan exactly.
- RLS enabled on both new tables.

### T14 — migrate_phase7.sql: seed data present
✅ PASS

- 5 seed products inserted: Industrial Valve A1 (0453C12413004615), Bolt M8x30,
  Bearing 6205, Filter Element HF-200, Gasket Set GS-40.
- Covers the barcode used in plan Test 4 (0453C12413004615).

### T15 — lib/supabase.js: service_role key confirmed
✅ PASS

- `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` — service role key
  used. Bypasses RLS for all server-side operations including private bucket
  uploads. Consistent with validator check #1.

### T16 — Device test: form submit via quality-inspector bridge call
✅ PASS (user confirmed)

- User ran app on device, submitted form via `submitTransaction` bridge call.
- Supabase `reports` table shows new row with `status = 'submitted'`.
- Row has correct schema columns (`photo_url`, `status`, `sync_reference` present
  after migration).
- `photo_url` is `null` — see Known Limitations below.

---

## Known Limitations

### 1. photo_url is null in current device tests (by design — Phase 8)

`shell_bridge.dart` line 105 encodes the `submitTransaction` body as:

```dart
body: jsonEncode({'moduleSlug': moduleSlug, 'payload': payload}),
```

No `photo` field is included in this call. The `api/reports` handler correctly
handles the missing field — `photo_url` initialises as `null` and the upload
block is skipped. The report row is saved successfully with `photo_url: null`.

This is expected behaviour for Phase 7. Phase 8 (offline queue) will pass the
base64 photo in the sync payload, at which point `photo_url` will be populated.

No code change is needed in the backend for this to work when Phase 8 delivers
the photo field.

### 2. Storage RLS policy uses auth.uid() — always NULL for backend requests

The `user-photos` bucket RLS policy (from the plan) uses `auth.uid()`, which
resolves the Supabase Auth UID. This app uses its own JWT, so `auth.uid()` is
always NULL for requests made by the backend. Server-side uploads use
`service_role` and bypass RLS entirely, so uploads are unaffected.

Direct client-side access to the bucket is not fully restricted by this policy.
Flagged for security hardening in a future phase.

### 3. No live curl tests performed

The tester agent verified all behaviour through code inspection and user-confirmed
device test. Live endpoint tests (curl) were not run directly by this agent.
The device test covers the primary happy path (POST /api/reports without photo).
POST /api/sync and GET /api/products/[barcode] are verified by code inspection
only; live verification is recommended before Phase 8 build begins.

---

## Ready for Reviewer: YES
