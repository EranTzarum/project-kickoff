-- {{PROJECT_NAME}}: tenant root + membership + the access-token hook that stamps the
-- {{JWT_CLAIM}} claim. Enable the hook in the Supabase dashboard (Auth → Hooks → Custom Access Token)
-- after applying. Lesson: the hook runs as supabase_auth_admin with NO JWT, so auth.uid() is null there
-- and an own-row policy hides every membership row; the hook then "succeeds" and never stamps the claim.

create table if not exists public.{{TENANT_TABLE}} (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  {{TENANT_KEY}} uuid not null references public.{{TENANT_TABLE}}(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  constraint memberships_role_check check (role is not null and role in ({{ROLES_SQL}})),
  created_at timestamptz not null default now(),
  unique ({{TENANT_KEY}}, user_id)
);
create index if not exists memberships_user_id_idx on public.memberships(user_id);

alter table public.{{TENANT_TABLE}} enable row level security;
alter table public.memberships enable row level security;
revoke all on table public.{{TENANT_TABLE}} from anon;
revoke all on table public.memberships from anon;

-- a user sees only their own membership rows; writes go through the admin path
create policy memberships_select_own on public.memberships
  for select using (user_id = auth.uid());

-- the hook role must be able to read memberships (it has no JWT)
create policy memberships_auth_admin_read on public.memberships
  as permissive for select to supabase_auth_admin using (true);

-- a tenant row is visible to its members
create policy {{TENANT_TABLE}}_select_member on public.{{TENANT_TABLE}}
  for select using (id = (auth.jwt() ->> '{{JWT_CLAIM}}')::uuid);

-- the hook itself
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  claims jsonb;
  v_tenant uuid;
  v_role text;
begin
  select m.{{TENANT_KEY}}, m.role into v_tenant, v_role
  from public.memberships m
  where m.user_id = (event ->> 'user_id')::uuid
  limit 1;

  claims := event -> 'claims';
  if v_tenant is not null then
    claims := jsonb_set(claims, '{{{JWT_CLAIM}}}', to_jsonb(v_tenant::text));
    claims := jsonb_set(claims, '{role}', to_jsonb(v_role));
  end if;
  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from anon, authenticated, public;
grant select on table public.memberships to supabase_auth_admin;
