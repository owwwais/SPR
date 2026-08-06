-- tenant_isolation.sql — S1 acceptance: prove that no role can reach another
-- organization's data (CLAUDE.md §2.1 "the isolation invariant", D11–D15, D22).
--
-- This is the test that must never be allowed to fail. Everything else in the
-- product is a feature; this is the product being safe to sell.
--
-- Self-contained: it builds its own two-tenant fixture, asserts against
-- specific row ids rather than counts, and rolls back. It can therefore run
-- against a seeded or an empty database, before or after rls_check.sql.
--
--   psql "$DATABASE_URL" -f supabase/tests/tenant_isolation.sql
--
-- Exit code is non-zero if any assertion fails, so it can gate a deploy.

\set ON_ERROR_STOP on
\set QUIET on

begin;

-- ============================================================
-- Assertion plumbing
-- ============================================================

create temp table t_results (
  id serial primary key,
  label text,
  pass boolean
);
grant all on t_results to anon, authenticated;
grant all on sequence t_results_id_seq to anon, authenticated;

create function pg_temp.chk(p_label text, p_pass boolean)
returns void language sql as $$
  insert into t_results (label, pass) values (p_label, p_pass);
$$;

-- For writes: RLS refuses them with an error, so the assertion is that the
-- statement raises rather than that it returns nothing.
create function pg_temp.chk_denied(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (label, pass) values (p_label, false);
exception
  when insufficient_privilege or check_violation or raise_exception then
    insert into t_results (label, pass) values (p_label, true);
end $$;

-- For reads: RLS filters silently, so "denied" means zero rows came back.
create function pg_temp.chk_blind(p_label text, p_sql text)
returns void language plpgsql as $$
declare
  v_count bigint;
begin
  execute p_sql into v_count;
  insert into t_results (label, pass) values (p_label, v_count = 0);
exception when insufficient_privilege then
  -- A hard privilege error is an even stronger form of "cannot see it".
  insert into t_results (label, pass) values (p_label, true);
end $$;

-- RLS filters an UPDATE/DELETE through USING rather than refusing it, so the
-- assertion there is "it matched nothing" instead of "it raised".
create function pg_temp.chk_rows(p_label text, p_sql text, p_expected int)
returns void language plpgsql as $$
declare
  v_rows int;
begin
  execute p_sql;
  get diagnostics v_rows = row_count;
  insert into t_results (label, pass) values (p_label, v_rows = p_expected);
exception
  when insufficient_privilege or check_violation then
    insert into t_results (label, pass) values (p_label, p_expected = 0);
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

-- Assertions return void; only the final report is worth printing.
\o /dev/null

-- ============================================================
-- Fixture: two unrelated tenants
-- ============================================================

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','0a000000-0000-4000-8000-000000000010','authenticated','authenticated','owner@acme.test',  now(), now()),
  ('00000000-0000-0000-0000-000000000000','0a000000-0000-4000-8000-000000000011','authenticated','authenticated','hr@acme.test',     now(), now()),
  ('00000000-0000-0000-0000-000000000000','0a000000-0000-4000-8000-000000000012','authenticated','authenticated','viewer@acme.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','0b000000-0000-4000-8000-000000000010','authenticated','authenticated','owner@globex.test',now(), now()),
  ('00000000-0000-0000-0000-000000000000','0b000000-0000-4000-8000-000000000011','authenticated','authenticated','hr@globex.test',   now(), now()),
  ('00000000-0000-0000-0000-000000000000','0c000000-0000-4000-8000-000000000010','authenticated','authenticated','nobody@else.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','0d000000-0000-4000-8000-000000000010','authenticated','authenticated','platform@srp.test',now(), now());

insert into profiles (id, full_name) values
  ('0a000000-0000-4000-8000-000000000010','مالك أكمي'),
  ('0a000000-0000-4000-8000-000000000011','موظفة أكمي'),
  ('0a000000-0000-4000-8000-000000000012','مشاهد أكمي'),
  ('0b000000-0000-4000-8000-000000000010','مالك جلوبكس'),
  ('0b000000-0000-4000-8000-000000000011','موظف جلوبكس'),
  ('0c000000-0000-4000-8000-000000000010','شخص خارجي'),
  ('0d000000-0000-4000-8000-000000000010','مدير المنصة');

insert into organizations (id, slug, name, status, listed_publicly) values
  ('0a000000-0000-4000-8000-000000000001','acme',  'أكمي',   'active', true),
  ('0b000000-0000-4000-8000-000000000001','globex','جلوبكس', 'active', true);

insert into memberships (org_id, user_id, role) values
  ('0a000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-000000000010','owner'),
  ('0a000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-000000000011','hr'),
  ('0a000000-0000-4000-8000-000000000001','0a000000-0000-4000-8000-000000000012','viewer'),
  ('0b000000-0000-4000-8000-000000000001','0b000000-0000-4000-8000-000000000010','owner'),
  ('0b000000-0000-4000-8000-000000000001','0b000000-0000-4000-8000-000000000011','hr');

insert into platform_admins (user_id)
values ('0d000000-0000-4000-8000-000000000010');

insert into jobs (id, org_id, title, type, description, requirements, status) values
  ('0a000000-0000-4000-8000-0000000000a1','0a000000-0000-4000-8000-000000000001','وظيفة أكمي المنشورة','full_time','د','م','published'),
  ('0a000000-0000-4000-8000-0000000000a2','0a000000-0000-4000-8000-000000000001','وظيفة أكمي المسودة','full_time','د','م','draft'),
  ('0b000000-0000-4000-8000-0000000000b1','0b000000-0000-4000-8000-000000000001','وظيفة جلوبكس المنشورة','full_time','د','م','published');

-- org_id is deliberately omitted: the applications_set_org trigger derives it
-- from the job, which is itself part of what this suite verifies.
insert into applications (id, job_id, ref_code, full_name, email, phone, cv_path, cv_mime) values
  ('0a000000-0000-4000-8000-0000000000f1','0a000000-0000-4000-8000-0000000000a1','ACME-001','متقدم أكمي','a@app.test','+966500000001','0a000000-0000-4000-8000-000000000001/0a000000-0000-4000-8000-0000000000f1.pdf','application/pdf'),
  ('0b000000-0000-4000-8000-0000000000f1','0b000000-0000-4000-8000-0000000000b1','GLBX-001','متقدم جلوبكس','b@app.test','+966500000002','0b000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-0000000000f1.pdf','application/pdf');

insert into ai_evaluations (application_id, model, prompt_version, extracted, fit_score, score_breakdown, justification, interview_questions) values
  ('0a000000-0000-4000-8000-0000000000f1','gemini-3.5-flash','1.1','{}',80,'{}','{}','[]'),
  ('0b000000-0000-4000-8000-0000000000f1','gemini-3.5-flash','1.1','{}',75,'{}','{}','[]');

insert into storage.objects (bucket_id, name, metadata) values
  ('cvs','0a000000-0000-4000-8000-000000000001/0a000000-0000-4000-8000-0000000000f1.pdf','{}'),
  ('cvs','0b000000-0000-4000-8000-000000000001/0b000000-0000-4000-8000-0000000000f1.pdf','{}');

-- ============================================================
-- The trigger-derived org_id must be right before anything else is trusted
-- ============================================================

select pg_temp.chk('fixture: application org_id derived from its job',
  (select org_id from applications where ref_code = 'ACME-001')
    = '0a000000-0000-4000-8000-000000000001');
select pg_temp.chk('fixture: evaluation org_id derived from its application',
  (select org_id from ai_evaluations
   where application_id = '0b000000-0000-4000-8000-0000000000f1')
    = '0b000000-0000-4000-8000-000000000001');
select pg_temp.chk('fixture: submission history row carries org_id',
  (select count(*) from status_history
   where application_id = '0a000000-0000-4000-8000-0000000000f1'
     and org_id = '0a000000-0000-4000-8000-000000000001') = 1);

-- ============================================================
-- ACME hr — the core cross-tenant read tests
-- ============================================================

select pg_temp.as_user('0a000000-0000-4000-8000-000000000011');

select pg_temp.chk('acme hr: sees own draft job',
  exists (select 1 from jobs where id = '0a000000-0000-4000-8000-0000000000a2'));
select pg_temp.chk('acme hr: sees own application',
  exists (select 1 from applications where ref_code = 'ACME-001'));

select pg_temp.chk_blind('acme hr: CANNOT see globex applications',
  $$select count(*) from applications where ref_code = 'GLBX-001'$$);
select pg_temp.chk_blind('acme hr: CANNOT see globex evaluations',
  $$select count(*) from ai_evaluations
    where application_id = '0b000000-0000-4000-8000-0000000000f1'$$);
select pg_temp.chk_blind('acme hr: CANNOT see globex status history',
  $$select count(*) from status_history
    where org_id = '0b000000-0000-4000-8000-000000000001'$$);
select pg_temp.chk_blind('acme hr: CANNOT see globex memberships',
  $$select count(*) from memberships
    where org_id = '0b000000-0000-4000-8000-000000000001'$$);
select pg_temp.chk_blind('acme hr: CANNOT see globex staff profiles',
  $$select count(*) from profiles
    where id = '0b000000-0000-4000-8000-000000000011'$$);

-- The single most important assertion in the file (this is the v1 leak).
select pg_temp.chk_blind('acme hr: CANNOT see globex CV objects',
  $$select count(*) from storage.objects
    where bucket_id = 'cvs'
      and name like '0b000000-0000-4000-8000-000000000001/%'$$);
select pg_temp.chk('acme hr: CAN see own CV objects',
  exists (select 1 from storage.objects
          where bucket_id = 'cvs'
            and name like '0a000000-0000-4000-8000-000000000001/%'));

-- Globex's published job stays visible — but only through the PUBLIC policy,
-- which is the intended marketplace behaviour, not a tenancy leak.
select pg_temp.chk('acme hr: sees globex published job only as a public visitor would',
  exists (select 1 from jobs where id = '0b000000-0000-4000-8000-0000000000b1')
  and not exists (select 1 from jobs where id = '0b000000-0000-4000-8000-0000000000b1'
                    and status = 'draft'));

-- ---- writes ----
select pg_temp.chk_denied('acme hr: CANNOT create a job in globex',
  $$insert into jobs (org_id, title, type, description, requirements)
    values ('0b000000-0000-4000-8000-000000000001','تسلل','full_time','د','م')$$);

select pg_temp.chk_rows('acme hr: CANNOT update a globex job',
  $$update jobs set title = 'مخترق'
    where id = '0b000000-0000-4000-8000-0000000000b1'$$, 0);

select pg_temp.chk_denied('acme hr: CANNOT change a globex application status',
  $$select public.change_application_status(
      '0b000000-0000-4000-8000-0000000000f1','accepted',null)$$);

-- RLS filters this through USING, so it reports "0 rows" rather than raising.
-- Silently affecting nothing is still a refusal; what matters is that the
-- other tenant's row is untouched.
select pg_temp.chk_rows('acme hr: CANNOT write interview data onto a globex application',
  $$update applications set interview_at = now()
    where id = '0b000000-0000-4000-8000-0000000000f1'$$, 0);

select public.change_application_status(
  '0a000000-0000-4000-8000-0000000000f1','under_review','ملاحظة');
select pg_temp.chk('acme hr: CAN change its own application status',
  (select status from applications where ref_code = 'ACME-001') = 'under_review');
select pg_temp.chk('acme hr: own status change was recorded with the note',
  exists (select 1 from status_history
          where application_id = '0a000000-0000-4000-8000-0000000000f1'
            and to_status = 'under_review'
            and note = 'ملاحظة'
            and org_id = '0a000000-0000-4000-8000-000000000001'));

-- ============================================================
-- ACME viewer — read-only inside its own tenant
-- ============================================================

select pg_temp.as_user('0a000000-0000-4000-8000-000000000012');

select pg_temp.chk('acme viewer: can read own applications',
  exists (select 1 from applications where ref_code = 'ACME-001'));
select pg_temp.chk_denied('acme viewer: CANNOT create a job',
  $$insert into jobs (org_id, title, type, description, requirements)
    values ('0a000000-0000-4000-8000-000000000001','ممنوع','full_time','د','م')$$);
select pg_temp.chk_denied('acme viewer: CANNOT change application status',
  $$select public.change_application_status(
      '0a000000-0000-4000-8000-0000000000f1','accepted',null)$$);

-- ============================================================
-- ACME owner vs admin — the owner ceiling on memberships
-- ============================================================

select pg_temp.as_user('0a000000-0000-4000-8000-000000000010');
select pg_temp.chk_rows('acme owner: can add a member',
  $$insert into memberships (org_id, user_id, role)
    values ('0a000000-0000-4000-8000-000000000001',
            '0c000000-0000-4000-8000-000000000010','hr')$$, 1);

-- Demote the newcomer's inviter path: an admin must not mint another owner.
reset role;
update memberships set role = 'admin'
where org_id = '0a000000-0000-4000-8000-000000000001'
  and user_id = '0c000000-0000-4000-8000-000000000010';

select pg_temp.as_user('0c000000-0000-4000-8000-000000000010');
select pg_temp.chk_denied('acme admin: CANNOT promote anyone to owner',
  $$update memberships set role = 'owner'
    where org_id = '0a000000-0000-4000-8000-000000000001'
      and user_id = '0a000000-0000-4000-8000-000000000011'$$);

-- ============================================================
-- Unaffiliated authenticated user — a logged-in stranger
-- ============================================================

reset role;
delete from memberships
where org_id = '0a000000-0000-4000-8000-000000000001'
  and user_id = '0c000000-0000-4000-8000-000000000010';

select pg_temp.as_user('0c000000-0000-4000-8000-000000000010');

select pg_temp.chk_blind('outsider: sees no applications at all',
  $$select count(*) from applications$$);
select pg_temp.chk_blind('outsider: sees no evaluations at all',
  $$select count(*) from ai_evaluations$$);
select pg_temp.chk_blind('outsider: sees no memberships at all',
  $$select count(*) from memberships$$);
select pg_temp.chk_blind('outsider: sees no CV objects at all',
  $$select count(*) from storage.objects where bucket_id = 'cvs'$$);
select pg_temp.chk_blind('outsider: sees no draft jobs',
  $$select count(*) from jobs where status = 'draft'$$);

-- ============================================================
-- anon — D15: the public may no longer write anything
-- ============================================================

set local role anon;
set local request.jwt.claims to '';

select pg_temp.chk('anon: sees published jobs of live orgs',
  exists (select 1 from jobs where id = '0a000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk_blind('anon: sees no draft jobs',
  $$select count(*) from jobs where status = 'draft'$$);
select pg_temp.chk_blind('anon: sees no applications',
  $$select count(*) from applications$$);
select pg_temp.chk_blind('anon: sees no memberships',
  $$select count(*) from memberships$$);
select pg_temp.chk_blind('anon: sees no CV objects',
  $$select count(*) from storage.objects where bucket_id = 'cvs'$$);

select pg_temp.chk_denied('anon: CANNOT insert an application (D15)',
  $$insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime)
    values ('0a000000-0000-4000-8000-0000000000a1','HACK-001','x','x@x.test',
            '+966','0a000000-0000-4000-8000-000000000001/x.pdf','application/pdf')$$);

select pg_temp.chk_denied('anon: CANNOT upload a CV object (D15)',
  $$insert into storage.objects (bucket_id, name, metadata)
    values ('cvs','0a000000-0000-4000-8000-000000000001/hack.pdf','{}')$$);

select pg_temp.chk_denied('anon: CANNOT create an organization',
  $$insert into organizations (slug, name) values ('hack','x')$$);

-- A suspended tenant disappears from the public surface immediately.
reset role;
update organizations set status = 'suspended'
where id = '0b000000-0000-4000-8000-000000000001';

set local role anon;
set local request.jwt.claims to '';
select pg_temp.chk_blind('anon: suspended org''s jobs are hidden',
  $$select count(*) from jobs
    where id = '0b000000-0000-4000-8000-0000000000b1'$$);
select pg_temp.chk_blind('anon: suspended org itself is hidden',
  $$select count(*) from organizations
    where id = '0b000000-0000-4000-8000-000000000001'$$);

reset role;
update organizations set status = 'active'
where id = '0b000000-0000-4000-8000-000000000001';

-- ============================================================
-- Platform admin — D13 and the Q6 conservative default
-- ============================================================

select pg_temp.as_user('0d000000-0000-4000-8000-000000000010');

select pg_temp.chk('platform admin: sees both organizations',
  (select count(*) from organizations
   where id in ('0a000000-0000-4000-8000-000000000001',
                '0b000000-0000-4000-8000-000000000001')) = 2);
select pg_temp.chk('platform admin: sees applications across tenants',
  (select count(*) from applications
   where ref_code in ('ACME-001','GLBX-001')) = 2);

-- Q6: support access must not extend to applicants' personal files.
select pg_temp.chk_blind('platform admin: CANNOT read CV objects',
  $$select count(*) from storage.objects where bucket_id = 'cvs'$$);

-- Read-only across tenants: no writing without an impersonation session.
select pg_temp.chk_denied('platform admin: CANNOT create a job in a tenant',
  $$insert into jobs (org_id, title, type, description, requirements)
    values ('0a000000-0000-4000-8000-000000000001','منصة','full_time','د','م')$$);

select pg_temp.chk('platform admin: has no org memberships of its own',
  (select cardinality(public.current_org_ids())) = 0);

-- ---- impersonation (D22) ----
reset role;
insert into impersonation_sessions (id, platform_user_id, org_id, reason)
values ('0d000000-0000-4000-8000-0000000000e1',
        '0d000000-0000-4000-8000-000000000010',
        '0a000000-0000-4000-8000-000000000001',
        'تشخيص بلاغ دعم فني');

select pg_temp.as_user('0d000000-0000-4000-8000-000000000010');
select pg_temp.chk('impersonation: grants the target org through current_org_ids()',
  '0a000000-0000-4000-8000-000000000001'
    = any (public.current_org_ids()));
select pg_temp.chk('impersonation: does NOT grant any other org',
  not ('0b000000-0000-4000-8000-000000000001'
    = any (public.current_org_ids())));
select pg_temp.chk_blind('impersonation: still CANNOT read CV objects',
  $$select count(*) from storage.objects where bucket_id = 'cvs'$$);

reset role;
update impersonation_sessions set ended_at = now()
where id = '0d000000-0000-4000-8000-0000000000e1';

select pg_temp.as_user('0d000000-0000-4000-8000-000000000010');
select pg_temp.chk('impersonation: access ends with the session',
  (select cardinality(public.current_org_ids())) = 0);

reset role;
update impersonation_sessions
set ended_at = null, expires_at = now() - interval '1 minute'
where id = '0d000000-0000-4000-8000-0000000000e1';

select pg_temp.as_user('0d000000-0000-4000-8000-000000000010');
select pg_temp.chk('impersonation: an expired session grants nothing',
  (select cardinality(public.current_org_ids())) = 0);

-- ============================================================
-- Structural guards
-- ============================================================

reset role;

-- A caller cannot file an application under an org that is not the job's.
insert into applications (org_id, job_id, ref_code, full_name, email, phone, cv_path, cv_mime)
values ('0b000000-0000-4000-8000-000000000001',
        '0a000000-0000-4000-8000-0000000000a1',
        'SPOOF-001','متقدم','spoof@app.test','+966500000003',
        '0a000000-0000-4000-8000-000000000001/spoof.pdf','application/pdf');
select pg_temp.chk('guard: a spoofed org_id is overwritten from the job',
  (select org_id from applications where ref_code = 'SPOOF-001')
    = '0a000000-0000-4000-8000-000000000001');

select pg_temp.chk_denied('guard: an org cannot lose its last owner',
  $$delete from memberships
    where org_id = '0b000000-0000-4000-8000-000000000001' and role = 'owner'$$);

select pg_temp.chk_denied('guard: a slug cannot shadow a platform route',
  $$insert into organizations (slug, name) values ('admin','x')$$);

select pg_temp.chk_rows('guard: deleting an org still cascades cleanly',
  $$delete from organizations
    where id = '0b000000-0000-4000-8000-000000000001'$$, 1);

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
    raise exception E'TENANT ISOLATION FAILED (% checks):\n  - %', v_failed, v_labels;
  end if;
  raise notice 'tenant isolation: all checks passed';
end $$;

rollback;
