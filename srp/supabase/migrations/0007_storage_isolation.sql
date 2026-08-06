-- 0007_storage_isolation.sql — S1: per-tenant CV isolation (D8, D11, D15).
--
-- v1 stored CVs flat as `cvs/{application_id}.{ext}` and gated reads with
-- `bucket_id = 'cvs' and is_staff()`. With more than one customer that policy
-- hands every CV to every staff member of every company. 0006 dropped it;
-- this migration installs the replacement.
--
-- New convention:  cvs/{org_id}/{application_id}.{ext}
--
-- DEPLOY ORDER (the files must move while nothing can read them):
--   1. apply 0006_multitenancy.sql        — org_id exists, old policies gone
--   2. run  supabase/scripts/migrate-cv-paths.ts   — relocates the objects
--                                            and rewrites applications.cv_path
--   3. apply 0007_storage_isolation.sql   — this file
-- Steps 2 and 3 run with the service role, which bypasses RLS, so the script
-- works regardless of which policies are installed at the time.

-- ============================================================
-- Safe folder → org_id extraction
--
-- A bare `((storage.foldername(name))[1])::uuid` raises 22P02 on any object
-- that is not in the new layout (a stray upload, a half-finished migration),
-- and an exception inside a policy fails the whole query rather than hiding
-- the row. Returning null instead means such an object simply matches
-- nothing.
-- ============================================================

create or replace function public.storage_org_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  v_folder text;
begin
  v_folder := (storage.foldername(p_name))[1];
  if v_folder is null then
    return null;
  end if;
  return v_folder::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.storage_org_id(text) from public;
grant execute on function public.storage_org_id(text) to anon, authenticated;

-- ============================================================
-- Membership-only org list
--
-- Deliberately NOT current_org_ids(): that one also honours impersonation
-- sessions, and a platform admin supporting a tenant has no business reading
-- applicants' personal data (CLAUDE.md decision Q6 — conservative default).
-- To allow it later, swap this call for current_org_ids() and nothing else
-- changes.
-- ============================================================

create or replace function public.current_membership_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(org_id), '{}'::uuid[])
  from memberships
  where user_id = auth.uid()
$$;

revoke execute on function public.current_membership_org_ids() from public;
grant execute on function public.current_membership_org_ids() to anon, authenticated;

-- ============================================================
-- Policies
--
-- Read only, scoped to the caller's own organization folder. There is no
-- insert/update/delete policy for any client role at all:
--   * applicants upload through the submit-application Edge Function (D15)
--   * staff never write CVs
--   * the retention job deletes them with the service role (D8/D9)
-- ============================================================

create policy cvs_member_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'cvs'
    and public.storage_org_id(name)
        in (select unnest(public.current_membership_org_ids()))
  );

-- Belt and braces: even if a future migration adds a permissive policy by
-- accident, anon holds no write privilege on the objects table.
revoke insert, update, delete on storage.objects from anon;
