-- Jacobi for Agents: persistent provenance records (decisions + manifests).
-- Written by the backend with the service-role key through
-- backend/agentcore/storage.py (SupabaseRepo). Org scoping is enforced in the
-- repository layer; RLS is enabled with NO anon/authenticated policies so the
-- table is invisible to client-side keys entirely.

create table if not exists public.agent_provenance_records (
  record_id  text primary key,
  kind       text not null check (kind in ('decision', 'manifest')),
  org        text not null,
  payload    jsonb not null,
  sha256     text,
  created_at timestamptz not null default now()
);

alter table public.agent_provenance_records enable row level security;

create index if not exists idx_agent_provenance_org
  on public.agent_provenance_records (org, kind, created_at desc);
