-- ============================================================
-- Phase 5 migration: organizations, module_versions,
-- user_module_permissions + seed data
-- Run once in Supabase SQL editor.
-- Before running:
--   Replace <SUPABASE_PROJECT_REF> with your project ref
--   Replace <QI_CHECKSUM> with SHA-256 from generate-checksums.js
--   Replace <IC_CHECKSUM> with SHA-256 from generate-checksums.js
--   Replace <YOUR_FIREBASE_UID> and <YOUR_EMAIL> (optional)
-- ============================================================

-- 1. organizations
CREATE TABLE IF NOT EXISTS organizations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 2. module_versions
CREATE TABLE IF NOT EXISTS module_versions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id  uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version    text NOT NULL,
  cdn_url    text NOT NULL,
  index_url  text NOT NULL,
  checksum   text NOT NULL,
  size_kb    integer,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_module_version UNIQUE (module_id, version)
);
CREATE INDEX IF NOT EXISTS idx_module_versions_module_id ON module_versions(module_id);
ALTER TABLE module_versions ENABLE ROW LEVEL SECURITY;

-- 3. user_module_permissions
CREATE TABLE IF NOT EXISTS user_module_permissions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_id   uuid NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  permissions jsonb NOT NULL DEFAULT '["read","submit"]',
  granted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_module UNIQUE (user_id, module_id)
);
CREATE INDEX IF NOT EXISTS idx_ump_user_id ON user_module_permissions(user_id);
ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Seed: test organization
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Foundry Test Org')
ON CONFLICT (id) DO NOTHING;

-- 5. Seed: inventory-checker module
INSERT INTO modules (slug, name, version, is_active)
VALUES ('inventory-checker', 'Inventory Checker', '1.0.0', true)
ON CONFLICT (slug) DO UPDATE
  SET name      = EXCLUDED.name,
      version   = EXCLUDED.version,
      is_active = EXCLUDED.is_active;

-- 6. Seed: module_versions (fill in checksums + project ref before running)
DO $$
DECLARE
  v_qi_id uuid;
  v_ic_id uuid;
  v_base  text := 'https://gbjmxskxkqyfvqifvelg.supabase.co/storage/v1/object/public/module-bundles';
BEGIN
  SELECT id INTO v_qi_id FROM modules WHERE slug = 'quality-inspector';
  SELECT id INTO v_ic_id FROM modules WHERE slug = 'inventory-checker';

  INSERT INTO module_versions (module_id, version, cdn_url, index_url, checksum)
  VALUES (
    v_qi_id, '1.0.0',
    v_base || '/quality-inspector/1.0.0/bundle.js',
    v_base || '/quality-inspector/1.0.0/index.html',
    '2a4a07c1536ca098800b5650dafa91fc25f9d10ea77779071fb809ee624ed336'
  )
  ON CONFLICT (module_id, version) DO NOTHING;

  INSERT INTO module_versions (module_id, version, cdn_url, index_url, checksum)
  VALUES (
    v_ic_id, '1.0.0',
    v_base || '/inventory-checker/1.0.0/bundle.js',
    v_base || '/inventory-checker/1.0.0/index.html',
    '909943b82e9a6c62a391d5de1b7a6066e6b130b65a8717c1bcfae7365bb0c70e'
  )
  ON CONFLICT (module_id, version) DO NOTHING;
END $$;

-- 7. Seed: test user permissions
-- Skip if you use the normal login flow (login creates users automatically).
-- Only needed for Postman/curl testing without going through the app.
DO $$
DECLARE
  v_user_id uuid;
  v_qi_id   uuid;
  v_ic_id   uuid;
BEGIN
  SELECT id INTO v_user_id FROM users WHERE firebase_uid = '<YOUR_FIREBASE_UID>';
  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User not found — skipping permissions seed. Log in via the app first.';
    RETURN;
  END IF;

  SELECT id INTO v_qi_id FROM modules WHERE slug = 'quality-inspector';
  SELECT id INTO v_ic_id FROM modules WHERE slug = 'inventory-checker';

  INSERT INTO user_module_permissions (user_id, module_id)
  VALUES (v_user_id, v_qi_id)
  ON CONFLICT (user_id, module_id) DO NOTHING;

  INSERT INTO user_module_permissions (user_id, module_id)
  VALUES (v_user_id, v_ic_id)
  ON CONFLICT (user_id, module_id) DO NOTHING;
END $$;
