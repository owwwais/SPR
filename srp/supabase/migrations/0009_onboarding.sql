-- 0009_onboarding.sql — S2: self-serve signup and team invitations.
--
-- Two privileged operations that a tenant must be able to perform without a
-- service-role key in the browser:
--
--   1. create_organization()  — a brand-new user turns themselves into the
--      owner of a brand-new organization. `organizations` has no INSERT
--      policy for `authenticated` on purpose (0006), so this is the only
--      door, and it is narrow: one org per call, caller becomes owner, no
--      way to name an existing org or a different user.
--
--   2. accept_invitation()    — turns a signed invitation into a membership.
--      `memberships` INSERT requires being an owner/admin of the target org,
--      which an invitee is not yet; the RPC bridges that gap after checking
--      the token, the expiry, and that the email actually matches.
--
-- Both are `security definer` and both validate everything themselves —
-- treat their bodies as the authorization boundary.

create type invite_status as enum ('pending','accepted','revoked','expired');

create table invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'hr',
  -- Only the hash is stored; the raw token exists once, in the email.
  token_hash text not null unique,
  status invite_status not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index on invitations(org_id) where status = 'pending';
create unique index invitations_one_pending_per_email
  on invitations(org_id, lower(email)) where status = 'pending';

alter table invitations enable row level security;

-- Members see their org's invitations; owners and admins manage them.
-- An invitee is NOT a member yet, so they never read this table directly —
-- accept_invitation() looks the row up on their behalf.
create policy invitations_member_select on invitations
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy invitations_admin_insert on invitations
  for insert to authenticated
  with check (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  );

create policy invitations_admin_update on invitations
  for update to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[]))
  with check (public.is_org_member(org_id, array['owner','admin']::member_role[]));

create policy invitations_platform_select on invitations
  for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on invitations from anon;
grant select, insert, update on invitations to authenticated;
-- Revoking rather than soft-deleting keeps the audit trail.
revoke delete on invitations from authenticated;

-- ============================================================
-- create_organization
-- ============================================================

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_full_name text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  -- One organization per signup. Someone who already belongs somewhere is
  -- either invited to another org or has an owner create it for them; this
  -- keeps a single account from minting organizations in a loop.
  if exists (select 1 from memberships where user_id = v_user) then
    raise exception 'already a member of an organization'
      using errcode = '23505';
  end if;

  if length(btrim(p_name)) < 2 then
    raise exception 'organization name too short' using errcode = '22023';
  end if;
  if length(btrim(p_full_name)) < 2 then
    raise exception 'full name too short' using errcode = '22023';
  end if;

  -- The slug CHECK constraints on organizations (format + reserved words)
  -- are the authority; this just turns their violation into a clean code.
  begin
    insert into organizations (slug, name, status, created_by)
    values (lower(btrim(p_slug)), btrim(p_name), 'trial', v_user)
    returning id into v_org;
  exception
    when unique_violation then
      raise exception 'slug taken' using errcode = '23505';
    when check_violation then
      raise exception 'invalid slug' using errcode = '23514';
  end;

  insert into profiles (id, full_name)
  values (v_user, btrim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name;

  insert into memberships (org_id, user_id, role)
  values (v_org, v_user, 'owner');

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text, text)
  from public, anon;
grant execute on function public.create_organization(text, text, text)
  to authenticated;

-- ============================================================
-- accept_invitation
-- ============================================================

-- Returns the org the caller just joined. Refuses on anything suspicious
-- rather than reporting why in detail — an invitation token is a bearer
-- credential and this endpoint is reachable by any signed-in user.
create or replace function public.accept_invitation(
  p_token text,
  p_full_name text default null
)
returns uuid
language plpgsql
security definer
-- `extensions` is on the path because digest() lives there on Supabase (the
-- local harness puts pgcrypto in public, which this also covers).
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invite invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select email into v_email from auth.users where id = v_user;

  select * into v_invite
  from invitations
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or v_invite.status <> 'pending' then
    raise exception 'invitation not valid' using errcode = '42501';
  end if;

  if v_invite.expires_at <= now() then
    update invitations set status = 'expired' where id = v_invite.id;
    raise exception 'invitation expired' using errcode = '42501';
  end if;

  -- The invitation is addressed to a person, not to whoever holds the link.
  if lower(v_invite.email) <> lower(coalesce(v_email, '')) then
    raise exception 'invitation not valid' using errcode = '42501';
  end if;

  insert into profiles (id, full_name)
  values (v_user, coalesce(nullif(btrim(p_full_name), ''), split_part(v_email, '@', 1)))
  on conflict (id) do update
    set full_name = case
      when nullif(btrim(p_full_name), '') is not null then btrim(p_full_name)
      else profiles.full_name
    end;

  insert into memberships (org_id, user_id, role)
  values (v_invite.org_id, v_user, v_invite.role)
  on conflict (org_id, user_id) do nothing;

  update invitations
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id;

  return v_invite.org_id;
end;
$$;

revoke execute on function public.accept_invitation(text, text)
  from public, anon;
grant execute on function public.accept_invitation(text, text) to authenticated;

-- ============================================================
-- slug availability
--
-- Lets the signup form say "taken" before submitting. Deliberately returns
-- only a boolean: an unauthenticated caller learns whether a name is free,
-- which is already public information (the careers page is public), and
-- nothing else.
-- ============================================================

create or replace function public.slug_available(p_slug text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from organizations where slug = lower(btrim(p_slug))
  )
$$;

revoke execute on function public.slug_available(text) from public;
grant execute on function public.slug_available(text) to anon, authenticated;
