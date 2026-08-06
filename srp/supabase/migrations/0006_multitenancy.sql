-- 0006_multitenancy.sql — S1: turn the single-company portal into a
-- multi-tenant SaaS (CLAUDE.md §2.1, D11–D14, D22).
--
-- What v1 got wrong, and this fixes:
--   1. is_staff() meant "has a profiles row" — every staff member of every
--      customer could read every job, application and evaluation.
--   2. settings was a single row (check id = 1) — two companies were
--      structurally impossible.
--   3. profiles conflated identity, role and company.
--
-- The new gate is current_org_ids(): the set of organizations the caller may
-- touch. Nothing tenant-scoped is readable outside it.
--
-- Storage isolation is a separate migration (0007) because the physical CV
-- files must be relocated between the two — see its header for the order.

-- ============================================================
-- Types
-- ============================================================

create type org_status as enum
  ('trial','active','past_due','suspended','cancelled');

-- Tenant-level roles. 'owner' additionally controls billing and deletion;
-- 'viewer' is read-only (a hiring manager reviewing their own candidates).
create type member_role as enum ('owner','admin','hr','viewer');

-- ============================================================
-- Tenancy tables
-- ============================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  -- Public careers URL (/c/{slug}) and, later, the subdomain. Reserved words
  -- are blocked so a tenant can never shadow a platform route.
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
    check (slug not in (
      'admin','platform','api','app','www','login','signup','jobs',
      'companies','track','settings','static','assets','public','auth'
    )),
  name text not null,
  logo_path text,
  cover_path text,
  about text,                       -- markdown, shown on the careers page
  website text,
  industry text,
  city text,
  brand_color text,
  status org_status not null default 'trial',
  -- Whether the org appears in the shared marketplace (/jobs, /companies).
  -- Its own careers page stays reachable either way.
  listed_publicly boolean not null default true,
  retention_months int not null default 12
    check (retention_months between 1 and 60),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index on organizations(status) where deleted_at is null;
create index on organizations(listed_publicly) where deleted_at is null;

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role member_role not null default 'hr',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- Every RLS policy resolves tenancy through this index. Without it each
-- policy evaluation is a sequential scan.
create index on memberships(user_id);

-- D13: platform staff are deliberately NOT a value in member_role. A tenant
-- admin who could somehow write to memberships still cannot reach this table.
create table platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

-- D22: support access to a tenant is an explicit, expiring, reason-carrying
-- session rather than a standing privilege. current_org_ids() honours it, so
-- RLS remains the only gate; the UI shows a permanent banner while one is
-- live. The console that creates these lands in S4.
create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  platform_user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  reason text not null check (length(btrim(reason)) >= 8),
  expires_at timestamptz not null default now() + interval '60 minutes',
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index on impersonation_sessions(platform_user_id, org_id)
  where ended_at is null;

-- ============================================================
-- org_id on every tenant-scoped table (nullable first, backfilled below)
-- ============================================================

alter table jobs           add column org_id uuid references organizations(id) on delete cascade;
alter table applications   add column org_id uuid references organizations(id) on delete cascade;
alter table ai_evaluations add column org_id uuid references organizations(id) on delete cascade;
alter table status_history add column org_id uuid references organizations(id) on delete cascade;

-- D5 asked for the failure reason to be stored, not only logged.
alter table applications add column analysis_error text;

-- ============================================================
-- Backfill: everything that exists today belongs to one organization
-- ============================================================

do $$
declare
  v_org uuid;
  v_name text;
  v_retention int;
  v_owner uuid;
begin
  select coalesce(nullif(btrim(company_name), ''), 'الشركة'), retention_months
    into v_name, v_retention
  from settings where id = 1;

  -- settings is guaranteed by 0001, but never let a missing row abort the
  -- migration and leave org_id half-populated.
  v_name := coalesce(v_name, 'الشركة');
  v_retention := coalesce(v_retention, 12);

  insert into organizations (slug, name, status, listed_publicly, retention_months)
  values ('default', v_name, 'active', true, v_retention)
  returning id into v_org;

  update jobs           set org_id = v_org where org_id is null;
  update applications   set org_id = v_org where org_id is null;
  update ai_evaluations set org_id = v_org where org_id is null;
  update status_history set org_id = v_org where org_id is null;

  -- Existing staff become members. The longest-standing admin becomes the
  -- owner (billing and deletion have to belong to exactly one person to
  -- start with); remaining admins keep admin, hr keeps hr.
  select id into v_owner
  from profiles where role = 'admin'
  order by created_at asc, id asc
  limit 1;

  if v_owner is null then
    select id into v_owner from profiles order by created_at asc, id asc limit 1;
  end if;

  insert into memberships (org_id, user_id, role)
  select
    v_org,
    p.id,
    case
      when p.id = v_owner then 'owner'::member_role
      when p.role = 'admin' then 'admin'::member_role
      else 'hr'::member_role
    end
  from profiles p
  on conflict (org_id, user_id) do nothing;
end $$;

alter table jobs           alter column org_id set not null;
alter table applications   alter column org_id set not null;
alter table ai_evaluations alter column org_id set not null;
alter table status_history alter column org_id set not null;

create index on jobs(org_id, status) where deleted_at is null;
create index on applications(org_id, created_at desc);
create index on applications(org_id, job_id, status);
create index on ai_evaluations(org_id);
create index on status_history(org_id);

-- settings has served its purpose: its two fields now live per-organization.
-- Dropping the table takes its policies with it.
drop table settings;

-- ============================================================
-- Retire the v1 authorization model
--
-- Order matters here: the policies call the helpers, the helpers read
-- profiles.role, and user_role cannot be dropped while the column exists.
-- ============================================================

drop policy profiles_select_self  on profiles;
drop policy profiles_admin_select on profiles;
drop policy profiles_admin_insert on profiles;
drop policy profiles_admin_update on profiles;
drop policy profiles_admin_delete on profiles;

drop policy jobs_public_select on jobs;
drop policy jobs_staff_select  on jobs;
drop policy jobs_staff_insert  on jobs;
drop policy jobs_staff_update  on jobs;

drop policy applications_public_insert on applications;
drop policy applications_staff_select  on applications;
drop policy applications_staff_update  on applications;

drop policy ai_evaluations_staff_select on ai_evaluations;
drop policy ai_evaluations_staff_update on ai_evaluations;

drop policy status_history_staff_select on status_history;
drop policy status_history_staff_insert on status_history;

-- The v1 storage policies are the worst of the leaks: cvs_staff_select was
-- `bucket_id = 'cvs' and is_staff()`, i.e. every staff member of every
-- customer could read every CV. They go now, with the function they depend
-- on; 0007 installs the org-scoped replacements. In between, nobody can read
-- a CV — the correct direction to fail.
drop policy cvs_public_insert on storage.objects;
drop policy cvs_staff_select  on storage.objects;

drop function public.is_staff();
drop function public.current_user_role();

-- profiles is identity only from here (D14); the role lives on the membership.
alter table profiles drop column role;
drop type user_role;

-- ============================================================
-- Helper functions
--
-- All security definer: RLS on memberships/impersonation_sessions must not
-- re-enter while a policy is being evaluated.
-- ============================================================

-- D13. Reads platform_admins and nothing else — membership in this table
-- grants platform tables, never tenant rows.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- THE tenancy gate. Every tenant-scoped policy compares against this.
-- Callers get their memberships plus any live impersonation session (D22),
-- which is why support access needs no policy of its own.
create or replace function public.current_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct org_id), '{}'::uuid[])
  from (
    select org_id from memberships where user_id = auth.uid()
    union
    select org_id from impersonation_sessions
     where platform_user_id = auth.uid()
       and ended_at is null
       and expires_at > now()
  ) s
$$;

-- Membership with an optional role filter, for write policies.
create or replace function public.is_org_member(
  p_org uuid,
  p_roles member_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from memberships m
    where m.user_id = auth.uid()
      and m.org_id = p_org
      and (p_roles is null or m.role = any(p_roles))
  ) or exists (
    select 1 from impersonation_sessions i
    where i.platform_user_id = auth.uid()
      and i.org_id = p_org
      and i.ended_at is null
      and i.expires_at > now()
  )
$$;

create or replace function public.org_role(p_org uuid)
returns member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from memberships where user_id = auth.uid() and org_id = p_org
$$;

-- Whether an organization is reachable by the public at all. Note this does
-- NOT consider listed_publicly: an unlisted org still has a working careers
-- page, it simply does not appear in the shared marketplace.
create or replace function public.org_is_public(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organizations o
    where o.id = p_org
      and o.status in ('trial','active')
      and o.deleted_at is null
  )
$$;

-- Used by Edge Functions to authorize a re-run: staff of the application's
-- OWN organization, never staff in general (this is what is_staff() got
-- wrong).
create or replace function public.can_manage_application(p_application_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from applications a
    where a.id = p_application_id
      and public.is_org_member(
            a.org_id, array['owner','admin','hr']::member_role[])
  )
$$;

revoke execute on function public.is_platform_admin() from public;
revoke execute on function public.current_org_ids() from public;
revoke execute on function public.is_org_member(uuid, member_role[]) from public;
revoke execute on function public.org_role(uuid) from public;
revoke execute on function public.org_is_public(uuid) from public;
revoke execute on function public.can_manage_application(uuid) from public;

grant execute on function public.is_platform_admin() to anon, authenticated;
grant execute on function public.current_org_ids() to anon, authenticated;
grant execute on function public.is_org_member(uuid, member_role[]) to anon, authenticated;
grant execute on function public.org_role(uuid) to anon, authenticated;
grant execute on function public.org_is_public(uuid) to anon, authenticated;
grant execute on function public.can_manage_application(uuid) to anon, authenticated;

-- ============================================================
-- Consistency guards
--
-- org_id is derived from the parent row by a BEFORE trigger rather than
-- trusted from the caller, so no client — not even a service-role Edge
-- Function with a bug — can file an application under the wrong tenant.
-- ============================================================

create or replace function public.set_org_from_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from jobs where id = new.job_id;
  if v_org is null then
    raise exception 'job % not found', new.job_id using errcode = '23503';
  end if;
  new.org_id := v_org;
  return new;
end;
$$;

create trigger applications_set_org
before insert or update of job_id on applications
for each row execute function public.set_org_from_job();

create or replace function public.set_org_from_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from applications where id = new.application_id;
  if v_org is null then
    raise exception 'application % not found', new.application_id
      using errcode = '23503';
  end if;
  new.org_id := v_org;
  return new;
end;
$$;

create trigger ai_evaluations_set_org
before insert or update of application_id on ai_evaluations
for each row execute function public.set_org_from_application();

create trigger status_history_set_org
before insert or update of application_id on status_history
for each row execute function public.set_org_from_application();

-- An organization must never be left without an owner.
--
-- Deferrable but INITIALLY IMMEDIATE: a deferred-by-default check only fires
-- at commit, which means a transaction can run on for an arbitrary length of
-- time against an ownerless org before finding out, and any caller that rolls
-- back never exercises the guard at all. Immediate fails at the offending
-- statement instead. A genuine ownership handover can still opt out for the
-- duration of its transaction with
--   set constraints memberships_owner_guard deferred;
create or replace function public.enforce_org_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  v_org := case when tg_op = 'DELETE' then old.org_id else new.org_id end;

  -- The org itself is going away (cascade): nothing to protect.
  if not exists (select 1 from organizations where id = v_org) then
    return null;
  end if;

  if not exists (
    select 1 from memberships where org_id = v_org and role = 'owner'
  ) then
    raise exception 'organization must keep at least one owner'
      using errcode = '23514';
  end if;
  return null;
end;
$$;

create constraint trigger memberships_owner_guard
after update or delete on memberships
deferrable initially immediate
for each row execute function public.enforce_org_has_owner();

-- ============================================================
-- Status history trigger — now records org_id (0001 replacement)
-- ============================================================

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history (org_id, application_id, from_status, to_status, changed_by, note)
    values (new.org_id, new.id, null, new.status, auth.uid(), null);
  elsif new.status is distinct from old.status then
    insert into status_history (org_id, application_id, from_status, to_status, changed_by, note)
    values (
      new.org_id,
      new.id,
      old.status,
      new.status,
      auth.uid(),
      nullif(current_setting('srp.status_change_note', true), '')
    );
  end if;
  return new;
end;
$$;

-- ============================================================
-- change_application_status — membership-scoped (0003 replacement)
-- ============================================================

create or replace function public.change_application_status(
  p_application_id uuid,
  p_new_status app_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current app_status;
  v_org uuid;
begin
  select status, org_id into v_current, v_org
  from applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;

  -- Authorization is against the application's OWN organization.
  if not public.is_org_member(
       v_org, array['owner','admin','hr']::member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_current = p_new_status then
    return; -- no-op; nothing recorded
  end if;

  perform set_config('srp.status_change_note', coalesce(p_note, ''), true);
  update applications set status = p_new_status where id = p_application_id;
  perform set_config('srp.status_change_note', '', true);
end;
$$;

-- ============================================================
-- RLS — new tables
-- ============================================================

alter table organizations          enable row level security;
alter table memberships            enable row level security;
alter table platform_admins        enable row level security;
alter table impersonation_sessions enable row level security;

-- Explicit rather than relying on the schema's default privileges, so the
-- grants are identical on a hosted project and in the local test harness.
grant select on organizations to anon, authenticated;
grant select on memberships to authenticated;
grant select, insert, update, delete on platform_admins to authenticated;
grant select, insert, update, delete on impersonation_sessions to authenticated;
grant insert, update, delete on memberships to authenticated;

-- ---------- organizations ----------
-- Any live organization is publicly resolvable so its careers page works.
-- listed_publicly is a marketplace filter applied by the app, not a
-- visibility boundary.
create policy organizations_public_select on organizations
  for select to anon, authenticated
  using (status in ('trial','active') and deleted_at is null);

create policy organizations_member_select on organizations
  for select to authenticated
  using (id in (select unnest(public.current_org_ids())));

create policy organizations_platform_select on organizations
  for select to authenticated
  using ((select public.is_platform_admin()));

create policy organizations_admin_update on organizations
  for update to authenticated
  using (public.is_org_member(id, array['owner','admin']::member_role[]))
  with check (public.is_org_member(id, array['owner','admin']::member_role[]));

-- Creation belongs to the signup flow (S2, service role) and deletion is a
-- soft delete by the platform; neither is a client operation.
revoke insert, delete on organizations from anon, authenticated;
-- status is platform-controlled: a suspended tenant must not reactivate
-- itself. Column grants are the only way to express that under RLS.
revoke update on organizations from anon, authenticated;
grant update (
  name, slug, logo_path, cover_path, about, website,
  industry, city, brand_color, listed_publicly, retention_months
) on organizations to authenticated;

-- ---------- memberships ----------
create policy memberships_member_select on memberships
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy memberships_platform_select on memberships
  for select to authenticated
  using ((select public.is_platform_admin()));

-- Admins manage the team, but only an owner may create or alter another
-- owner — otherwise an admin could promote themselves past their ceiling.
create policy memberships_manage_insert on memberships
  for insert to authenticated
  with check (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  );

create policy memberships_manage_update on memberships
  for update to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  )
  with check (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  );

create policy memberships_manage_delete on memberships
  for delete to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  );

revoke all on memberships from anon;

-- ---------- platform_admins / impersonation_sessions ----------
create policy platform_admins_self on platform_admins
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

create policy impersonation_platform_all on impersonation_sessions
  for all to authenticated
  using ((select public.is_platform_admin()))
  with check ((select public.is_platform_admin()));

revoke all on platform_admins from anon;
revoke all on impersonation_sessions from anon;

-- ============================================================
-- RLS — tenant tables, rewritten around current_org_ids()
--
-- current_org_ids() is wrapped in a subquery in every policy so Postgres
-- evaluates it once per statement rather than once per row.
-- ============================================================

-- ---------- profiles: identity, visible to self and co-members ----------
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_co_members on profiles
  for select to authenticated
  using (
    exists (
      select 1 from memberships m
      where m.user_id = profiles.id
        and m.org_id in (select unnest(public.current_org_ids()))
    )
  );

create policy profiles_platform_select on profiles
  for select to authenticated
  using ((select public.is_platform_admin()));

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Rows are created by signup / invitation acceptance (service role).
revoke insert, delete on profiles from anon, authenticated;
revoke update on profiles from anon, authenticated;
grant update (full_name) on profiles to authenticated;

-- ---------- jobs ----------
create policy jobs_public_select on jobs
  for select to anon, authenticated
  using (
    status = 'published'
    and deleted_at is null
    and public.org_is_public(org_id)
  );

create policy jobs_member_select on jobs
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy jobs_platform_select on jobs
  for select to authenticated
  using ((select public.is_platform_admin()));

create policy jobs_member_insert on jobs
  for insert to authenticated
  with check (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  );

create policy jobs_member_update on jobs
  for update to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  )
  with check (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  );

-- Soft delete only (D9); hard deletes belong to the retention job.
revoke delete on jobs from anon, authenticated;

-- ---------- applications ----------
-- D15: anon has NO insert. The public form posts to submit-application,
-- which validates the job, derives org_id from it and writes with the
-- service role. This closes storage-flooding and cross-org filing at once.
create policy applications_member_select on applications
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy applications_platform_select on applications
  for select to authenticated
  using ((select public.is_platform_admin()));

-- The column grant from 0005 (interview_at, interview_qa) still applies;
-- status remains RPC-only per 0003.
create policy applications_member_update on applications
  for update to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  )
  with check (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  );

revoke insert, delete on applications from anon, authenticated;

-- ---------- ai_evaluations ----------
create policy ai_evaluations_member_select on ai_evaluations
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy ai_evaluations_platform_select on ai_evaluations
  for select to authenticated
  using ((select public.is_platform_admin()));

-- Only interview_notes is writable (0002 column grant); the AI original is
-- immutable (§10.6).
create policy ai_evaluations_member_update on ai_evaluations
  for update to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  )
  with check (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  );

revoke insert, delete on ai_evaluations from anon, authenticated;

-- ---------- status_history ----------
create policy status_history_member_select on status_history
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy status_history_platform_select on status_history
  for select to authenticated
  using ((select public.is_platform_admin()));

create policy status_history_member_insert on status_history
  for insert to authenticated
  with check (
    public.is_org_member(org_id, array['owner','admin','hr']::member_role[])
  );

revoke update, delete on status_history from anon, authenticated;
