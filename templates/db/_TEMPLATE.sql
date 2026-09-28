-- {{PROJECT_NAME}} migration template. Copy to YYYYMMDDHHMM_<name>.sql and delete what you do not use.
-- Rules baked in (see docs/MIGRATION_RUNBOOK.md):
--   * every tenant table: {{TENANT_KEY}} column, index, RLS enabled, tenant policy, revoke all from anon
--   * every function: revoke execute from anon and public (Postgres grants EXECUTE to public on create)
--   * CHECK constraints spell out `is not null` (a CHECK passes on NULL)
--   * unique indexes that back an upsert are NOT partial
--   * trigger-assigned NOT NULL columns carry a DEFAULT so generated Insert types stay optional

-- ---------- table ----------
create table if not exists public.example (
  id uuid primary key default gen_random_uuid(),
  {{TENANT_KEY}} uuid not null references public.{{TENANT_TABLE}}(id) on delete cascade,
  created_by uuid not null default auth.uid() references auth.users(id),
  status text not null default 'draft',
  constraint example_status_check check (status is not null and status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists example_{{TENANT_KEY}}_idx on public.example({{TENANT_KEY}});

alter table public.example enable row level security;

create policy example_tenant_isolation on public.example
  for all
  using ({{TENANT_KEY}} = (auth.jwt() ->> '{{JWT_CLAIM}}')::uuid)
  with check ({{TENANT_KEY}} = (auth.jwt() ->> '{{JWT_CLAIM}}')::uuid);

revoke all on table public.example from anon;

-- ---------- function ----------
create or replace function public.example_fn(p_id uuid)
returns setof public.example
language sql
security invoker
set search_path = public
as $$
  select * from public.example
  where id = p_id
    and {{TENANT_KEY}} = (auth.jwt() ->> '{{JWT_CLAIM}}')::uuid;
$$;

revoke execute on function public.example_fn(uuid) from anon, public;
grant execute on function public.example_fn(uuid) to authenticated;
