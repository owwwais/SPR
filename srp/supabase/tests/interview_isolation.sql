-- interview_isolation.sql — I0 acceptance for 0019 (D30, the isolation
-- invariant): interview records are readable only inside their own
-- organization, writable by no client role, and filed under the right
-- tenant even when the writer passes the wrong one.
--
-- Self-contained like tenant_isolation.sql: builds its own two-tenant
-- fixture, asserts on specific ids, rolls back.
--
--   psql "$DATABASE_URL" -f supabase/tests/interview_isolation.sql

\set ON_ERROR_STOP on
\set QUIET on

begin;

create temp table t_results (id serial primary key, label text, pass boolean);
grant all on t_results to anon, authenticated;
grant all on sequence t_results_id_seq to anon, authenticated;

create function pg_temp.chk(p_label text, p_pass boolean)
returns void language sql as $$
  insert into t_results (label, pass) values (p_label, p_pass);
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

create function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims to %L',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text
  );
end $$;

\o /dev/null

-- ============================================================
-- Fixture
-- ============================================================

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000011','authenticated','authenticated','hr@acme-i.test',     now(), now()),
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000012','authenticated','authenticated','viewer@acme-i.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','1b000000-0000-4000-8000-000000000011','authenticated','authenticated','hr@globex-i.test',   now(), now()),
  ('00000000-0000-0000-0000-000000000000','1c000000-0000-4000-8000-000000000010','authenticated','authenticated','nobody@i.test',      now(), now());

insert into profiles (id, full_name) values
  ('1a000000-0000-4000-8000-000000000011','موظفة أكمي'),
  ('1a000000-0000-4000-8000-000000000012','مشاهد أكمي'),
  ('1b000000-0000-4000-8000-000000000011','موظف جلوبكس'),
  ('1c000000-0000-4000-8000-000000000010','شخص خارجي');

insert into organizations (id, slug, name, status) values
  ('1a000000-0000-4000-8000-000000000001','acme-i',  'أكمي',   'active'),
  ('1b000000-0000-4000-8000-000000000001','globex-i','جلوبكس', 'active');

-- Owners first: every org must keep one (enforce_org_has_owner).
insert into memberships (org_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000011','owner'),
  ('1b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000011','owner');
insert into memberships (org_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000012','viewer');

insert into jobs (id, org_id, title, type, description, requirements, status) values
  ('1a000000-0000-4000-8000-0000000000a1','1a000000-0000-4000-8000-000000000001','وظيفة أكمي','full_time','د','م','published'),
  ('1b000000-0000-4000-8000-0000000000b1','1b000000-0000-4000-8000-000000000001','وظيفة جلوبكس','full_time','د','م','published');

insert into applications (id, job_id, ref_code, full_name, email, phone, cv_path, cv_mime) values
  ('1a000000-0000-4000-8000-0000000000f1','1a000000-0000-4000-8000-0000000000a1','IACME-001','متقدم أكمي','ia@app.test','+966500000011','x/a.pdf','application/pdf'),
  ('1b000000-0000-4000-8000-0000000000f1','1b000000-0000-4000-8000-0000000000b1','IGLBX-001','متقدم جلوبكس','ib@app.test','+966500000012','x/b.pdf','application/pdf');

-- Written the way a buggy writer might: acme's assignment filed with
-- globex's org_id. The trigger must correct it from the application.
insert into interview_assignments (id, org_id, application_id, modes, question_count, duration_minutes, config) values
  ('1a000000-0000-4000-8000-00000000e001','1b000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-0000000000f1', array['text'], 10, 30, '{}'),
  ('1b000000-0000-4000-8000-00000000e001','1b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-0000000000f1', array['text','voice'], 8, 20, '{}');

insert into interview_reports (assignment_id, org_id, overall_score, confidence, report) values
  ('1a000000-0000-4000-8000-00000000e001','1b000000-0000-4000-8000-000000000001', 74, 'medium', '{}'),
  ('1b000000-0000-4000-8000-00000000e001','1b000000-0000-4000-8000-000000000001', 61, 'high', '{}');

insert into interview_webhook_events (event_id, type, external_interview_id) values
  (gen_random_uuid(), 'interview.cancelled', gen_random_uuid());

-- ============================================================
-- Consistency guards
-- ============================================================

select pg_temp.chk('trigger: assignment org_id comes from the application, not the writer',
  (select org_id from interview_assignments where id = '1a000000-0000-4000-8000-00000000e001')
    = '1a000000-0000-4000-8000-000000000001');

select pg_temp.chk('trigger: report org_id comes from its assignment',
  (select org_id from interview_reports where assignment_id = '1a000000-0000-4000-8000-00000000e001')
    = '1a000000-0000-4000-8000-000000000001');

select pg_temp.chk_denied('one live interview per application',
  $q$insert into interview_assignments (application_id, modes, question_count, duration_minutes, config)
     values ('1a000000-0000-4000-8000-0000000000f1', array['text'], 10, 30, '{}')$q$);

update interview_assignments set status = 'cancelled' where id = '1a000000-0000-4000-8000-00000000e001';
insert into interview_assignments (id, application_id, modes, question_count, duration_minutes, config)
values ('1a000000-0000-4000-8000-00000000e002','1a000000-0000-4000-8000-0000000000f1', array['voice'], 6, 15, '{}');
select pg_temp.chk('a cancelled interview may be followed by a new one',
  exists (select 1 from interview_assignments where id = '1a000000-0000-4000-8000-00000000e002'));

select pg_temp.chk_denied('modes outside text/voice are refused',
  $q$insert into interview_assignments (application_id, modes, question_count, duration_minutes, config)
     values ('1b000000-0000-4000-8000-0000000000f1', array['video'], 10, 30, '{}')$q$);

-- chk_denied runs each attempt in its own savepoint; the refused inserts
-- must have left nothing behind.
select pg_temp.chk('refused writes left no rows', (select count(*) from interview_assignments) = 3);

-- ============================================================
-- Reads
-- ============================================================

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk('acme staff see acme assignments',
  (select count(*) from interview_assignments where org_id = '1a000000-0000-4000-8000-000000000001') = 2);
select pg_temp.chk_blind('acme staff cannot see globex assignments',
  $q$select count(*) from interview_assignments where id = '1b000000-0000-4000-8000-00000000e001'$q$);
select pg_temp.chk_blind('acme staff cannot see globex reports',
  $q$select count(*) from interview_reports where assignment_id = '1b000000-0000-4000-8000-00000000e001'$q$);
select pg_temp.chk_blind('staff cannot read the webhook ledger',
  $q$select count(*) from interview_webhook_events$q$);
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000012');
select pg_temp.chk('acme viewer reads acme reports',
  (select count(*) from interview_reports where org_id = '1a000000-0000-4000-8000-000000000001') = 1);
reset role;

select pg_temp.as_user('1b000000-0000-4000-8000-000000000011');
select pg_temp.chk_blind('globex staff cannot see acme assignments',
  $q$select count(*) from interview_assignments where application_id = '1a000000-0000-4000-8000-0000000000f1'$q$);
select pg_temp.chk_blind('globex staff cannot see acme reports',
  $q$select count(*) from interview_reports where org_id = '1a000000-0000-4000-8000-000000000001'$q$);
reset role;

select pg_temp.as_user('1c000000-0000-4000-8000-000000000010');
select pg_temp.chk_blind('a user with no membership sees no assignments',
  $q$select count(*) from interview_assignments$q$);
select pg_temp.chk_blind('a user with no membership sees no reports',
  $q$select count(*) from interview_reports$q$);
reset role;

set local role anon;
select pg_temp.chk_blind('anon sees no assignments', $q$select count(*) from interview_assignments$q$);
select pg_temp.chk_blind('anon sees no reports', $q$select count(*) from interview_reports$q$);
reset role;

-- ============================================================
-- Writes — none for any client role (service role only)
-- ============================================================

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('staff cannot insert an assignment directly',
  $q$insert into interview_assignments (application_id, modes, question_count, duration_minutes, config)
     values ('1a000000-0000-4000-8000-0000000000f1', array['text'], 10, 30, '{}')$q$);
select pg_temp.chk_denied('staff cannot change an assignment status directly',
  $q$update interview_assignments set status = 'evaluated' where id = '1a000000-0000-4000-8000-00000000e002'$q$);
select pg_temp.chk_denied('staff cannot write a report',
  $q$update interview_reports set overall_score = 100 where org_id = '1a000000-0000-4000-8000-000000000001'$q$);
select pg_temp.chk_denied('staff cannot delete an assignment',
  $q$delete from interview_assignments where id = '1a000000-0000-4000-8000-00000000e002'$q$);
reset role;

set local role anon;
select pg_temp.chk_denied('anon cannot insert an assignment',
  $q$insert into interview_assignments (application_id, modes, question_count, duration_minutes, config)
     values ('1a000000-0000-4000-8000-0000000000f1', array['text'], 10, 30, '{}')$q$);
select pg_temp.chk_denied('anon cannot write the webhook ledger',
  $q$insert into interview_webhook_events (event_id, type, external_interview_id)
     values (gen_random_uuid(), 'x', gen_random_uuid())$q$);
reset role;

-- ============================================================
-- Webhook events: exactly once, newest wins, both ids required
-- ============================================================

update interview_assignments
set external_interview_id = '2b000000-0000-4000-8000-0000000000aa', status_at = '2026-10-16 10:00+00'
where id = '1b000000-0000-4000-8000-00000000e001';

-- Separate statements: a subquery in the same SELECT would read the
-- statement's starting snapshot and miss the function's own update.
select pg_temp.chk('event: a newer event is applied',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000001', 'interview.cancelled',
    '2b000000-0000-4000-8000-0000000000aa', '1b000000-0000-4000-8000-00000000e001',
    'cancelled', '2026-10-16 10:05+00') = 'applied');
select pg_temp.chk('event: the applied status is stored',
  (select status from interview_assignments where id = '1b000000-0000-4000-8000-00000000e001') = 'cancelled');

select pg_temp.chk('event: the same event again is a duplicate',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000001', 'interview.cancelled',
    '2b000000-0000-4000-8000-0000000000aa', '1b000000-0000-4000-8000-00000000e001',
    'cancelled', '2026-10-16 10:05+00') = 'duplicate');

select pg_temp.chk('event: an older event arriving late is stale',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000002', 'interview.planned',
    '2b000000-0000-4000-8000-0000000000aa', '1b000000-0000-4000-8000-00000000e001',
    'awaiting_review', '2026-10-16 10:01+00') = 'stale');
select pg_temp.chk('event: the stale event did not overwrite the newer status',
  (select status from interview_assignments where id = '1b000000-0000-4000-8000-00000000e001') = 'cancelled');

select pg_temp.chk('event: a matching interview id with the wrong assignment is unknown',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000003', 'interview.failed',
    '2b000000-0000-4000-8000-0000000000aa', '1a000000-0000-4000-8000-00000000e002',
    'failed', '2026-10-16 11:00+00') = 'unknown');

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('staff cannot call apply_interview_event',
  $q$select public.apply_interview_event(gen_random_uuid(), 'x', gen_random_uuid(),
     '1a000000-0000-4000-8000-00000000e002', 'evaluated', now())$q$);
reset role;

select pg_temp.chk('rls: every interview table has row level security enabled',
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('interview_assignments','interview_reports','interview_webhook_events')
      and relnamespace = 'public'::regnamespace));

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
    raise exception E'INTERVIEW ISOLATION FAILED (% checks):\n  - %', v_failed, v_labels;
  end if;
  raise notice 'interview isolation: all checks passed';
end $$;

rollback;
