-- Run once in Supabase > SQL Editor > New query > Run. Safe to re-run.
create table if not exists public.app_records (
  ws text not null,
  tbl text not null,
  id text not null,
  data jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (ws, tbl, id)
);
create table if not exists public.app_log (
  id bigint generated always as identity primary key,
  ws text not null,
  actor text not null,
  summary text not null,
  at timestamptz not null default now()
);
-- Row level security on, no policies: browser keys get nothing.
-- Only the server (secret key) can read and write.
alter table public.app_records enable row level security;
alter table public.app_log enable row level security;
