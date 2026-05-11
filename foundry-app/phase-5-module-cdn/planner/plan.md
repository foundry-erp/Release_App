# Phase 5 — Module Registry API + CDN Setup

```
PHASE_ID: phase-5-module-cdn
PLANNER_DOC_VERSION: 1.0.0
GENERATED: 2026-04-02
```

---

## GOAL

Module registry API returns per-user modules with cdn_url and checksum.
Modules hosted on Supabase Storage CDN. Checksums verified.

Reference: IMPLEMENTATION_PLAN.md Phase 5

---

## WHAT_TO_BUILD

### 1. SQL Migration — `backend/sql/migrate_phase5.sql`
Add 3 new tables:
- `organizations` (id, name, created_at)
- `module_versions` (id, module_id→modules.id, version, cdn_url, index_url, checksum, size_kb, is_active, created_at)
  - UNIQUE constraint on (module_id, version)
- `user_module_permissions` (id, user_id→users.id, module_id→modules.id, permissions jsonb, granted_at)
  - UNIQUE constraint on (user_id, module_id)

Seed data:
- organizations: Foundry Test Org
- modules: add inventory-checker (quality-inspector already exists)
- module_versions: rows for both modules (cdn_url placeholders — user fills in after upload)
- user_module_permissions: test user gets both modules

### 2. Backend API — `backend/api/modules/index.js` (MODIFY)
Change from: SELECT * FROM modules WHERE is_active = true
Change to: user_module_permissions JOIN module_versions JOIN modules
           WHERE user_id = req.user.sub AND module.is_active = true
Return shape: { modules: [{ id, slug, name, version, cdn_url, index_url, checksum, size_kb, permissions }] }

### 3. New React Module — `modules/inventory-checker/`
Stock count form: SKU, location, quantity fields + Submit Count button + Ping Bridge button
Same webpack/babel toolchain as quality-inspector
ErrorBoundary included

Files:
- package.json
- webpack.config.js
- public/index.html
- src/index.js
- src/App.jsx

### 4. Production Builds
- `cd modules/quality-inspector && npm install && npm run build`
- `cd modules/inventory-checker && npm install && npm run build`

### 5. Checksum Script — `phase-5-module-cdn/generate-checksums.js`
Reads dist/bundle.js for both modules, prints SHA-256 + size

### 6. Upload Script — `phase-5-module-cdn/upload-to-supabase.js`
Uploads 4 files to Supabase Storage bucket `module-bundles`:
- quality-inspector/1.0.0/bundle.js
- quality-inspector/1.0.0/index.html
- inventory-checker/1.0.0/bundle.js
- inventory-checker/1.0.0/index.html
Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY env vars

### 7. README — `phase-5-module-cdn/README.md`
Step-by-step instructions for user to complete the CDN setup

---

## USER STEPS (cannot be automated — requires credentials)

1. Create `module-bundles` bucket in Supabase Storage dashboard (Public: ON, CORS: *)
2. Run: `node phase-5-module-cdn/generate-checksums.js` → get SHA-256 values
3. Run: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node phase-5-module-cdn/upload-to-supabase.js`
4. Paste checksums into `backend/sql/migrate_phase5.sql`, replace placeholders, run in Supabase SQL editor

---

## BUILD ORDER (for Builder agent)

1. Create modules/inventory-checker/ tree
2. npm install + npm run build (both modules)
3. Create phase-5-module-cdn/generate-checksums.js
4. Create phase-5-module-cdn/upload-to-supabase.js
5. Create phase-5-module-cdn/README.md
6. Modify backend/api/modules/index.js
7. Create backend/sql/migrate_phase5.sql

---

## TESTS TO PASS (from IMPLEMENTATION_PLAN.md)

1. GET /api/modules with JWT → array with cdn_url + checksum per module
2. Supabase Storage URL opens in browser → module UI renders
3. Manual checksum: download bundle.js → sha256 → matches DB value
4. CORS test: fetch() from browser DevTools → no CORS error

---

## RISKS

- PostgREST `!inner` join syntax requires Supabase PostgREST v10+; fallback is plain join + post-filter
- size_kb seeded as NULL; acceptable for phase 5
- Windows line endings do not affect SHA-256 (raw bytes)
- Existing modules table NOT altered — bundle_url/index_url columns stay, no data loss
