-- Phase 3 migration: module registry OTA columns
-- Run in Supabase SQL editor AFTER schema.sql

ALTER TABLE modules ADD COLUMN IF NOT EXISTS bundle_checksum text;
ALTER TABLE modules ADD COLUMN IF NOT EXISTS index_url text;

UPDATE modules
SET
  version         = '1.1.0',
  bundle_url      = 'https://foundry-app-rouge.vercel.app/modules/quality-inspector/bundle.js',
  index_url       = 'https://foundry-app-rouge.vercel.app/modules/quality-inspector/index.html',
  bundle_checksum = 'ba58302d346bd00469a204a7df58eb5cabf0ca6423f9b7e590db61a664c665da'
WHERE slug = 'quality-inspector';
