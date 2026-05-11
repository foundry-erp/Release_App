# Phase 7 — Reviewer Report

```
REVIEWER_VERSION: 1.0.0
REVIEWED: 2026-04-03
```

---

## STATUS: APPROVED WITH NOTES

All three endpoints are built, all critical requirements from the plan are met,
and error handling is correctly implemented throughout. Two open security items
and one missing live-test requirement are noted but do not block Phase 8 from
starting. The code is production-deployable under the conditions stated in
Pending for Phase 8.

---

## What Shipped

| Deliverable | Status |
|---|---|
| `backend/api/reports/index.js` — photo upload + INSERT | Shipped |
| `backend/api/sync/index.js` — batched sync with per-action isolation | Shipped |
| `backend/api/products/[barcode].js` — barcode lookup | Shipped |
| `backend/sql/migrate_phase7.sql` — 3 schema changes + RLS + seed data | Shipped |
| Shared `uploadPhoto()` helper extracted in sync handler | Shipped (validator-recommended) |

The validator's four builder instructions were all acted on:
- Graceful photo fallback (photo_url stays null on upload error) — confirmed in code.
- SQL migration must run before deploy — documented in migration file header.
- Sync payload nesting `action.payload.moduleSlug / .payload / .photo` — confirmed in sync handler lines 66–68.
- `.select('id, photo_url, created_at')` added to reports INSERT — confirmed line 66 of reports/index.js.

---

## Quality Assessment

### 1. Plan conformance — PASS

Every endpoint matches the spec exactly:

- `POST /api/reports` returns `201 { id, photo_url, created_at }`. Photo is optional and non-fatal.
- `POST /api/sync` returns `200 { results: [...] }`. Batch never 500s on partial failure.
- `GET /api/products/:barcode` returns `200 { id, barcode, name, description, category, unit }` or `404`.
- All three endpoints enforce `requireAuth` with the Promise-wrapper pattern and `res.headersSent` guard.

### 2. Photo failure handling — PASS

`reports/index.js` has two nested guards:
- Inner: `if (uploadError)` logs and falls through to `photo_url = null`.
- Outer: `catch (photoErr)` catches Buffer decode failures and any other unexpected throws.

In both cases the INSERT still runs and returns 201. This is the correct behaviour
specified in the plan's error handling table.

The same pattern is replicated cleanly in the `uploadPhoto()` helper used by sync.

### 3. Batch isolation in sync — PASS

Each action type block (`submit_report`, `stock_count`, else) is wrapped in its
own `try/catch`. On any failure the error is caught, a `sync_logs` failure row is
inserted, a `{ success: false }` result is pushed, and the loop continues.
The final `res.status(200).json({ results })` is unconditional and always reached.

The 50-action batch limit (line 51–53) is a good defensive addition not in the
original plan — it prevents runaway iteration and is appropriate for production.

### 4. SQL migration safety — PASS

All DDL is idempotent:
- `ADD COLUMN IF NOT EXISTS` — safe on a live table with existing rows.
- `status NOT NULL DEFAULT 'submitted'` — existing rows receive the default on
  the ALTER, no null constraint violation.
- `CREATE TABLE IF NOT EXISTS` — safe re-run.
- `CREATE INDEX IF NOT EXISTS` — safe re-run.
- `INSERT ... ON CONFLICT (barcode) DO NOTHING` — seed is safe to re-run.
- RLS is enabled on both new tables.

No `DROP` statements, no destructive changes. Migration is safe to run on a live
database with existing data.

One minor observation: RLS is enabled on `products` but no RLS policies are
defined for it in this migration. With RLS enabled and no permissive policy,
the products table will deny all access to non-service-role sessions. Since all
backend queries use the service_role client (bypasses RLS), this is not a
functional problem today. It does mean direct Supabase dashboard reads by
authenticated users (anon/user role) will return no rows. Flag for a future phase
if admin tooling is needed.

### 5. sync/index.js photo logic duplication — RESOLVED

The validator flagged a duplication risk (Issue 3). The builder correctly
extracted `uploadPhoto()` as a shared helper at the top of sync/index.js.
The reports/index.js still has its own inline photo block (not extracted), but
the two handlers are independent files so drift is limited. Not a blocker —
a shared `lib/uploadPhoto.js` utility would be cleaner long-term but is out of
scope for Phase 7.

### 6. Input validation coverage — ADEQUATE

- `moduleSlug` and `payload` are validated in reports handler (lines 17–22).
- `actions` array type and length are validated in sync handler (lines 48–53).
- Barcode comes from the URL path (Vercel dynamic segment), not the request body,
  so no additional sanitization is needed before the parameterized Supabase query.
- No raw SQL is constructed anywhere — all queries use the Supabase SDK
  `.eq()` / `.insert()` methods which are parameterized by the SDK. SQL injection
  risk is effectively zero.

---

## Security Notes

### NOTE 1 — Storage RLS policy does not restrict direct client access (carry-forward)

The `user-photos` bucket RLS policy from the plan uses `auth.uid()`, which
resolves the Supabase Auth UID. This app uses its own custom JWT, so `auth.uid()`
is always NULL for any request that does not go through Supabase Auth. The policy
therefore never matches and does not restrict direct client-side reads of the
bucket.

Server-side uploads use `service_role` and bypass RLS entirely, so uploads
function correctly. The gap is: a client who discovers a storage object path
could potentially read it directly via the Supabase Storage public URL if the
bucket were public. The bucket is private, which limits this somewhat, but the
RLS policy is not providing the intended per-user isolation.

**Risk level: Low for Phase 7.** No client-side code directly accesses the
bucket. All photo retrieval in the app will go through the backend which returns
the URL. Address in a future security hardening phase by either:
(a) switching to Supabase Auth so `auth.uid()` resolves correctly, or
(b) writing the RLS policy against the custom JWT claim rather than `auth.uid()`.

### NOTE 2 — sync endpoint: moduleSlug is not validated in submit_report action

In `reports/index.js`, `moduleSlug` is validated as required (returns 400 if
missing). In `sync/index.js`, `submit_report` reads `action.payload?.moduleSlug`
using optional chaining, meaning it can be `undefined`. The Supabase insert
will then write `module_slug: undefined`, which Supabase coerces to `null`.
The `reports.module_slug` column is `text NOT NULL`, so this will cause a
constraint violation and the action will fail — it will be caught by the
`try/catch`, logged as a failure, and the batch will continue.

This is not a security issue, but it is a UX defect: Phase 8 will receive a
`{ success: false, error: '...' }` result for any submit_report action that
omits moduleSlug, rather than a clear validation error message.

**Recommendation:** Add a moduleSlug presence check inside the `submit_report`
block and return `{ local_id, success: false, error: 'moduleSlug is required' }`
early, before attempting the insert. Not blocking Phase 8 but should be addressed
before Phase 8 ships.

### NOTE 3 — No input length limits on text fields

`moduleSlug`, `payload` (jsonb), and `local_id` have no size limits enforced at
the API layer. A malformed client could send very large payloads. Supabase will
enforce column type constraints but not column length. This is acceptable for an
internal enterprise app in Phase 7, but rate limiting and payload size limits
should be added in a hardening pass.

---

## Pending for Phase 8

### REQUIRED before Phase 8 can ship (not just start):

1. **Live endpoint tests for /api/sync and /api/products/:barcode**
   The tester confirmed these by code inspection only. The device test only
   covered `POST /api/reports` without photo. A live curl or Postman test of
   the sync endpoint and barcode lookup against the deployed Vercel URL must be
   done before Phase 8 React code treats these endpoints as reliable.

2. **`user-photos` Supabase Storage bucket must be created manually**
   This is a user action item from the plan. If it is not done, photo uploads
   will silently fail and all `photo_url` values will be null. Phase 8 will pass
   photo data — confirm the bucket exists before Phase 8 QA begins.

### Phase 8 compatibility — CONFIRMED

The sync endpoint shape is fully compatible with what Phase 8 (React offline
queue) will send:

```json
POST /api/sync
{
  "actions": [
    {
      "type": "submit_report",
      "payload": { "moduleSlug": "...", "payload": {...}, "photo": "data:image/jpeg;base64,..." },
      "local_id": "local-uuid-1"
    }
  ]
}
```

- `actions` array — supported.
- `local_id` per action — supported, echoed in response.
- `photo` as base64 data URL inside `submit_report` payload — supported by
  `uploadPhoto()` helper.
- Response shape `{ results: [{ local_id, success, server_id }] }` — sufficient
  for the React queue to reconcile local vs server IDs.

Phase 8 can begin building against these contracts immediately.

### RECOMMENDED (not blocking):

- Extract `uploadPhoto()` into `backend/lib/uploadPhoto.js` so both
  `reports/index.js` and `sync/index.js` share a single implementation.
- Add `moduleSlug` presence check inside `sync/index.js` submit_report block
  (see Security Note 2).
- Run migrate_phase7.sql and confirm all 5 seed products are visible in the
  Supabase products table before Phase 8 barcode scanning tests.

---

## Final Verdict

Phase 7 is approved. The three endpoints are implemented correctly, match the
plan specification, handle errors gracefully (photo failures are non-fatal, batch
never fails the whole request, unknown sync types are logged not thrown), and the
SQL migration is safe for production. No security vulnerabilities are present in
the code itself.

Two items must be completed before Phase 8 QA (not before Phase 8 development
begins): live tests of /api/sync and /api/products/:barcode, and confirmation
that the user-photos storage bucket exists. The Storage RLS gap and sync
moduleSlug validation gap are noted for the next hardening pass.

**Phase 8 (React offline queue) is unblocked.**
