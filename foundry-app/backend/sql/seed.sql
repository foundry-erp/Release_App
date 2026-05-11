-- Seed data for Foundry App
-- Run after schema.sql

insert into modules (slug, name, version, is_active)
values
  ('quality-inspector', 'Quality Inspector', '1.0.0', true)
on conflict (slug) do update
  set name = excluded.name,
      version = excluded.version,
      is_active = excluded.is_active;
