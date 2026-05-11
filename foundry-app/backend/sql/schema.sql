-- Foundry App Schema
-- Run in Supabase SQL editor

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text unique not null,
  email text not null,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_firebase_uid on users(firebase_uid);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  version text not null default '1.0.0',
  bundle_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  module_slug text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_reports_user_id on reports(user_id);
create index if not exists idx_reports_module_slug on reports(module_slug);

-- Enable Row Level Security (enforce via service role in backend)
alter table users enable row level security;
alter table modules enable row level security;
alter table reports enable row level security;
