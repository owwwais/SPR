-- seeker_isolation.sql — P1 acceptance for 0020 (D26, D27, the isolation
-- invariant): a seeker reaches their own profile, CV versions and
-- applications only through the public.talent_* / my_* functions; nobody
-- reaches the talent tables directly; staff never see a talent profile;
-- the two hats never leak into each other.
--
-- Self-contained like interview_isolation.sql: builds its own fixture,
-- asserts on specific ids, rolls back.
--
--   psql "$DATABASE_URL" -f supabase/tests/seeker_isolation.sql

\set ON_ERROR_STOP on
\set QUIET on

begin;

create temp table t_results (id serial primary key, label text, pass boolean);
grant all on t_results to anon, authenticated, service_role;
grant all on sequence t_results_id_seq to anon, authenticated, service_role;

-- Function results captured in one statement and asserted in the next: a
-- subquery in the same SELECT would read the statement's starting snapshot
-- and miss the function's own writes.
create temp table t_out (k text primary key, v jsonb);
grant all on t_out to anon, authenticated, service_role;

create function pg_temp.chk(p_label text, p_pass boolean)
returns void language sql as $$
  insert into t_results (label, pass) values (p_label, coalesce(p_pass, false));
$$;

create function pg_temp.chk_denied(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (label, pass) values (p_label, false);
exception
  when insufficient_privilege or check_violation or unique_violation or raise_exception then
    insert into t_results (label, pass) values (p_label, true);
end $$;

create function pg_temp.chk_blind(p_label text, p_sql text)
returns void language plpgsql as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;
  insert into t_results (label, pass) values (p_label, v_count = 0);
exception when insufficient_privilege then
  insert into t_results (label, pass) values (p_label, true);
end $$;

-- Passes only when the applications_guard_applicant trigger itself refused
-- (not a missing column grant), so the defense-in-depth layer is tested on
-- its own.
create function pg_temp.chk_guard(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (label, pass) values (p_label, false);
exception when insufficient_privilege then
  insert into t_results (label, pass)
  values (p_label, sqlerrm like '%set by the platform only%');
end $$;

create function pg_temp.chk_rows(p_label text, p_sql text, p_expected bigint)
returns void language plpgsql as $$
declare
  v_rows bigint;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  insert into t_results (label, pass) values (p_label, v_rows = p_expected);
exception when others then
  insert into t_results (label, pass) values (p_label, false);
end $$;

create function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims to %L',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text
  );
end $$;

create function pg_temp.as_anon()
returns void language plpgsql as $$
begin
  execute 'set local role anon';
  execute $s$set local request.jwt.claims to ''$s$;
end $$;

create function pg_temp.as_service()
returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  execute $s$set local request.jwt.claims to '{"role":"service_role"}'$s$;
end $$;

-- Back to the test owner with no caller identity, so triggers that record
-- auth.uid() (status history) do not pick up a leftover seeker id.
create function pg_temp.as_owner()
returns void language plpgsql as $$
begin
  execute 'reset role';
  execute $s$set local request.jwt.claims to ''$s$;
end $$;

create function pg_temp.out(p_key text)
returns jsonb language sql as $$
  select v from t_out where k = p_key;
$$;

\o /dev/null

-- ============================================================
-- Fixture
--
--   5a…11  staff (owner of acme-s), no talent profile
--   5a…12  two hats: hr in acme-s, profile added mid-test
--   5a…13  owner of a soft-deleted org only
--   5c…a1  seeker A   profile PA: contact step, analysis pending, 2 versions
--   5c…b1  seeker B   profile PB: review step, analysis done
--   5c…c1  seeker C   profile PC: done; deleted as an auth user later
--   5c…d1  L          confirmed, matches the verified legacy profile PL
--   5c…e1  U          UNconfirmed, matches the verified legacy profile PU
--   5c…f1  D          confirmed, matches nothing
--   5c…f2  V          confirmed, matches the UNverified legacy profile PV
--   5c…f3  X          account profile sharing PU's email
-- ============================================================

select pg_temp.as_owner();

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','5a000000-0000-4000-8000-000000000011','authenticated','authenticated','staff@acme-s.test',     now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5a000000-0000-4000-8000-000000000012','authenticated','authenticated','two-hats@acme-s.test',  now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5a000000-0000-4000-8000-000000000013','authenticated','authenticated','gone@deleted-s.test',   now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000a1','authenticated','authenticated','seeker-a@s.test',       now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000b1','authenticated','authenticated','seeker-b@s.test',       now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000c1','authenticated','authenticated','seeker-c@s.test',       now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000d1','authenticated','authenticated','Legacy.Owner@S.test',   now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000e1','authenticated','authenticated','pending@s.test',        null,  now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000f1','authenticated','authenticated','someone@s.test',        now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000f2','authenticated','authenticated','unverified@s.test',     now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000f3','authenticated','authenticated','other-pending@s.test',  now(), now(), now());

insert into profiles (id, full_name) values
  ('5a000000-0000-4000-8000-000000000011','موظفة أكمي'),
  ('5a000000-0000-4000-8000-000000000012','موظف بقبعتين'),
  ('5a000000-0000-4000-8000-000000000013','مالك شركة محذوفة');

insert into organizations (id, slug, name, status) values
  ('5a000000-0000-4000-8000-000000000001','acme-s',    'أكمي',         'active'),
  ('5b000000-0000-4000-8000-000000000001','deleted-s', 'شركة محذوفة',  'active');

insert into memberships (org_id, user_id, role) values
  ('5a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000011','owner'),
  ('5b000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000013','owner');
insert into memberships (org_id, user_id, role) values
  ('5a000000-0000-4000-8000-000000000001','5a000000-0000-4000-8000-000000000012','hr');

update organizations set deleted_at = now() where id = '5b000000-0000-4000-8000-000000000001';

insert into jobs (id, org_id, title, type, description, requirements, status) values
  ('5a000000-0000-4000-8000-0000000000a1','5a000000-0000-4000-8000-000000000001','مطور واجهات','full_time','د','م','published'),
  ('5a000000-0000-4000-8000-0000000000a2','5a000000-0000-4000-8000-000000000001','محلل بيانات','full_time','د','م','published');

-- appA: seeker A applied with their account. guestA: the same email applied
-- as a guest to another job — never proven to be A's. appC: seeker C.
insert into applications (id, job_id, ref_code, full_name, email, phone, cv_path, cv_mime, applicant_user_id, via_account) values
  ('5a000000-0000-4000-8000-0000000000f1','5a000000-0000-4000-8000-0000000000a1','SEEK-A-001','الباحثة أ','seeker-a@s.test','+966500000101','x/a1.pdf','application/pdf','5c000000-0000-4000-8000-0000000000a1', true),
  ('5a000000-0000-4000-8000-0000000000f2','5a000000-0000-4000-8000-0000000000a2','SEEK-A-002','الباحثة أ','seeker-a@s.test','+966500000101','x/a2.pdf','application/pdf', null, false),
  ('5a000000-0000-4000-8000-0000000000f3','5a000000-0000-4000-8000-0000000000a1','SEEK-C-001','الباحث ج','seeker-c@s.test','+966500000103','x/c1.pdf','application/pdf','5c000000-0000-4000-8000-0000000000c1', true);

insert into ai_evaluations (application_id, model, prompt_version, extracted, fit_score, score_breakdown, justification, interview_questions) values
  ('5a000000-0000-4000-8000-0000000000f1','gemini-3.5-flash','1.0','{}', 77, '{}', '{}', '[]');

insert into talent.profiles (id, user_id, public_token, email, email_verified_at, status, onboarding_step,
                             analysis_status, cv_path, cv_sha256, preferences, hidden_skills, extracted) values
  ('5d000000-0000-4000-8000-0000000000a1','5c000000-0000-4000-8000-0000000000a1', md5('pa'), 'seeker-a@s.test', now(), 'draft', 'contact',
   'pending', '5d000000-0000-4000-8000-0000000000a1/v2.pdf', encode(sha256('a2'::bytea), 'hex'),
   '{"work_types":["remote","bogus","remote"],"relocate":true,"junk":1}', '{backend}', '{}'),
  ('5d000000-0000-4000-8000-0000000000b1','5c000000-0000-4000-8000-0000000000b1', md5('pb'), 'seeker-b@s.test', now(), 'draft', 'review',
   'done', '5d000000-0000-4000-8000-0000000000b1/v1.pdf', encode(sha256('b1'::bytea), 'hex'),
   '{}', '{}', '{"experiences":[{"title":"محلل","company":null,"start":null,"end":null,"summary":"ت"}],"education":[],"languages":["العربية"]}'),
  ('5d000000-0000-4000-8000-0000000000c1','5c000000-0000-4000-8000-0000000000c1', md5('pc'), 'seeker-c@s.test', now(), 'draft', 'done',
   'done', '5d000000-0000-4000-8000-0000000000c1/v1.pdf', encode(sha256('c1'::bytea), 'hex'),
   '{}', '{}', '{}'),
  -- X: an ACCOUNT profile with the same email as the unlinked legacy PU.
  ('5d000000-0000-4000-8000-0000000000f3','5c000000-0000-4000-8000-0000000000f3', md5('px'), 'pending@s.test', now(), 'draft', 'cv',
   'pending', null, null, '{}', '{}', '{}');

update talent.profiles set strengths = '["تحليل البيانات بلغة SQL"]', focus_areas = '["التقارير"]'
where id = '5d000000-0000-4000-8000-0000000000b1';

-- Legacy (accountless) profiles: user_id is null.
insert into talent.profiles (id, public_token, email, email_verified_at, status, onboarding_step, analysis_status,
                             cv_path, cv_sha256, verify_token, consent_public_at, full_name) values
  ('5d000000-0000-4000-8000-0000000000d1', md5('pl'), 'legacy.owner@s.test', now(), 'published', 'done', 'done',
   '5d000000-0000-4000-8000-0000000000d1.docx', encode(sha256('l1'::bytea), 'hex'), md5('pl-verify'), now(), 'صاحب ملف قديم'),
  ('5d000000-0000-4000-8000-0000000000e1', md5('pu'), 'pending@s.test', now(), 'draft', 'done', 'done',
   '5d000000-0000-4000-8000-0000000000e1.pdf', encode(sha256('u1'::bytea), 'hex'), null, null, null),
  ('5d000000-0000-4000-8000-0000000000f2', md5('pv'), 'unverified@s.test', null, 'draft', 'done', 'pending',
   null, null, md5('pv-verify'), null, null);

insert into talent.cv_versions (id, profile_id, path, sha256, mime, size_bytes, analysis_status, created_at) values
  ('5e000000-0000-4000-8000-0000000000a1','5d000000-0000-4000-8000-0000000000a1','5d000000-0000-4000-8000-0000000000a1/v1.pdf', encode(sha256('a1'::bytea), 'hex'), 'application/pdf', 1000, 'failed',  now() - interval '1 day'),
  ('5e000000-0000-4000-8000-0000000000a2','5d000000-0000-4000-8000-0000000000a1','5d000000-0000-4000-8000-0000000000a1/v2.pdf', encode(sha256('a2'::bytea), 'hex'), 'application/pdf', 2000, 'pending', now()),
  ('5e000000-0000-4000-8000-0000000000b1','5d000000-0000-4000-8000-0000000000b1','5d000000-0000-4000-8000-0000000000b1/v1.pdf', encode(sha256('b1'::bytea), 'hex'), 'application/pdf', 3000, 'done',    now()),
  ('5e000000-0000-4000-8000-0000000000c1','5d000000-0000-4000-8000-0000000000c1','5d000000-0000-4000-8000-0000000000c1/v1.pdf', encode(sha256('c1'::bytea), 'hex'), 'application/pdf', 4000, 'done',    now());

insert into talent.profile_skills (profile_id, skill_id) values
  ('5d000000-0000-4000-8000-0000000000a1','frontend'),
  ('5d000000-0000-4000-8000-0000000000a1','backend'),
  ('5d000000-0000-4000-8000-0000000000b1','data_analysis'),
  ('5d000000-0000-4000-8000-0000000000b1','sales');

-- ============================================================
-- Schema
-- ============================================================

select pg_temp.chk('schema: talent.cv_versions has row level security enabled',
  (select relrowsecurity from pg_class where oid = 'talent.cv_versions'::regclass));

select pg_temp.chk('schema: no policies on talent.profiles, cv_versions or profile_skills',
  not exists (select 1 from pg_policies
              where schemaname = 'talent' and tablename in ('profiles','cv_versions','profile_skills')));

select pg_temp.chk('schema: anon and authenticated hold no privilege on the talent tables',
  not exists (
    select 1
    from unnest(array['anon','authenticated']) r(role),
         unnest(array['talent.profiles','talent.cv_versions','talent.profile_skills']) t(tbl)
    where has_table_privilege(r.role, t.tbl, 'select, insert, update, delete, truncate, references, trigger')
  ));

select pg_temp.chk_denied('schema: two unlinked profiles cannot share an email',
  $q$insert into talent.profiles (public_token, email) values (md5('dup'), 'legacy.owner@s.test')$q$);

select pg_temp.chk('schema: an account profile may share an email with an unlinked one',
  exists (select 1 from talent.profiles where id = '5d000000-0000-4000-8000-0000000000f3'));

select pg_temp.chk_denied('schema: an application cannot carry a user without via_account',
  $q$insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime, applicant_user_id, via_account)
     values ('5a000000-0000-4000-8000-0000000000a2','SEEK-BAD-01','س','bad@s.test','+966500000999','x/bad.pdf','application/pdf',
             '5c000000-0000-4000-8000-0000000000b1', false)$q$);

-- ============================================================
-- Direct table access — none for any client role
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
select pg_temp.chk_blind('seeker cannot select talent.profiles directly',
  $q$select count(*) from talent.profiles$q$);
select pg_temp.chk_blind('seeker cannot select talent.cv_versions directly',
  $q$select count(*) from talent.cv_versions$q$);
select pg_temp.chk_blind('seeker cannot select talent.profile_skills directly',
  $q$select count(*) from talent.profile_skills$q$);
select pg_temp.chk_denied('seeker cannot insert a talent profile directly',
  $q$insert into talent.profiles (public_token, email, user_id)
     values (md5('evil'), 'evil@s.test', '5c000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.chk_denied('seeker cannot update their own talent profile directly',
  $q$update talent.profiles set status = 'published' where user_id = '5c000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.chk_denied('seeker cannot delete a talent profile directly',
  $q$delete from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.chk_denied('seeker cannot insert a cv version directly',
  $q$insert into talent.cv_versions (profile_id, path, sha256, mime)
     values ('5d000000-0000-4000-8000-0000000000a1', 'x/evil.pdf', repeat('a', 64), 'application/pdf')$q$);
select pg_temp.chk_denied('seeker cannot update a cv version directly',
  $q$update talent.cv_versions set analysis_status = 'done' where profile_id = '5d000000-0000-4000-8000-0000000000a1'$q$);
select pg_temp.chk_denied('seeker cannot delete a cv version directly',
  $q$delete from talent.cv_versions where id = '5e000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.chk_denied('seeker cannot add a skill to their profile directly',
  $q$insert into talent.profile_skills (profile_id, skill_id) values ('5d000000-0000-4000-8000-0000000000a1', 'sales')$q$);
select pg_temp.chk_denied('seeker cannot remove profile skills directly',
  $q$delete from talent.profile_skills where profile_id = '5d000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.as_owner();

select pg_temp.as_anon();
select pg_temp.chk_blind('anon cannot select talent.profiles',
  $q$select count(*) from talent.profiles$q$);
select pg_temp.chk_blind('anon cannot select talent.cv_versions',
  $q$select count(*) from talent.cv_versions$q$);
select pg_temp.chk_blind('anon cannot select talent.profile_skills',
  $q$select count(*) from talent.profile_skills$q$);
select pg_temp.chk_denied('anon cannot insert a talent profile',
  $q$insert into talent.profiles (public_token, email) values (md5('anon'), 'anon@s.test')$q$);
select pg_temp.chk_denied('anon cannot update a talent profile',
  $q$update talent.profiles set status = 'published'$q$);
select pg_temp.chk_denied('anon cannot delete a talent profile',
  $q$delete from talent.profiles$q$);
select pg_temp.chk_denied('anon cannot insert a cv version',
  $q$insert into talent.cv_versions (profile_id, path, sha256, mime)
     values ('5d000000-0000-4000-8000-0000000000a1', 'x/anon.pdf', repeat('a', 64), 'application/pdf')$q$);
select pg_temp.chk_denied('anon cannot insert profile skills',
  $q$insert into talent.profile_skills (profile_id, skill_id) values ('5d000000-0000-4000-8000-0000000000a1', 'sales')$q$);

-- ============================================================
-- anon executes none of the seeker functions
-- ============================================================

select pg_temp.chk_denied('anon cannot call my_hats', $q$select public.my_hats()$q$);
select pg_temp.chk_denied('anon cannot call talent_my_profile', $q$select public.talent_my_profile()$q$);
select pg_temp.chk_denied('anon cannot call talent_save_my_contact',
  $q$select public.talent_save_my_contact('اسم', '+966500000000', null, '{}')$q$);
select pg_temp.chk_denied('anon cannot call talent_save_my_review',
  $q$select public.talent_save_my_review('اسم', null, null, null, null, '{}')$q$);
select pg_temp.chk_denied('anon cannot call talent_set_my_consents',
  $q$select public.talent_set_my_consents(true, true, false)$q$);
select pg_temp.chk_denied('anon cannot call talent_legacy_profile_available',
  $q$select public.talent_legacy_profile_available()$q$);
select pg_temp.chk_denied('anon cannot call talent_link_legacy_profile',
  $q$select public.talent_link_legacy_profile()$q$);
select pg_temp.chk_denied('anon cannot call my_applications', $q$select count(*) from public.my_applications()$q$);
select pg_temp.chk_denied('anon cannot call talent_delete_seeker_data',
  $q$select public.talent_delete_seeker_data('5c000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.as_owner();

-- ============================================================
-- my_hats — two separate hats, routing only
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('hats_a', public.my_hats());
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
insert into t_out values ('hats_staff', public.my_hats());
select pg_temp.as_user('5a000000-0000-4000-8000-000000000013');
insert into t_out values ('hats_deleted_org', public.my_hats());
select pg_temp.as_user('5a000000-0000-4000-8000-000000000012');
insert into t_out values ('hats_h_before', public.my_hats());
insert into t_out values ('orgs_h_before', to_jsonb(public.current_org_ids()));
select pg_temp.as_owner();

select pg_temp.chk('my_hats: a seeker without membership wears the seeker hat only',
  pg_temp.out('hats_a') = '{"company":false,"seeker":true,"seeker_step":"contact"}'::jsonb);
select pg_temp.chk('my_hats: staff without a profile wear the company hat only',
  pg_temp.out('hats_staff') = '{"company":true,"seeker":false,"seeker_step":null}'::jsonb);
select pg_temp.chk('my_hats: a membership in a deleted organization is no company hat',
  (pg_temp.out('hats_deleted_org') ->> 'company')::boolean = false);
select pg_temp.chk('my_hats: hr before having a profile wears the company hat only',
  pg_temp.out('hats_h_before') = '{"company":true,"seeker":false,"seeker_step":null}'::jsonb);

-- The same person becomes a seeker too.
insert into talent.profiles (id, user_id, public_token, email, email_verified_at, onboarding_step)
values ('5d000000-0000-4000-8000-000000000012','5a000000-0000-4000-8000-000000000012', md5('ph'),
        'two-hats@acme-s.test', now(), 'cv');

select pg_temp.as_user('5a000000-0000-4000-8000-000000000012');
insert into t_out values ('hats_h_after', public.my_hats());
insert into t_out values ('orgs_h_after', to_jsonb(public.current_org_ids()));
insert into t_out values ('profile_h', public.talent_my_profile());
select pg_temp.as_owner();

select pg_temp.chk('two hats: membership + profile → both hats',
  pg_temp.out('hats_h_after') = '{"company":true,"seeker":true,"seeker_step":"cv"}'::jsonb);
select pg_temp.chk('two hats: current_org_ids() is unchanged by having a profile',
  pg_temp.out('orgs_h_after') = pg_temp.out('orgs_h_before')
  and pg_temp.out('orgs_h_after') = '["5a000000-0000-4000-8000-000000000001"]'::jsonb);
select pg_temp.chk('two hats: talent_my_profile returns their own profile',
  pg_temp.out('profile_h') ->> 'id' = '5d000000-0000-4000-8000-000000000012');

-- ============================================================
-- talent_my_profile — own profile only, fixed columns
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('profile_a', public.talent_my_profile());
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('profile_b', public.talent_my_profile());
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
insert into t_out values ('profile_staff', coalesce(public.talent_my_profile(), '"<null>"'::jsonb));
select pg_temp.as_owner();

select pg_temp.chk('talent_my_profile: seeker A gets their own profile',
  pg_temp.out('profile_a') ->> 'id' = '5d000000-0000-4000-8000-0000000000a1');
select pg_temp.chk('talent_my_profile: seeker B gets their own profile, not A''s',
  pg_temp.out('profile_b') ->> 'id' = '5d000000-0000-4000-8000-0000000000b1');
select pg_temp.chk('talent_my_profile: NULL for a staff member without a profile',
  pg_temp.out('profile_staff') = '"<null>"'::jsonb);
select pg_temp.chk('talent_my_profile: exactly the SeekerProfile keys (lib/seeker.ts)',
  array(select jsonb_object_keys(pg_temp.out('profile_a')) order by 1) = array[
    'about','analysis_error','analysis_status','city','consent_offers','consent_public',
    'cv_versions','education','email','experiences','focus_areas','full_name','headline',
    'hidden_skills','id','languages','noindex','onboarding_step','phone','preferences',
    'public_token','skills','status','strengths','years_experience']);
select pg_temp.chk('talent_my_profile: no cv_path, cv_sha256, verify_token or verify_sent_at',
  not (pg_temp.out('profile_a') ?| array['cv_path','cv_sha256','verify_token','verify_sent_at','extracted']));
select pg_temp.chk('talent_my_profile: cv versions carry no path or hash',
  (select bool_and(array(select jsonb_object_keys(e) order by 1)
                   = array['analysis_status','created_at','id','is_current','mime'])
   from jsonb_array_elements(pg_temp.out('profile_a') -> 'cv_versions') e));
select pg_temp.chk('talent_my_profile: versions newest first, only the newest is current',
  jsonb_array_length(pg_temp.out('profile_a') -> 'cv_versions') = 2
  and pg_temp.out('profile_a') #>> '{cv_versions,0,id}' = '5e000000-0000-4000-8000-0000000000a2'
  and (pg_temp.out('profile_a') #>> '{cv_versions,0,is_current}')::boolean
  and not (pg_temp.out('profile_a') #>> '{cv_versions,1,is_current}')::boolean);
select pg_temp.chk('talent_my_profile: preferences normalised (unknown keys and types dropped, deduplicated)',
  pg_temp.out('profile_a') -> 'preferences' = '{"work_types":["remote"],"relocate":true}'::jsonb);
select pg_temp.chk('talent_my_profile: every skill listed, hidden ones included and flagged',
  jsonb_array_length(pg_temp.out('profile_a') -> 'skills') = 2
  and pg_temp.out('profile_a') -> 'hidden_skills' = '["backend"]'::jsonb);
select pg_temp.chk('talent_my_profile: experiences and languages come from the extraction',
  jsonb_array_length(pg_temp.out('profile_b') -> 'experiences') = 1
  and pg_temp.out('profile_b') -> 'languages' = '["العربية"]'::jsonb
  and pg_temp.out('profile_b') -> 'education' = '[]'::jsonb);

-- ============================================================
-- talent_save_my_contact
-- ============================================================

select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
insert into t_out values ('contact_staff', public.talent_save_my_contact('موظفة', '+966500000000', null, '{}'));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('contact_bad_phone', public.talent_save_my_contact('الباحثة أ', 'call me', null, '{}'));
insert into t_out values ('contact_bad_name',  public.talent_save_my_contact(' س ', '+966500000101', null, '{}'));
insert into t_out values ('contact_bad_type',  public.talent_save_my_contact('الباحثة أ', '+966500000101', null, '{"work_types":["freelance"]}'));
insert into t_out values ('contact_bad_reloc', public.talent_save_my_contact('الباحثة أ', '+966500000101', null, '{"relocate":"yes"}'));
insert into t_out values ('contact_bad_city',  public.talent_save_my_contact('الباحثة أ', '+966500000101', repeat('م', 121), '{}'));
select pg_temp.as_owner();

select pg_temp.chk('save_my_contact: no profile → not_found',
  pg_temp.out('contact_staff') = '{"ok":false,"error":"not_found"}'::jsonb);
select pg_temp.chk('save_my_contact: an invalid phone is rejected',
  pg_temp.out('contact_bad_phone') = '{"ok":false,"error":"invalid","field":"phone"}'::jsonb);
select pg_temp.chk('save_my_contact: a one-letter name is rejected',
  pg_temp.out('contact_bad_name') = '{"ok":false,"error":"invalid","field":"full_name"}'::jsonb);
select pg_temp.chk('save_my_contact: a work type outside job_type is rejected',
  pg_temp.out('contact_bad_type') = '{"ok":false,"error":"invalid","field":"preferences"}'::jsonb);
select pg_temp.chk('save_my_contact: a non-boolean relocate is rejected',
  pg_temp.out('contact_bad_reloc') = '{"ok":false,"error":"invalid","field":"preferences"}'::jsonb);
select pg_temp.chk('save_my_contact: an over-long city is rejected',
  pg_temp.out('contact_bad_city') = '{"ok":false,"error":"invalid","field":"city"}'::jsonb);
select pg_temp.chk('save_my_contact: rejected calls changed nothing',
  (select phone is null and full_name is null and onboarding_step = 'contact'
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1'));

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('contact_ok', public.talent_save_my_contact(
  '  سارة الباحثة ', '+966 50 123 4567', ' الرياض ',
  '{"work_types":["remote","full_time","remote"],"relocate":false,"extra":"x"}'));
select pg_temp.as_owner();

select pg_temp.chk('save_my_contact: a valid call succeeds',
  pg_temp.out('contact_ok') = '{"ok":true}'::jsonb);
select pg_temp.chk('save_my_contact: values saved trimmed, step contact → review',
  (select full_name = 'سارة الباحثة' and phone = '+966 50 123 4567' and city = 'الرياض'
          and onboarding_step = 'review'
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk('save_my_contact: preferences stored normalised and deduplicated',
  (select preferences = '{"work_types":["full_time","remote"],"relocate":false}'::jsonb
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk('save_my_contact: only the caller''s row changed',
  (select phone is null and full_name is null and onboarding_step = 'review'
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('contact_again', public.talent_save_my_contact('سارة الباحثة', '0501234567', null, null));
select pg_temp.as_owner();

select pg_temp.chk('save_my_contact: at any other step the step is unchanged',
  pg_temp.out('contact_again') = '{"ok":true}'::jsonb
  and (select onboarding_step = 'review' and phone = '0501234567' and city is null
              and preferences = '{"work_types":[],"relocate":null}'::jsonb
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1'));

-- ============================================================
-- talent_save_my_review
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('review_a', public.talent_save_my_review('سارة', null, null, 3, null, '{}'));
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
insert into t_out values ('review_staff', public.talent_save_my_review('موظفة', null, null, null, null, '{}'));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('review_bad_about', public.talent_save_my_review('بدر', null, null, 4, repeat('ن', 301), '{}'));
insert into t_out values ('review_bad_years', public.talent_save_my_review('بدر', null, null, 61, null, '{}'));
insert into t_out values ('review_bad_headline', public.talent_save_my_review('بدر', repeat('ع', 161), null, 4, null, '{}'));
insert into t_out values ('review_ok', public.talent_save_my_review(
  'بدر الباحث', 'محلل بيانات', 'جدة', 4.5, 'نبذة قصيرة', array['sales', 'frontend', 'sales']));
select pg_temp.as_owner();

select pg_temp.chk('save_my_review: refused before the analysis is done',
  pg_temp.out('review_a') = '{"ok":false,"error":"analysis_not_ready"}'::jsonb);
select pg_temp.chk('save_my_review: no profile → not_found',
  pg_temp.out('review_staff') = '{"ok":false,"error":"not_found"}'::jsonb);
select pg_temp.chk('save_my_review: about over 300 characters is rejected',
  pg_temp.out('review_bad_about') = '{"ok":false,"error":"invalid","field":"about"}'::jsonb);
select pg_temp.chk('save_my_review: years over 60 are rejected',
  pg_temp.out('review_bad_years') = '{"ok":false,"error":"invalid","field":"years_experience"}'::jsonb);
select pg_temp.chk('save_my_review: a headline over 160 characters is rejected',
  pg_temp.out('review_bad_headline') = '{"ok":false,"error":"invalid","field":"headline"}'::jsonb);
select pg_temp.chk('save_my_review: a valid review saves and moves review → consents',
  pg_temp.out('review_ok') = '{"ok":true}'::jsonb
  and (select full_name = 'بدر الباحث' and headline = 'محلل بيانات' and city = 'جدة'
              and years_experience = 4.5 and about = 'نبذة قصيرة' and onboarding_step = 'consents'
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));
select pg_temp.chk('save_my_review: hidden skills limited to the profile''s own skills (removal only)',
  (select hidden_skills = '{sales}' from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));

-- ============================================================
-- talent_set_my_consents — two separate consents
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('consent_a_public', public.talent_set_my_consents(true, false, false));
insert into t_out values ('consent_a_offers', public.talent_set_my_consents(false, true, false));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('consent_b_public', public.talent_set_my_consents(true, false, true));
select pg_temp.as_owner();

select pg_temp.chk('consents: public consent refused before the analysis is done',
  pg_temp.out('consent_a_public') = '{"ok":false,"error":"analysis_not_ready"}'::jsonb);
select pg_temp.chk('consents: the offers consent alone does not publish anything',
  pg_temp.out('consent_a_offers') = '{"ok":true}'::jsonb
  and (select consent_offers_at is not null and consent_public_at is null and status = 'draft'
              and onboarding_step = 'review'
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk('consents: public consent publishes and moves consents → done',
  pg_temp.out('consent_b_public') = '{"ok":true}'::jsonb
  and (select status = 'published' and consent_public_at is not null and consent_offers_at is null
              and noindex and onboarding_step = 'done'
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));

select pg_temp.as_anon();
insert into t_out values ('page_b_published', coalesce(public.talent_public_profile(md5('pb')), '"<null>"'::jsonb));
select pg_temp.as_owner();
select pg_temp.chk('consents: the public page appears after consent',
  pg_temp.out('page_b_published') ->> 'full_name' = 'بدر الباحث'
  and (pg_temp.out('page_b_published') ->> 'noindex')::boolean);

-- A standing consent keeps the moment it was first given.
update talent.profiles set consent_public_at = '2026-01-01 00:00+00'
where id = '5d000000-0000-4000-8000-0000000000b1';
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('consent_b_again', public.talent_set_my_consents(true, false, false));
select pg_temp.as_owner();
select pg_temp.chk('consents: giving it again keeps the original timestamp',
  pg_temp.out('consent_b_again') = '{"ok":true}'::jsonb
  and (select consent_public_at = '2026-01-01 00:00+00' and not noindex
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('consent_b_withdraw', public.talent_set_my_consents(false, true, false));
select pg_temp.as_anon();
insert into t_out values ('page_b_withdrawn', coalesce(public.talent_public_profile(md5('pb')), '"<null>"'::jsonb));
select pg_temp.as_owner();
select pg_temp.chk('consents: withdrawing hides the profile; offers consent stands on its own',
  pg_temp.out('consent_b_withdraw') = '{"ok":true}'::jsonb
  and (select status = 'hidden' and consent_public_at is null and consent_offers_at is not null
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));
select pg_temp.chk('consents: the public page disappears after withdrawal',
  pg_temp.out('page_b_withdrawn') = '"<null>"'::jsonb);

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('consent_b_republish', public.talent_set_my_consents(true, false, false));
select pg_temp.as_anon();
insert into t_out values ('page_b_republished', coalesce(public.talent_public_profile(md5('pb')), '"<null>"'::jsonb));
select pg_temp.as_owner();
select pg_temp.chk('consents: public again without offers → page back, offers consent cleared',
  pg_temp.out('page_b_republished') ->> 'full_name' = 'بدر الباحث'
  and (select status = 'published' and consent_offers_at is null
       from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));

-- ============================================================
-- The legacy token functions do not reach account profiles
-- (the public token is also the public page's URL)
-- ============================================================

select pg_temp.as_anon();
insert into t_out values ('tok_review_b', coalesce(public.talent_review_profile(md5('pb')), '"<null>"'::jsonb));
insert into t_out values ('tok_hide_b', public.talent_set_visibility(md5('pb'), false));
insert into t_out values ('tok_publish_b', public.talent_publish_profile(
  md5('pb'), 'منتحل', null, null, null, null, '{}', true, true, false));
insert into t_out values ('tok_delete_b', public.talent_delete_profile(md5('pb')));
insert into t_out values ('tok_review_legacy', coalesce(public.talent_review_profile(md5('pl')), '"<null>"'::jsonb));
select pg_temp.as_owner();

select pg_temp.chk('token: talent_review_profile does not read an account profile',
  pg_temp.out('tok_review_b') = '"<null>"'::jsonb);
select pg_temp.chk('token: talent_set_visibility does not touch an account profile',
  pg_temp.out('tok_hide_b') ->> 'error' = 'not_found');
select pg_temp.chk('token: talent_publish_profile does not rewrite an account profile',
  pg_temp.out('tok_publish_b') ->> 'error' = 'not_found');
select pg_temp.chk('token: talent_delete_profile does not delete an account profile',
  pg_temp.out('tok_delete_b') ->> 'error' = 'not_found');
select pg_temp.chk('token: the account profile is intact after all four attempts',
  (select status = 'published' and full_name = 'بدر الباحث'
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'));
select pg_temp.chk('token: an unlinked legacy profile is still served by its token',
  pg_temp.out('tok_review_legacy') ->> 'full_name' = 'صاحب ملف قديم');

-- ============================================================
-- my_applications — the caller's own, never an evaluation
-- ============================================================

-- A second status, so the history has an order to check.
update applications set status = 'under_review' where id = '5a000000-0000-4000-8000-0000000000f1';

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('apps_a', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.my_applications() m));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('apps_b', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.my_applications() m));
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
insert into t_out values ('apps_staff', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.my_applications() m));
select pg_temp.as_user('5a000000-0000-4000-8000-000000000012');
insert into t_out values ('apps_h', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.my_applications() m));
select pg_temp.as_owner();

select pg_temp.chk('my_applications: seeker A sees exactly their account application',
  jsonb_array_length(pg_temp.out('apps_a')) = 1
  and pg_temp.out('apps_a') #>> '{0,id}' = '5a000000-0000-4000-8000-0000000000f1');
select pg_temp.chk('my_applications: a guest application with the same email is not returned',
  not exists (select 1 from jsonb_array_elements(pg_temp.out('apps_a')) e
              where e ->> 'id' = '5a000000-0000-4000-8000-0000000000f2'));
select pg_temp.chk('my_applications: job, company and status are those of the application',
  pg_temp.out('apps_a') #>> '{0,job_title}' = 'مطور واجهات'
  and pg_temp.out('apps_a') #>> '{0,org_name}' = 'أكمي'
  and pg_temp.out('apps_a') #>> '{0,org_slug}' = 'acme-s'
  and pg_temp.out('apps_a') #>> '{0,status}' = 'under_review'
  and pg_temp.out('apps_a') #>> '{0,ref_code}' = 'SEEK-A-001');
select pg_temp.chk('my_applications: history is status + timestamp, oldest first',
  jsonb_array_length(pg_temp.out('apps_a') #> '{0,history}') = 2
  and pg_temp.out('apps_a') #>> '{0,history,0,to_status}' = 'new'
  and pg_temp.out('apps_a') #>> '{0,history,1,to_status}' = 'under_review'
  and (select bool_and(array(select jsonb_object_keys(h) order by 1) = array['created_at','to_status'])
       from jsonb_array_elements(pg_temp.out('apps_a') #> '{0,history}') h));
select pg_temp.chk('my_applications: no fit score, evaluation or note in the columns',
  array(select jsonb_object_keys(pg_temp.out('apps_a') -> 0) order by 1) = array[
    'created_at','history','id','job_id','job_title','org_name','org_slug','ref_code','status']);
select pg_temp.chk('my_applications: seeker B sees none of A''s applications',
  pg_temp.out('apps_b') = '[]'::jsonb);
select pg_temp.chk('my_applications: staff of the application''s org see none through it',
  pg_temp.out('apps_staff') = '[]'::jsonb);
select pg_temp.chk('my_applications: a two-hat user sees none of their org''s applications through it',
  pg_temp.out('apps_h') = '[]'::jsonb);

-- ============================================================
-- A seeker reads no tenant data; staff read no talent data
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
select pg_temp.chk_blind('seeker without membership reads 0 applications (even their own)',
  $q$select count(*) from applications$q$);
select pg_temp.chk_blind('seeker without membership reads 0 ai_evaluations',
  $q$select count(*) from ai_evaluations$q$);
select pg_temp.chk_blind('seeker without membership reads 0 status_history rows',
  $q$select count(*) from status_history$q$);
select pg_temp.as_owner();

select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
select pg_temp.chk_blind('staff cannot read any talent profile',
  $q$select count(*) from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1'$q$);
select pg_temp.chk_blind('staff cannot read any cv version',
  $q$select count(*) from talent.cv_versions$q$);
select pg_temp.chk_blind('staff cannot read any profile skills',
  $q$select count(*) from talent.profile_skills$q$);
select pg_temp.as_owner();

-- ============================================================
-- Legacy profiles — linked only on a confirmed, matching, verified email
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000d1');
insert into t_out values ('legacy_l_available', to_jsonb(public.talent_legacy_profile_available()));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000f1');
insert into t_out values ('legacy_d_available', to_jsonb(public.talent_legacy_profile_available()));
insert into t_out values ('legacy_d_link', public.talent_link_legacy_profile());
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000f2');
insert into t_out values ('legacy_v_available', to_jsonb(public.talent_legacy_profile_available()));
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000e1');
insert into t_out values ('legacy_u_available', to_jsonb(public.talent_legacy_profile_available()));
insert into t_out values ('legacy_u_link', public.talent_link_legacy_profile());
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000b1');
insert into t_out values ('legacy_b_available', to_jsonb(public.talent_legacy_profile_available()));
select pg_temp.as_owner();

select pg_temp.chk('legacy: available for a confirmed account with the verified email (any case)',
  pg_temp.out('legacy_l_available') = 'true'::jsonb);
select pg_temp.chk('legacy: a different email → not available',
  pg_temp.out('legacy_d_available') = 'false'::jsonb
  and pg_temp.out('legacy_d_link') = '{"ok":false,"error":"not_available"}'::jsonb);
select pg_temp.chk('legacy: an unverified legacy profile is never offered',
  pg_temp.out('legacy_v_available') = 'false'::jsonb);
select pg_temp.chk('legacy: an unconfirmed auth email → not available and not linkable',
  pg_temp.out('legacy_u_available') = 'false'::jsonb
  and pg_temp.out('legacy_u_link') = '{"ok":false,"error":"not_available"}'::jsonb
  and (select user_id is null from talent.profiles where id = '5d000000-0000-4000-8000-0000000000e1'));
select pg_temp.chk('legacy: a caller who already has a profile is never offered one',
  pg_temp.out('legacy_b_available') = 'false'::jsonb);

-- Confirmation is the only thing U lacked; X's account profile with the
-- same email does not stand in the way.
update auth.users set email_confirmed_at = now() where id = '5c000000-0000-4000-8000-0000000000e1';
select pg_temp.as_user('5c000000-0000-4000-8000-0000000000e1');
insert into t_out values ('legacy_u_confirmed', to_jsonb(public.talent_legacy_profile_available()));
select pg_temp.as_owner();
select pg_temp.chk('legacy: once the auth email is confirmed it becomes available',
  pg_temp.out('legacy_u_confirmed') = 'true'::jsonb);

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000d1');
insert into t_out values ('legacy_l_link', public.talent_link_legacy_profile());
insert into t_out values ('legacy_l_link_again', public.talent_link_legacy_profile());
insert into t_out values ('legacy_l_available_after', to_jsonb(public.talent_legacy_profile_available()));
insert into t_out values ('legacy_l_profile', public.talent_my_profile());
select pg_temp.as_anon();
insert into t_out values ('legacy_l_token_review', coalesce(public.talent_review_profile(md5('pl')), '"<null>"'::jsonb));
insert into t_out values ('legacy_l_public_page', coalesce(public.talent_public_profile(md5('pl')), '"<null>"'::jsonb));
select pg_temp.as_owner();

select pg_temp.chk('legacy: link succeeds',
  pg_temp.out('legacy_l_link') = '{"ok":true}'::jsonb);
select pg_temp.chk('legacy: the profile now belongs to the account, resumes at contact (no phone)',
  (select user_id = '5c000000-0000-4000-8000-0000000000d1' and onboarding_step = 'contact'
          and verify_token is null
   from talent.profiles where id = '5d000000-0000-4000-8000-0000000000d1'));
select pg_temp.chk('legacy: link creates the cv_versions row for the stored CV',
  (select count(*) = 1
          and bool_and(path = '5d000000-0000-4000-8000-0000000000d1.docx'
                       and sha256 = encode(sha256('l1'::bytea), 'hex')
                       and mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                       and size_bytes is null
                       and analysis_status = 'done')
   from talent.cv_versions where profile_id = '5d000000-0000-4000-8000-0000000000d1'));
select pg_temp.chk('legacy: a second attempt → not_available',
  pg_temp.out('legacy_l_link_again') = '{"ok":false,"error":"not_available"}'::jsonb
  and pg_temp.out('legacy_l_available_after') = 'false'::jsonb);
select pg_temp.chk('legacy: the linked profile is the caller''s, with its CV as the current version',
  pg_temp.out('legacy_l_profile') ->> 'id' = '5d000000-0000-4000-8000-0000000000d1'
  and jsonb_array_length(pg_temp.out('legacy_l_profile') -> 'cv_versions') = 1
  and (pg_temp.out('legacy_l_profile') #>> '{cv_versions,0,is_current}')::boolean);
select pg_temp.chk('legacy: once linked, its token no longer manages it',
  pg_temp.out('legacy_l_token_review') = '"<null>"'::jsonb);
select pg_temp.chk('legacy: its public page keeps working',
  pg_temp.out('legacy_l_public_page') ->> 'full_name' = 'صاحب ملف قديم');

-- ============================================================
-- talent_delete_seeker_data — service role only
-- ============================================================

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
select pg_temp.chk_denied('delete_seeker_data: denied to the seeker themselves',
  $q$select public.talent_delete_seeker_data('5c000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('delete_seeker_data: denied to staff',
  $q$select public.talent_delete_seeker_data('5c000000-0000-4000-8000-0000000000a1')$q$);
select pg_temp.as_service();
insert into t_out values ('delete_a', public.talent_delete_seeker_data('5c000000-0000-4000-8000-0000000000a1'));
insert into t_out values ('delete_a_again', public.talent_delete_seeker_data('5c000000-0000-4000-8000-0000000000a1'));
select pg_temp.as_owner();

select pg_temp.chk('delete_seeker_data: returns every stored path once (versions + legacy cv_path)',
  pg_temp.out('delete_a') = jsonb_build_object('ok', true, 'paths', jsonb_build_array(
    '5d000000-0000-4000-8000-0000000000a1/v1.pdf',
    '5d000000-0000-4000-8000-0000000000a1/v2.pdf')));
select pg_temp.chk('delete_seeker_data: the profile, its versions and skills are gone',
  not exists (select 1 from talent.profiles where id = '5d000000-0000-4000-8000-0000000000a1')
  and not exists (select 1 from talent.cv_versions where profile_id = '5d000000-0000-4000-8000-0000000000a1')
  and not exists (select 1 from talent.profile_skills where profile_id = '5d000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk('delete_seeker_data: the application stays with the company, unlinked, via_account kept',
  (select applicant_user_id is null and via_account and status = 'under_review'
   from applications where id = '5a000000-0000-4000-8000-0000000000f1'));
select pg_temp.chk('delete_seeker_data: the company''s evaluation of it is untouched',
  exists (select 1 from ai_evaluations where application_id = '5a000000-0000-4000-8000-0000000000f1'));
select pg_temp.chk('delete_seeker_data: nothing else was touched',
  exists (select 1 from talent.profiles where id = '5d000000-0000-4000-8000-0000000000b1')
  and (select applicant_user_id = '5c000000-0000-4000-8000-0000000000c1'
       from applications where id = '5a000000-0000-4000-8000-0000000000f3'));
select pg_temp.chk('delete_seeker_data: a second call → not_found with no paths',
  pg_temp.out('delete_a_again') = '{"ok":false,"error":"not_found","paths":[]}'::jsonb);

select pg_temp.as_user('5c000000-0000-4000-8000-0000000000a1');
insert into t_out values ('hats_a_deleted', public.my_hats());
insert into t_out values ('apps_a_deleted', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.my_applications() m));
select pg_temp.as_owner();
select pg_temp.chk('delete_seeker_data: afterwards no seeker hat and no applications listed',
  pg_temp.out('hats_a_deleted') = '{"company":false,"seeker":false,"seeker_step":null}'::jsonb
  and pg_temp.out('apps_a_deleted') = '[]'::jsonb);

-- ============================================================
-- applicant_user_id / via_account — the platform's columns only
-- ============================================================

select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('staff cannot attach an application to an account',
  $q$update applications set applicant_user_id = '5a000000-0000-4000-8000-000000000011'
     where id = '5a000000-0000-4000-8000-0000000000f2'$q$);
select pg_temp.chk_denied('staff cannot clear via_account',
  $q$update applications set via_account = false where id = '5a000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.chk_rows('staff updates of their granted columns still work',
  $q$update applications set interview_at = now() where id = '5a000000-0000-4000-8000-0000000000f3'$q$, 1);
select pg_temp.as_owner();

-- Defense in depth: even with a careless column grant, the trigger refuses.
grant update (applicant_user_id, via_account) on applications to authenticated;
select pg_temp.as_user('5a000000-0000-4000-8000-000000000011');
select pg_temp.chk_guard('trigger: refuses staff changing applicant_user_id despite a grant',
  $q$update applications set applicant_user_id = null where id = '5a000000-0000-4000-8000-0000000000f3'$q$);
select pg_temp.chk_guard('trigger: refuses staff changing via_account despite a grant',
  $q$update applications set via_account = false where id = '5a000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.as_owner();
revoke update (applicant_user_id, via_account) on applications from authenticated;

select pg_temp.as_service();
select pg_temp.chk_rows('trigger: the service role may unlink an application',
  $q$update applications set applicant_user_id = null where id = '5a000000-0000-4000-8000-0000000000f3'$q$, 1);
select pg_temp.chk_rows('trigger: the service role may link it again',
  $q$update applications set applicant_user_id = '5c000000-0000-4000-8000-0000000000c1'
     where id = '5a000000-0000-4000-8000-0000000000f3'$q$, 1);
select pg_temp.as_owner();

-- Deleting the auth user (GoTrue's path) cascades the profile and unlinks
-- the application through ON DELETE SET NULL, which the trigger lets pass.
delete from auth.users where id = '5c000000-0000-4000-8000-0000000000c1';
select pg_temp.chk('auth user deleted: the application stays, unlinked, via_account kept',
  (select applicant_user_id is null and via_account
   from applications where id = '5a000000-0000-4000-8000-0000000000f3'));
select pg_temp.chk('auth user deleted: the profile and its versions cascade away',
  not exists (select 1 from talent.profiles where id = '5d000000-0000-4000-8000-0000000000c1')
  and not exists (select 1 from talent.cv_versions where id = '5e000000-0000-4000-8000-0000000000c1'));

-- A former staff member who once created a job can still delete their
-- account: authorship is released (on delete set null), the job stays.
reset role;
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','5c000000-0000-4000-8000-0000000000f9','authenticated','authenticated','former-staff@s.test', now(), now(), now());
insert into profiles (id, full_name) values ('5c000000-0000-4000-8000-0000000000f9','موظف سابق');
update jobs set created_by = '5c000000-0000-4000-8000-0000000000f9'
where id = '5a000000-0000-4000-8000-0000000000a2';
delete from auth.users where id = '5c000000-0000-4000-8000-0000000000f9';
select pg_temp.chk('former job author deleted: the job stays with created_by null',
  (select created_by is null from jobs where id = '5a000000-0000-4000-8000-0000000000a2'));

-- ============================================================
-- Report
-- ============================================================

\o
\set QUIET off
select id, label, pass from t_results order by id;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total
from t_results;

do $$
declare
  v_failed int;
  v_labels text;
begin
  select count(*), string_agg(label, E'\n  - ')
    into v_failed, v_labels
  from t_results where not pass;

  if v_failed > 0 then
    raise exception E'SEEKER ISOLATION FAILED (% checks):\n  - %', v_failed, v_labels;
  end if;
  raise notice 'seeker isolation: all checks passed';
end $$;

rollback;
