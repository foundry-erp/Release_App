# Phase 7 — Backend: Reports API + Sync API + Products API

```
PHASE_ID: phase-7-backend-api
PLANNER_DOC_VERSION: 1.0.0
GENERATED: 2026-04-03
```

---

## GOAL
Backend can receive reports with photos (uploaded to Supabase Storage), process
batched sync actions from offline queue, and look up products by barcode.
All three endpoints verified working before Phase 8 (React offline queue).

Reference: IMPLEMENTATION_PLAN.md Phase 7

---

## CURRENT STATE (what exists)

### Already built:
- `backend/api/reports/index.js` — POST /api/reports (no photo support yet)
- `backend/api/auth/login.js` + `profile.js` — JWT auth working
- `backend/middleware/auth.js` — `requireAuth` middleware
- `backend/lib/supabase.js` — Supabase client
- `backend/sql/schema.sql` — reports table (no photo_url, no status, no sync_logs, no products)
- Supabase: `module-bundles` bucket exists (public)

### Does NOT exist yet:
- `user-photos` Supabase Storage bucket (private)
- `backend/api/sync/index.js`
- `backend/api/products/[barcode].js`
- `sync_logs` table
- `products` table
- `photo_url` + `status` columns on `reports` table

---

## SQL MIGRATION (phase 7)

File: `backend/sql/migrate_phase7.sql`

```sql
-- 1. Extend reports table
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS sync_reference text;

-- 2. Sync logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_slug   text NOT NULL,
  action_type   text NOT NULL,
  local_id      text,
  status        text NOT NULL DEFAULT 'success',
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);

-- 3. Products table
CREATE TABLE IF NOT EXISTS products (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode     text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  category    text,
  unit        text DEFAULT 'pcs',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- 4. Enable RLS
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;

-- 5. Seed test products
INSERT INTO products (barcode, name, description, category, unit) VALUES
  ('0453C12413004615', 'Industrial Valve A1',    'High-pressure valve 40mm', 'Valves',    'pcs'),
  ('123456789012',     'Bolt M8x30',             'Stainless steel bolt',     'Fasteners', 'pcs'),
  ('987654321098',     'Bearing 6205',           'Deep groove ball bearing',  'Bearings',  'pcs'),
  ('456789123045',     'Filter Element HF-200',  'Hydraulic filter 200L',    'Filters',   'pcs'),
  ('111222333444',     'Gasket Set GS-40',       'Rubber gasket kit',        'Seals',     'set')
ON CONFLICT (barcode) DO NOTHING;
```

---

## FILES TO CREATE / MODIFY

### 1. `backend/sql/migrate_phase7.sql` (CREATE)
Content: SQL above.

### 2. `backend/api/reports/index.js` (MODIFY)
Add photo_base64 upload before INSERT:
- If body contains `photo` (base64 data URL):
  - Strip `data:image/jpeg;base64,` prefix
  - Convert to Buffer
  - Upload to `user-photos` bucket at `{user_id}/{timestamp}.jpg`
  - Get public URL from Supabase
  - Store as `photo_url` in the INSERT

Full updated flow:
```
POST /api/reports
Body: { moduleSlug, payload, photo? }
→ requireAuth
→ if photo: upload Buffer to user-photos/{userId}/{Date.now()}.jpg
→ INSERT reports (user_id, module_slug, payload, photo_url, status='submitted')
→ 201 { id, photo_url, created_at }
```

### 3. `backend/api/sync/index.js` (CREATE)
```
POST /api/sync
Body: { actions: [{ type, payload, local_id }] }
→ requireAuth
→ loop actions:
    type 'submit_report':
      call reports insert logic (same as /api/reports)
      store sync_log
      return { local_id, success: true, server_id }
    type 'stock_count':
      insert into reports with module_slug='inventory-checker'
      store sync_log
      return { local_id, success: true, server_id }
    unknown type:
      return { local_id, success: false, error: 'Unknown action type' }
→ 200 { results: [...] }
```
- Never 500 the whole batch on partial failure — per-action error handling
- Always insert sync_log entry (success or failure)

### 4. `backend/api/products/[barcode].js` (CREATE)
```
GET /api/products/:barcode
→ requireAuth
→ SELECT from products WHERE barcode = req.query.barcode
→ 200 { id, barcode, name, description, category, unit }
→ 404 { error: 'Product not found' } if no row
```
Vercel dynamic route file: `api/products/[barcode].js`
Access param via: `req.query.barcode`

---

## SUPABASE STORAGE

**User action required** — cannot be done via API:

1. In Supabase dashboard → Storage → New bucket
   - Name: `user-photos`
   - Public: **NO** (private)
   - File size limit: 10MB

2. After creating bucket, run this SQL to add RLS policy:
```sql
CREATE POLICY "Users access own photos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'user-photos'
  AND (storage.foldername(name))[1] = (
    SELECT id::text FROM users WHERE firebase_uid = auth.uid()::text LIMIT 1
  )
);
```

Note: Since uploads are done server-side with service_role key, the RLS policy
is only needed to prevent direct client-side access. The backend bypasses RLS.

---

## VERCEL ROUTING

`api/products/[barcode].js` uses Vercel file-system routing.
No changes to `vercel.json` needed — the existing rewrite covers it:
`/api/(.*)` → `/api/$1`

Vercel automatically maps `[barcode]` to `req.query.barcode`.

---

## ERROR HANDLING STRATEGY

| Scenario | Handling |
|---|---|
| Photo upload fails | Still save report, photo_url = null, no 500 |
| Single sync action fails | Return error for that action, continue batch |
| Barcode not found | 404, React shows "Unknown product" |
| Invalid base64 photo | Catch Buffer error, skip upload, continue |
| Supabase insert fails | 500 with message (non-recoverable) |

---

## BUILD ORDER

1. Create `migrate_phase7.sql` and provide to user to run in Supabase
2. User creates `user-photos` bucket in dashboard
3. Update `api/reports/index.js` (add photo upload)
4. Create `api/sync/index.js`
5. Create `api/products/[barcode].js`
6. Deploy: `vercel --prod` from backend/
7. Test all 3 endpoints

---

## TESTS (for Tester agent)

### Test 1 — POST /api/reports with photo
```
POST https://foundry-app-rouge.vercel.app/api/reports
Authorization: Bearer <jwt>
Body: {
  "moduleSlug": "quality-inspector",
  "payload": { "itemCode": "TEST001", "notes": "Phase 7 test" },
  "photo": "data:image/jpeg;base64,/9j/4AAQ..."
}
Expected: 201 { id, photo_url (supabase URL), created_at }
Verify: photo visible in Supabase Storage → user-photos bucket
```

### Test 2 — POST /api/reports without photo
```
POST /api/reports
Body: { "moduleSlug": "inventory-checker", "payload": { "sku": "ABC123", "qty": 10 } }
Expected: 201 { id, photo_url: null, created_at }
```

### Test 3 — POST /api/sync with 2 actions
```
POST /api/sync
Body: {
  "actions": [
    { "type": "submit_report", "payload": { "moduleSlug": "quality-inspector", "payload": { "test": 1 } }, "local_id": "local-1" },
    { "type": "stock_count", "payload": { "sku": "XYZ", "location": "A1", "quantity": 5 }, "local_id": "local-2" }
  ]
}
Expected: 200 { results: [
  { local_id: "local-1", success: true, server_id: "uuid" },
  { local_id: "local-2", success: true, server_id: "uuid" }
]}
Verify: both records in Supabase reports table
```

### Test 4 — GET /api/products/:barcode (found)
```
GET /api/products/0453C12413004615
Authorization: Bearer <jwt>
Expected: 200 { barcode: "0453C12413004615", name: "Industrial Valve A1", ... }
```

### Test 5 — GET /api/products/:barcode (not found)
```
GET /api/products/NOTEXIST
Expected: 404 { error: "Product not found" }
```

### Test 6 — Auth enforcement
```
POST /api/reports (no Authorization header)
Expected: 401 { error: "Missing authorization header" }

POST /api/sync (no Authorization header)
Expected: 401

GET /api/products/123456789012 (no Authorization header)
Expected: 401
```
