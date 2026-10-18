-- 0020_seeker_accounts.sql — seeker accounts (D26) and applying with a stored
-- CV (D27). Milestone P1, docs/PLATFORM-V3-PLAN.md §2.
--
-- One auth.users identity, two possible "hats", each proven by a row and
-- never by user_metadata: a memberships row is the company workspace, a
-- talent.profiles row carrying the user's id is the seeker portal.
--
-- THE RULE FROM 0017 STILL HOLDS: nothing joins public.* to talent.*. The two
-- products cross only through the auth user id and the public.talent_*
-- functions below. applications.applicant_user_id points at auth.users, not
-- at talent.profiles, so deleting a seeker profile never touches a company's
-- application and company retention never touches a seeker profile.
--
-- The talent schema is reachable through the API (813c547), so the tables
-- here grant authenticated nothing at all: every read and write a seeker
-- makes goes through a security definer function that resolves the caller
-- from auth.uid() and never takes a user id from the client.

-- ============================================================
-- talent.profiles — the seeker's account link and onboarding state
-- ============================================================

-- The account that owns this profile. NULL for a legacy (accountless) profile
-- until its owner links it, with explicit consent (§2.9).
alter table talent.profiles
  add column user_id uuid unique references auth.users(id) on delete cascade;

-- Contact-step answers: preferred work types and willingness to relocate.
-- Read back only through talent.normalised_preferences(), so an unexpected key
-- stored by an older writer is never surfaced.
alter table talent.profiles
  add column preferences jsonb not null default '{}'::jsonb;

-- Where the CV-first onboarding stands (plan §2.3). A routing hint for the
-- app, never an authorization input.
alter table talent.profiles
  add column onboarding_step text not null default 'cv'
    check (onboarding_step in ('cv', 'contact', 'review', 'consents', 'done'));

-- Legacy rows predate onboarding: they were reviewed and consented through
-- the token flow, so there is no step left for them to take.
update talent.profiles set onboarding_step = 'done' where user_id is null;

-- Email uniqueness becomes legacy-only. An account profile's identity is its
-- user_id; its email is a copy of the verified auth address, and it may equal
-- the email of an unlinked legacy profile — the seeker decides whether to link
-- that one (talent_link_legacy_profile) or start afresh.
do $$
declare
  v_constraint text;
begin
  select c.conname into v_constraint
  from pg_constraint c
  where c.conrelid = 'talent.profiles'::regclass
    and c.contype = 'u'
    and c.conkey = array[(
      select a.attnum from pg_attribute a
      where a.attrelid = 'talent.profiles'::regclass and a.attname = 'email'
    )]::smallint[];

  if v_constraint is not null then
    execute format('alter table talent.profiles drop constraint %I', v_constraint);
  end if;
end $$;

create unique index profiles_legacy_email_key
  on talent.profiles (email) where user_id is null;

-- The legacy-link lookup compares addresses case-insensitively.
create index profiles_legacy_email_lower_idx
  on talent.profiles (lower(email)) where user_id is null;

-- ============================================================
-- talent.cv_versions — every CV a seeker uploaded, newest = current
--
-- Each application copies one SPECIFIC version into the company's own bucket
-- (D27), so a version is a stable thing to point at. The app keeps at most
-- three (pruned by talent-upload). Service role only: the seeker sees their
-- versions through talent_my_profile(), without paths or hashes.
-- ============================================================
create table talent.cv_versions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references talent.profiles(id) on delete cascade,
  -- Object name in the private talent-cvs bucket.
  path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime text not null check (mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  -- NULL only for a linked legacy file, whose size was never recorded.
  size_bytes int check (size_bytes is null or (size_bytes > 0 and size_bytes <= 5242880)),
  analysis_status public.analysis_status not null default 'pending',
  analysis_error text,
  analyzed_at timestamptz,
  created_at timestamptz not null default now()
);

create index cv_versions_profile_newest_idx
  on talent.cv_versions (profile_id, created_at desc);

alter table talent.cv_versions enable row level security;
-- No policies, deliberately: nothing but the service role and the security
-- definer functions below reads or writes this table.

-- ============================================================
-- public.applications — who applied with their account (D27)
-- ============================================================

-- Set only by submit-application (service role) for a seeker applying with
-- their stored profile. Nulled when they delete their seeker data or their
-- account; via_account stays true so the company's badge does not change
-- after the fact.
alter table applications
  add column applicant_user_id uuid references auth.users(id) on delete set null;

alter table applications
  add column via_account boolean not null default false;

alter table applications
  add constraint applications_applicant_via_account
    check (applicant_user_id is null or via_account);

create index applications_applicant_user_idx
  on applications (applicant_user_id) where applicant_user_id is not null;

-- Defense in depth. Staff hold column grants on this table (interview_at,
-- interview_qa from 0005) and an update policy for their own org; neither
-- covers these columns today, but a future grant written carelessly would
-- let staff attach an application to someone's account — and with it into
-- that person's my_applications(). Only the service role (the Edge
-- Functions) and functions owned by postgres may change them.
--
-- SECURITY INVOKER on purpose: a security definer trigger would always see
-- its owner as current_user and so guard nothing. The ON DELETE SET NULL from
-- auth.users runs as the table owner, which is postgres, and passes.
create or replace function public.applications_guard_applicant()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'applicant_user_id and via_account are set by the platform only'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function public.applications_guard_applicant() from public, anon, authenticated;

create trigger applications_guard_applicant
before update on applications
for each row
when (
  old.applicant_user_id is distinct from new.applicant_user_id
  or old.via_account is distinct from new.via_account
)
execute function public.applications_guard_applicant();

-- ============================================================
-- Grants
--
-- The talent schema stays reachable for clients ONLY through the
-- public.talent_* functions. Explicit, because Supabase stops auto-exposing
-- new tables on 2026-10-30 and because a custom schema never received the
-- default privileges public has — talent-upload and talent-analyze write
-- these tables as the service role, so it gets an explicit grant too.
-- ============================================================
revoke all on talent.profiles, talent.cv_versions, talent.profile_skills,
  talent.unmapped_skills, talent.upload_attempts
  from anon, authenticated;

grant all on talent.cv_versions to service_role;
grant all on talent.profiles, talent.profile_skills to service_role;
grant select on talent.skills to service_role;

-- ============================================================
-- Internal helpers (talent schema; no client may call them)
-- ============================================================

-- A JSON value if it is an array, else an empty array. The extraction is
-- model output stored as jsonb; the seeker portal's types promise arrays.
create or replace function talent.json_array(p_value jsonb)
returns jsonb
language sql
immutable
set search_path = talent, public
as $$
  select case when jsonb_typeof(p_value) = 'array' then p_value else '[]'::jsonb end;
$$;

-- The one shape preferences are read in: {work_types: job_type[], relocate:
-- boolean|null}. Unknown keys, unknown work types and duplicates are dropped;
-- work types come back in the enum's own order so the same answers always
-- read the same.
create or replace function talent.normalised_preferences(p_preferences jsonb)
returns jsonb
language sql
stable
set search_path = talent, public
as $$
  select jsonb_build_object(
    'work_types', coalesce((
      select jsonb_agg(t.value order by t.position)
      from (
        select distinct w.value,
               array_position(enum_range(null::public.job_type)::text[], w.value) as position
        from jsonb_array_elements_text(talent.json_array(p_preferences -> 'work_types')) as w(value)
        where w.value = any (enum_range(null::public.job_type)::text[])
      ) t
    ), '[]'::jsonb),
    'relocate', case
      when jsonb_typeof(p_preferences -> 'relocate') = 'boolean' then p_preferences -> 'relocate'
      else 'null'::jsonb
    end
  );
$$;

-- Trims surrounding whitespace (all of it, as the JS forms do) and turns an
-- empty answer into NULL.
create or replace function talent.clean_text(p_value text)
returns text
language sql
immutable
set search_path = talent, public
as $$
  select nullif(regexp_replace(p_value, '^\s+|\s+$', '', 'g'), '');
$$;

revoke execute on function talent.json_array(jsonb) from public, anon, authenticated;
revoke execute on function talent.normalised_preferences(jsonb) from public, anon, authenticated;
revoke execute on function talent.clean_text(text) from public, anon, authenticated;

-- ============================================================
-- my_hats — which hats the caller wears. A routing hint only:
-- requireMembership() and requireSeeker() decide access, and RLS decides
-- what any query returns. Two separate lookups keyed by auth.uid(); the
-- schemas are not joined.
-- ============================================================
create or replace function public.my_hats()
returns jsonb
language sql
stable
security definer
set search_path = public, talent
as $$
  select jsonb_build_object(
    'company', exists (
      select 1
      from memberships m
      join organizations o on o.id = m.org_id
      where m.user_id = auth.uid()
        and o.deleted_at is null
    ),
    'seeker', exists (
      select 1 from talent.profiles p where p.user_id = auth.uid()
    ),
    'seeker_step', (
      select p.onboarding_step from talent.profiles p where p.user_id = auth.uid()
    )
  );
$$;

revoke execute on function public.my_hats() from public, anon;
grant execute on function public.my_hats() to authenticated;

-- ============================================================
-- talent_my_profile — the caller's own profile, or NULL.
--
-- The column list IS the boundary, as with public_profile(): the stored CV
-- path and hash, the verify token and the version paths are absent by
-- construction. Wider than the public page in one way only — hidden skills
-- are included (flagged by hidden_skills) so the owner can manage them.
-- The shape is SeekerProfile in srp/lib/seeker.ts; change both together.
-- ============================================================
create or replace function public.talent_my_profile()
returns jsonb
language sql
stable
security definer
set search_path = public, talent
as $$
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'status', p.status,
    'onboarding_step', p.onboarding_step,
    'analysis_status', p.analysis_status,
    'analysis_error', p.analysis_error,
    'full_name', p.full_name,
    'headline', p.headline,
    'city', p.city,
    'years_experience', p.years_experience,
    'about', p.about,
    'phone', p.phone,
    'preferences', talent.normalised_preferences(p.preferences),
    'strengths', talent.json_array(p.strengths),
    'focus_areas', talent.json_array(p.focus_areas),
    'hidden_skills', to_jsonb(p.hidden_skills),
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label_ar) order by s.label_ar, s.id)
      from talent.profile_skills ps
      join talent.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), '[]'::jsonb),
    'experiences', talent.json_array(p.extracted -> 'experiences'),
    'education', talent.json_array(p.extracted -> 'education'),
    'languages', talent.json_array(p.extracted -> 'languages'),
    'consent_public', p.consent_public_at is not null,
    'consent_offers', p.consent_offers_at is not null,
    'noindex', p.noindex,
    'public_token', p.public_token,
    'cv_versions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'mime', v.mime,
               'created_at', v.created_at,
               'analysis_status', v.analysis_status,
               'is_current', v.rn = 1
             ) order by v.rn)
      from (
        select cv.*, row_number() over (order by cv.created_at desc, cv.id desc) as rn
        from talent.cv_versions cv
        where cv.profile_id = p.id
      ) v
    ), '[]'::jsonb)
  )
  from talent.profiles p
  where p.user_id = auth.uid();
$$;

revoke execute on function public.talent_my_profile() from public, anon;
grant execute on function public.talent_my_profile() to authenticated;

comment on function public.talent_my_profile() is
  'The caller''s own seeker profile (auth.uid()), or NULL. Never returns the CV path, hashes or tokens other than the public one.';

-- ============================================================
-- talent_save_my_contact — onboarding step ② and the profile page.
--
-- Validation mirrors the apply form (lib/validations/application.ts): a
-- profile that saves here must also pass submit-application's checks, or the
-- seeker would finish onboarding and then be refused at the first apply.
-- ============================================================
create or replace function public.talent_save_my_contact(
  p_full_name text,
  p_phone text,
  p_city text,
  p_preferences jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
  v_name text := talent.clean_text(p_full_name);
  v_phone text := talent.clean_text(p_phone);
  v_city text := talent.clean_text(p_city);
  v_prefs jsonb := coalesce(p_preferences, '{}'::jsonb);
  v_types text[] := enum_range(null::public.job_type)::text[];
begin
  select id into v_id from talent.profiles where user_id = auth.uid() for update;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_name is null or length(v_name) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'full_name');
  end if;

  if v_phone is null or v_phone !~ '^\+?[0-9\s()-]{7,20}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'phone');
  end if;

  if v_city is not null and length(v_city) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'city');
  end if;

  -- Refuse rather than silently drop a malformed answer: a work type the
  -- form never offers means the caller is not the form.
  if jsonb_typeof(v_prefs) <> 'object'
     or (jsonb_typeof(v_prefs -> 'work_types') not in ('array', 'null'))
     or (jsonb_typeof(v_prefs -> 'work_types') = 'array' and exists (
           select 1 from jsonb_array_elements(v_prefs -> 'work_types') e
           where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (v_types))
         ))
     or (jsonb_typeof(v_prefs -> 'relocate') not in ('boolean', 'null'))
  then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'preferences');
  end if;

  update talent.profiles
  set full_name = v_name,
      phone = v_phone,
      city = v_city,
      preferences = talent.normalised_preferences(v_prefs),
      onboarding_step = case when onboarding_step = 'contact' then 'review' else onboarding_step end,
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_save_my_contact(text, text, text, jsonb) from public, anon;
grant execute on function public.talent_save_my_contact(text, text, text, jsonb) to authenticated;

-- ============================================================
-- talent_save_my_review — onboarding step ③ and the profile page.
--
-- Facts are the person's to correct; the analysis may only be trimmed
-- (TALENT-PLATFORM-DESIGN §2): hidden_skills is filtered to skills the
-- profile actually has, so nothing can be added through it.
-- ============================================================
create or replace function public.talent_save_my_review(
  p_full_name text,
  p_headline text,
  p_city text,
  p_years numeric,
  p_about text,
  p_hidden_skills text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
  v_status public.analysis_status;
  v_ready boolean;
  v_name text := talent.clean_text(p_full_name);
  v_headline text := talent.clean_text(p_headline);
  v_city text := talent.clean_text(p_city);
  v_about text := talent.clean_text(p_about);
begin
  select id, analysis_status into v_id, v_status
  from talent.profiles where user_id = auth.uid() for update;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- There is nothing to review until the extraction exists.
  -- Ready once ANY analysis has completed: while a newly uploaded CV is
  -- being read, the profile still carries the previous extraction, and the
  -- person must not be locked out of their own facts for those seconds.
  v_ready := v_status = 'done' or exists (
    select 1 from talent.cv_versions
    where profile_id = v_id and analysis_status = 'done'
  );
  if not v_ready then
    return jsonb_build_object('ok', false, 'error', 'analysis_not_ready');
  end if;

  if v_name is null or length(v_name) not between 2 and 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'full_name');
  end if;
  if v_headline is not null and length(v_headline) > 160 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'headline');
  end if;
  if v_city is not null and length(v_city) > 120 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'city');
  end if;
  if p_years is not null and (p_years < 0 or p_years > 60) then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'years_experience');
  end if;
  if v_about is not null and length(v_about) > 300 then
    return jsonb_build_object('ok', false, 'error', 'invalid', 'field', 'about');
  end if;

  update talent.profiles
  set full_name = v_name,
      headline = v_headline,
      city = v_city,
      years_experience = p_years,
      about = v_about,
      hidden_skills = array(
        select distinct ps.skill_id
        from talent.profile_skills ps
        where ps.profile_id = v_id
          and ps.skill_id = any (coalesce(p_hidden_skills, '{}'::text[]))
        order by ps.skill_id
      ),
      onboarding_step = case when onboarding_step = 'review' then 'consents' else onboarding_step end,
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_save_my_review(text, text, text, numeric, text, text[]) from public, anon;
grant execute on function public.talent_save_my_review(text, text, text, numeric, text, text[]) to authenticated;

-- ============================================================
-- talent_set_my_consents — onboarding step ④ and the settings page.
--
-- Two consents, separately, neither implying the other (PDPL: one consent
-- per purpose). A consent keeps the moment it was first given while it
-- stands; withdrawing clears it, and giving it again starts a new one.
-- ============================================================
create or replace function public.talent_set_my_consents(
  p_consent_public boolean,
  p_consent_offers boolean,
  p_noindex boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
  v_status public.analysis_status;
  v_ready boolean;
  v_public boolean := coalesce(p_consent_public, false);
  v_offers boolean := coalesce(p_consent_offers, false);
begin
  select id, analysis_status into v_id, v_status
  from talent.profiles where user_id = auth.uid() for update;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- A public page shows the extraction; without one there is nothing that
  -- may be published. Any completed analysis counts: a re-upload in progress
  -- must not block someone who is already published from changing the
  -- offers consent or hiding their page.
  v_ready := v_status = 'done' or exists (
    select 1 from talent.cv_versions
    where profile_id = v_id and analysis_status = 'done'
  );
  if v_public and not v_ready then
    return jsonb_build_object('ok', false, 'error', 'analysis_not_ready');
  end if;

  update talent.profiles
  set consent_public_at = case when v_public then coalesce(consent_public_at, now()) end,
      consent_offers_at = case when v_offers then coalesce(consent_offers_at, now()) end,
      status = case
        when v_public then 'published'
        when status = 'published' then 'hidden'
        else status
      end::talent.profile_status,
      noindex = coalesce(p_noindex, false),
      onboarding_step = case when onboarding_step = 'consents' then 'done' else onboarding_step end,
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_set_my_consents(boolean, boolean, boolean) from public, anon;
grant execute on function public.talent_set_my_consents(boolean, boolean, boolean) to authenticated;

-- ============================================================
-- Legacy profiles (§2.9)
--
-- A profile created through the accountless flow can be claimed by the
-- account whose CONFIRMED auth email equals the profile's VERIFIED email —
-- both proofs, so neither an unconfirmed signup nor an unverified upload can
-- claim someone else's CV. Linking is the owner's explicit choice: the app
-- calls talent_link_legacy_profile() only from the button that asks, and
-- never on its own.
-- ============================================================
create or replace function public.talent_legacy_profile_available()
returns boolean
language sql
stable
security definer
set search_path = public, talent
as $$
  select coalesce((
    select u.email_confirmed_at is not null
       and not exists (select 1 from talent.profiles mine where mine.user_id = u.id)
       and exists (
         select 1 from talent.profiles p
         where p.user_id is null
           and p.email_verified_at is not null
           and lower(p.email) = lower(u.email)
       )
    from auth.users u
    where u.id = auth.uid()
  ), false);
$$;

revoke execute on function public.talent_legacy_profile_available() from public, anon;
grant execute on function public.talent_legacy_profile_available() to authenticated;

create or replace function public.talent_link_legacy_profile()
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_profile talent.profiles%rowtype;
begin
  select email, email_confirmed_at into v_email, v_confirmed
  from auth.users where id = v_uid;

  if v_uid is null or v_email is null or v_confirmed is null
     or exists (select 1 from talent.profiles where user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;

  select * into v_profile
  from talent.profiles p
  where p.user_id is null
    and p.email_verified_at is not null
    and lower(p.email) = lower(v_email)
  order by p.updated_at desc, p.id
  limit 1
  for update;

  if v_profile.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_available');
  end if;

  -- The account owns the profile from here. The old verify link is retired
  -- so it cannot be replayed against an account-owned profile, and the
  -- token pages stop reaching it (they serve unlinked profiles only).
  -- Legacy rows never collected a phone, which applying needs, so they
  -- resume at the contact step.
  update talent.profiles
  set user_id = v_uid,
      onboarding_step = case when phone is null then 'contact' else 'done' end,
      verify_token = null,
      verify_sent_at = null,
      updated_at = now()
  where id = v_profile.id;

  -- Its stored CV becomes the account's first version, so the seeker can
  -- apply with it without uploading again. A malformed legacy hash would
  -- fail the version's check; such a profile simply starts without one.
  if v_profile.cv_path is not null and v_profile.cv_sha256 ~ '^[0-9a-f]{64}$' then
    insert into talent.cv_versions (profile_id, path, sha256, mime, size_bytes, analysis_status)
    values (
      v_profile.id,
      v_profile.cv_path,
      v_profile.cv_sha256,
      case
        when lower(v_profile.cv_path) like '%.docx'
          then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        else 'application/pdf'
      end,
      null,
      v_profile.analysis_status
    )
    on conflict (path) do nothing;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.talent_link_legacy_profile() from public, anon;
grant execute on function public.talent_link_legacy_profile() to authenticated;

-- ============================================================
-- The legacy token functions serve unlinked profiles only.
--
-- 0017 authorises these by public_token alone, and the same token is the
-- public page's URL. Account profiles carry a public_token and a verified
-- email too, so without this guard anyone holding a seeker's public link
-- could rewrite, hide or delete an account-owned profile. Account owners
-- manage their profile through the talent_*_my_* functions above. Bodies
-- are 0017/0018's with one added condition: user_id is null.
-- ============================================================
create or replace function public.talent_publish_profile(
  p_token text,
  p_full_name text,
  p_headline text,
  p_city text,
  p_years numeric,
  p_about text,
  p_hidden_skills text[],
  p_consent_public boolean,
  p_consent_offers boolean,
  p_noindex boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
begin
  select id into v_id from talent.profiles
  where public_token = p_token and email_verified_at is not null and user_id is null;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if not p_consent_public then
    return jsonb_build_object('ok', false, 'error', 'consent_required');
  end if;

  update talent.profiles
  set full_name = p_full_name,
      headline = p_headline,
      city = p_city,
      years_experience = p_years,
      about = p_about,
      hidden_skills = coalesce(p_hidden_skills, '{}'),
      consent_public_at = coalesce(consent_public_at, now()),
      consent_offers_at = case
        when p_consent_offers then coalesce(consent_offers_at, now())
        else null
      end,
      noindex = p_noindex,
      status = 'published',
      updated_at = now()
  where id = v_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.talent_set_visibility(
  p_token text,
  p_visible boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
begin
  update talent.profiles
  set status = (case when p_visible then 'published' else 'hidden' end)::talent.profile_status,
      updated_at = now()
  where public_token = p_token and email_verified_at is not null and user_id is null;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.talent_delete_profile(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_cv_path text;
begin
  delete from talent.profiles
  where public_token = p_token and user_id is null
  returning cv_path into v_cv_path;

  if v_cv_path is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  return jsonb_build_object('ok', true, 'cv_path', v_cv_path);
end;
$$;

create or replace function public.talent_review_profile(p_token text)
returns jsonb
language sql
security definer
stable
set search_path = public, talent
as $$
  select jsonb_build_object(
    'status', p.status,
    'analysis_status', p.analysis_status,
    'analysis_error', p.analysis_error,
    'full_name', p.full_name,
    'headline', p.headline,
    'city', p.city,
    'years_experience', p.years_experience,
    'about', p.about,
    'strengths', p.strengths,
    'focus_areas', p.focus_areas,
    'hidden_skills', p.hidden_skills,
    'noindex', p.noindex,
    'consent_public', p.consent_public_at is not null,
    'consent_offers', p.consent_offers_at is not null,
    'skills', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'label', s.label_ar))
      from talent.profile_skills ps
      join talent.skills s on s.id = ps.skill_id
      where ps.profile_id = p.id
    ), '[]'::jsonb),
    'experiences', coalesce(p.extracted -> 'experiences', '[]'::jsonb),
    'education', coalesce(p.extracted -> 'education', '[]'::jsonb),
    'languages', coalesce(p.extracted -> 'languages', '[]'::jsonb)
  )
  from talent.profiles p
  where p.public_token = p_token
    and p.email_verified_at is not null
    and p.user_id is null;
$$;

-- create or replace keeps existing grants; restated so this file alone says
-- who may call them.
revoke execute on function public.talent_publish_profile(
  text, text, text, text, numeric, text, text[], boolean, boolean, boolean
) from public;
grant execute on function public.talent_publish_profile(
  text, text, text, text, numeric, text, text[], boolean, boolean, boolean
) to anon, authenticated;
revoke execute on function public.talent_set_visibility(text, boolean) from public;
grant execute on function public.talent_set_visibility(text, boolean) to anon, authenticated;
revoke execute on function public.talent_delete_profile(text) from public;
grant execute on function public.talent_delete_profile(text) to anon, authenticated;
revoke execute on function public.talent_review_profile(text) from public;
grant execute on function public.talent_review_profile(text) to anon, authenticated;

-- ============================================================
-- my_applications — the seeker's own applications (FR-08 parity).
--
-- What the public tracking page shows by reference code, keyed instead by
-- the account that applied: job, company, current status and the dates it
-- changed. NOTHING from ai_evaluations, no fit score, no notes, no
-- interview content — an applicant never sees how they were scored (D24).
-- A guest application with the same email is not returned: the email was
-- never proven to belong to this account at the time it was sent.
-- ============================================================
create or replace function public.my_applications()
returns table (
  id uuid,
  ref_code text,
  job_id uuid,
  job_title text,
  org_name text,
  org_slug text,
  status app_status,
  created_at timestamptz,
  history jsonb
)
language sql
stable
security definer
set search_path = public, talent
as $$
  select a.id,
         a.ref_code,
         a.job_id,
         j.title,
         o.name,
         o.slug,
         a.status,
         a.created_at,
         coalesce((
           select jsonb_agg(
                    jsonb_build_object('to_status', h.to_status, 'created_at', h.created_at)
                    order by h.created_at, h.id)
           from status_history h
           where h.application_id = a.id
         ), '[]'::jsonb)
  from applications a
  join jobs j on j.id = a.job_id
  join organizations o on o.id = a.org_id
  where a.applicant_user_id = auth.uid()
  order by a.created_at desc, a.id;
$$;

revoke execute on function public.my_applications() from public, anon;
grant execute on function public.my_applications() to authenticated;

-- ============================================================
-- talent_delete_seeker_data — immediate, total deletion of a seeker's data.
-- SERVICE ROLE ONLY: the seeker-account Edge Function resolves the user from
-- their own token and passes that id; no client can name a user here.
--
-- Deletes the profile (versions and skills cascade) and unlinks the user's
-- applications. The applications themselves stay: each is the company's own
-- copy, under the company's retention (D27, D8). via_account stays true, so
-- the company's view of how the application arrived does not change.
-- Returns the storage paths to remove from talent-cvs, which needs the
-- Storage API rather than SQL.
-- ============================================================
create or replace function public.talent_delete_seeker_data(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, talent
as $$
declare
  v_id uuid;
  v_cv_path text;
  v_paths text[];
begin
  update applications set applicant_user_id = null
  where applicant_user_id = p_user;

  select id, cv_path into v_id, v_cv_path
  from talent.profiles where user_id = p_user for update;

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'paths', '[]'::jsonb);
  end if;

  select coalesce(array_agg(distinct x.path order by x.path), '{}'::text[]) into v_paths
  from (
    select v.path from talent.cv_versions v where v.profile_id = v_id
    union
    select v_cv_path where v_cv_path is not null
  ) x;

  delete from talent.profiles where id = v_id;

  return jsonb_build_object('ok', true, 'paths', to_jsonb(v_paths));
end;
$$;

revoke execute on function public.talent_delete_seeker_data(uuid) from public, anon, authenticated;
grant execute on function public.talent_delete_seeker_data(uuid) to service_role;

-- ============================================================
-- Deleting an account must not trip over "who created this"
--
-- A member-less seeker can delete their account (seeker-account). If that
-- same person once created a job, an organization or an interview — staff
-- who later left the company — the old foreign keys, declared without an
-- ON DELETE rule, refused the deletion. Authorship is bookkeeping, not
-- evidence, so it is released.
--
-- status_history.changed_by is deliberately NOT changed: it is the record
-- that a human made each status decision (D24; the transparency report
-- reads it as decided_by_human). seeker-account keeps the auth account of
-- anyone who appears there instead of erasing that evidence.
-- ============================================================
alter table jobs drop constraint if exists jobs_created_by_fkey;
alter table jobs add constraint jobs_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;

alter table organizations drop constraint if exists organizations_created_by_fkey;
alter table organizations add constraint organizations_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete set null;

alter table interview_assignments drop constraint if exists interview_assignments_created_by_fkey;
alter table interview_assignments add constraint interview_assignments_created_by_fkey
  foreign key (created_by) references profiles(id) on delete set null;
