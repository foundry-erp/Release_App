# Phase 5 — Module CDN Setup

## What was built
- `modules/inventory-checker/` — new React module (stock count form)
- `backend/api/modules/index.js` — rewritten to return per-user modules from module_versions
- `backend/sql/migrate_phase5.sql` — adds organizations, module_versions, user_module_permissions tables
- `generate-checksums.js` — compute SHA-256 of built bundles
- `upload-to-supabase.js` — upload bundles to Supabase Storage CDN

## Steps YOU must complete

### 0. Install upload script dependencies
```bash
cd phase-5-module-cdn
npm install
cd ..
```

### 1. Create Supabase Storage bucket
- Go to Supabase Dashboard → Storage → New bucket
- Name: `module-bundles`
- Public: **ON**
- Under bucket settings → CORS: allow all origins (`*`)

### 2. Generate checksums
```bash
# From foundry-app root:
node phase-5-module-cdn/generate-checksums.js
```
Copy the SHA-256 values printed for each module.

### 3. Upload bundles to Supabase Storage
```bash
cd phase-5-module-cdn
npm install
cd ..
SUPABASE_URL=https://<ref>.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=<service_role_key> \
node phase-5-module-cdn/upload-to-supabase.js
```
On Windows PowerShell:
```powershell
$env:SUPABASE_URL="https://<ref>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="<service_role_key>"
node phase-5-module-cdn/upload-to-supabase.js
```

### 4. Run SQL migration
- Open `backend/sql/migrate_phase5.sql`
- Replace `<SUPABASE_PROJECT_REF>` with your project ref (from Supabase → Settings → API)
- Replace `<QI_CHECKSUM>` with SHA-256 from step 2 (quality-inspector)
- Replace `<IC_CHECKSUM>` with SHA-256 from step 2 (inventory-checker)
- Replace `<YOUR_FIREBASE_UID>` and `<YOUR_EMAIL>` with the test account values
- Run in Supabase SQL editor

## Verification tests
See `IMPLEMENTATION_PLAN.md` Phase 5 test checklist.
