-- Phase 7 Migration
-- Safe to re-run: all statements use IF NOT EXISTS / ON CONFLICT DO NOTHING
-- Run in Supabase SQL editor BEFORE deploying updated JS files

-- =========================================================
-- 1. Extend reports table
-- =========================================================
ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS photo_url      text,
  ADD COLUMN IF NOT EXISTS status         text NOT NULL DEFAULT 'submitted',
  ADD COLUMN IF NOT EXISTS sync_reference text;

-- =========================================================
-- 2. Sync logs table
-- =========================================================
CREATE TABLE IF NOT EXISTS sync_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_slug   text        NOT NULL,
  action_type   text        NOT NULL,
  local_id      text,
  status        text        NOT NULL DEFAULT 'success',
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_user_id ON sync_logs(user_id);

-- =========================================================
-- 3. Products table
-- =========================================================
CREATE TABLE IF NOT EXISTS products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode     text        UNIQUE NOT NULL,
  name        text        NOT NULL,
  description text,
  category    text,
  unit        text        DEFAULT 'pcs',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);

-- =========================================================
-- 4. Enable Row Level Security
-- =========================================================
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE products  ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 5. Seed test products
-- =========================================================
INSERT INTO products (barcode, name, description, category, unit) VALUES
  ('0453C12413004615', 'Industrial Valve A1',   'High-pressure valve 40mm',  'Valves',    'pcs'),
  ('123456789012',     'Bolt M8x30',            'Stainless steel bolt',       'Fasteners', 'pcs'),
  ('987654321098',     'Bearing 6205',          'Deep groove ball bearing',   'Bearings',  'pcs'),
  ('456789123045',     'Filter Element HF-200', 'Hydraulic filter 200L',      'Filters',   'pcs'),
  ('111222333444',     'Gasket Set GS-40',      'Rubber gasket kit',          'Seals',     'set')
ON CONFLICT (barcode) DO NOTHING;
