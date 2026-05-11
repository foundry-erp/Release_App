# Phase 7 — Validator Report

```
VALIDATOR_VERSION: 1.0.0
VALIDATED: 2026-04-03
```

---

## STATUS: APPROVED WITH NOTES

All blocking checks pass. Two minor notes for the Builder regarding the
RLS policy limitation and sync endpoint payload nesting. No blockers.

---

## Checks Passed

### 1. Supabase client — service_role key confirmed
`lib/supabase.js` uses `SUPABASE_SERVICE_ROLE_KEY`. Service role bypasses
RLS entirely — correct for server-side uploads to a private bucket.

### 2. JWT sub → user_id INSERT alignment confirmed
`auth/login.js` signs JWT with `sub: user.id` (Supabase UUID).
`api/reports/index.js` already inserts `user_id: req.user.sub`.
FK constraint `user_id uuid references users(id)` is satisfied.

### 3. Dynamic route [barcode].js is correct for Vercel
`api/products/[barcode].js` maps to `/api/products/:barcode`.
Param accessed via `req.query.barcode`. The existing vercel.json rewrite
does not interfere — Vercel resolves file-system routes before rewrites.

### 4. Photo upload — Buffer supported by installed SDK
`package.json` has `@supabase/supabase-js: ^2.39.0`.
`storage.from(bucket).upload(path, Buffer, options)` supported since v2.x.
No additional npm packages needed.

### 5. module_slug is free-form text — sync routing confirmed
`reports.module_slug text not null` has no CHECK constraint.
Both `submit_report` and `stock_count` action types insert cleanly.

### 6. No extra npm dependencies needed
`Buffer` and base64 decode are Node.js built-ins. No `npm install` needed.

### 7. vercel.json — no functions block is fine
`package.json` declares `engines: { node: ">=20" }`. Vercel auto-detects
Node 20. No vercel.json changes needed.

### 8. SQL migration is idempotent
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` with DEFAULT — safe on live data.
`CREATE TABLE IF NOT EXISTS` — safe to re-run.
`INSERT ... ON CONFLICT DO NOTHING` — safe seed.

---

## Issues Found

### ISSUE 1 (Minor / Non-blocking) — vercel.json rewrite is a no-op
`/api/(.*)` → `/api/$1` maps every route to itself. Harmless, but
redundant. Builder does not need to change it.

### ISSUE 2 (Minor / Non-blocking) — Storage RLS policy uses auth.uid()
The plan's RLS policy uses `auth.uid()` which returns the Supabase Auth
UID. This app uses its own JWT — so `auth.uid()` is always NULL for
backend requests. Since uploads use service_role (bypasses RLS), the
policy does not block uploads. Acceptable for this phase — flag for
future security hardening.

### ISSUE 3 (Minor / Note) — sync endpoint photo logic duplication risk
`submit_report` sync action calls the same insert logic as `/api/reports`.
Builder should keep this logic consistent between the two handlers to
avoid drift. Extracting a shared helper is recommended.

---

## Builder Instructions

1. **Bucket first**: Create `user-photos` bucket in Supabase dashboard
   BEFORE deploying. If bucket is missing, photo upload will error.
   Implement graceful fallback: catch upload error → save report with
   `photo_url = null` → still return 201.

2. **SQL before deploy**: Run `migrate_phase7.sql` in Supabase BEFORE
   pushing to Vercel. The updated reports handler inserts `photo_url` and
   `status` columns that don't exist until migration runs.

3. **Sync payload nesting**: For `submit_report` actions, read:
   - `action.payload.moduleSlug` → module_slug
   - `action.payload.payload`    → jsonb payload
   - `action.payload.photo`      → optional photo base64
   The plan's test body confirms this nesting.

4. **Update SELECT in reports INSERT**: Change
   `.select('id, created_at')` → `.select('id, photo_url, created_at')`
   so the response includes the uploaded photo URL.

5. **No vercel.json changes.** No new npm packages.

6. **Verify env var**: Confirm `SUPABASE_SERVICE_ROLE_KEY` is set in
   Vercel project environment variables before testing photo upload.
