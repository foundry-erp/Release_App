# Phase 5 — Validator Report

```
VALIDATOR_DOC_VERSION: 1.0.0
VALIDATED: 2026-04-02
PLAN_VERSION: 1.0.0
```

---

## STATUS: APPROVED WITH NOTES

One blocking issue (upload script dependency resolution) and two warnings. All other checks passed. Builder must apply the fix described under "Issues Found" before proceeding.

---

## Checks Passed

### SQL Migration
- `modules.id` is `uuid primary key` — confirmed in `backend/sql/schema.sql`. FK reference from `module_versions.module_id → modules.id` is valid.
- `users.id` is `uuid primary key` — confirmed. FK reference from `user_module_permissions.user_id → users.id` is valid.
- Plan includes `UNIQUE (module_id, version)` on `module_versions` and `UNIQUE (user_id, module_id)` on `user_module_permissions`. `ON CONFLICT DO NOTHING` in seed data is safe given these constraints exist.
- `backend/lib/supabase.js` initializes the client with `SUPABASE_SERVICE_ROLE_KEY`. The service role bypasses RLS on all tables — including the three new tables. No RLS policy changes are needed for the backend to function.
- The existing `modules` table is not altered by the plan. `bundle_url`, `is_active`, `version`, etc. remain in place. No data loss risk.

### Backend API Rewrite
- `req.user.sub` contains the Supabase `users.id` UUID — confirmed. `backend/api/auth/login.js` sets `sub: user.id` in the JWT payload at line 45, and `auth.js` does `req.user = jwt.verify(token, JWT_SECRET)`. The new query `WHERE user_id = req.user.sub` will correctly match `user_module_permissions.user_id`.
- `backend/lib/supabase.js` exports `{ supabase }` — confirmed. The new `backend/api/modules/index.js` imports `const { supabase } = require('../../lib/supabase')` — path and named export match exactly.
- The plan correctly abandons the current direct `modules` table query. The current API queries `index_url` and `bundle_checksum` from `modules`, but those columns do not exist in the schema (pre-existing issue unrelated to Phase 5). The Phase 5 rewrite replaces this query entirely with the `user_module_permissions → module_versions → modules` join, resolving the inconsistency.

### inventory-checker Module
- `modules/quality-inspector/webpack.config.js` is self-contained and portable — no hardcoded module names, no absolute paths. inventory-checker can copy it exactly.
- Entry point pattern (`createRoot`, JSX, `./App` import) confirmed in `quality-inspector/src/index.js`. inventory-checker must follow the same pattern.
- React 18.2, Babel 7.23, Webpack 5.88 — versions are current and compatible with each other. No conflicts expected.

### Build Commands
- `quality-inspector/package.json` confirms `"build": "webpack --mode production"`. The plan's build command `npm run build` is correct for both modules.

### Script — Relative Paths
- Repository structure: `foundry-app/phase-5-module-cdn/` and `foundry-app/modules/` are siblings. The path `../modules/quality-inspector/dist/bundle.js` from within `phase-5-module-cdn/` resolves correctly.

---

## Issues Found

### [BLOCKING] upload-to-supabase.js: `@supabase/supabase-js` will not resolve

**Problem:** `phase-5-module-cdn/upload-to-supabase.js` calls `require('@supabase/supabase-js')`. Node.js resolves bare module specifiers by walking up the directory tree looking for `node_modules/`. The script lives in `foundry-app/phase-5-module-cdn/`, but `@supabase/supabase-js` is installed in `foundry-app/backend/node_modules/`. Node will NOT find it because `backend/node_modules/` is not on the ancestor path of `phase-5-module-cdn/`. The script will throw `MODULE_NOT_FOUND` at runtime.

**Exact fix required:** The Builder must add a minimal `package.json` to `phase-5-module-cdn/` and install the dependency there:

File: `phase-5-module-cdn/package.json`
```json
{
  "name": "phase-5-module-cdn-scripts",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0"
  }
}
```

The README must instruct the user to run `npm install` inside `phase-5-module-cdn/` before running the upload script. Alternatively, the README can instruct: `cd phase-5-module-cdn && npm install && node upload-to-supabase.js`.

The same applies to `generate-checksums.js` only if it also imports `@supabase/supabase-js`. If `generate-checksums.js` uses only Node built-ins (`crypto`, `fs`) then it is unaffected.

---

### [WARNING] PostgREST `!inner` join syntax — version dependency

The plan flags this itself in the RISKS section. Confirmed: `.select()` with `!inner` embedded join hints requires PostgREST v10+ (Supabase hosted projects updated to this in mid-2023; most active projects are on it). If the query fails with a PostgREST error at runtime, the fallback is to use a plain `.select()` without `!inner` and post-filter in JS for `is_active === true`. Builder should code-comment the fallback approach inline.

---

### [NOTE] `modules` table is missing `index_url` and `bundle_checksum` columns

The current `backend/api/modules/index.js` (line 17) queries `index_url` and `bundle_checksum` from the `modules` table. These columns are absent from `backend/sql/schema.sql`. This is a pre-existing schema/code mismatch, not introduced by Phase 5. The Phase 5 rewrite replaces this query entirely (those fields now come from `module_versions`), so this issue is resolved by the rewrite. No action needed from Builder — just awareness that the old code was broken.

---

## Builder Instructions

1. **Before writing `upload-to-supabase.js`:** Create `phase-5-module-cdn/package.json` with `@supabase/supabase-js: ^2.39.0` as a dependency (exact content above). The upload script `require('@supabase/supabase-js')` will then resolve correctly when run from `phase-5-module-cdn/`.

2. **`generate-checksums.js`:** If this script uses only `crypto` and `fs` (Node built-ins), no `package.json` is needed for it alone. Confirm and do not add unnecessary imports.

3. **`backend/api/modules/index.js` rewrite:** The new query joins `user_module_permissions → module_versions → modules`. Use `req.user.sub` for the user UUID filter — this is confirmed correct. Add an inline comment noting the `!inner` fallback (plain join + `.filter('is_active', 'eq', true)`) in case PostgREST version is below v10.

4. **`inventory-checker` webpack.config.js:** Copy `quality-inspector/webpack.config.js` exactly — no changes needed. Entry point, output filename (`bundle.js`), and HtmlWebpackPlugin template path are all correct as-is.

5. **`inventory-checker/src/index.js`:** Must follow the same `createRoot` pattern as `quality-inspector/src/index.js`. Do not use the legacy `ReactDOM.render()` API.

6. **README user steps:** Add `cd phase-5-module-cdn && npm install` as step 0 (before the generate-checksums and upload steps).

7. **All other plan steps are approved as written.** Build order in the plan is correct: build modules first, then generate checksums, then upload, then SQL migration (checksums must be known before seeding the DB).
