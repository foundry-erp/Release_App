-- Phase 4 migration: update quality-inspector bundle to v1.2.0 (Phase 4 UI)
-- Run in Supabase SQL editor

UPDATE modules
SET
  version         = '1.2.2',
  bundle_checksum = '6c03b12b354e2477d98e014464b9eedfe2e8629e0cdd127884da4698601c2f68'
WHERE slug = 'quality-inspector';
