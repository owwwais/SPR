-- interview_isolation.sql — I0 acceptance for 0019 and I1 acceptance for
-- 0021 (D30, D33, the isolation invariant): interview records and question
-- banks are readable only inside their own organization, writable by no
-- client role, and filed under the right tenant even when the writer passes
-- the wrong one; only owner/admin/hr of a job's org may manage its bank; and
-- no tenant can raise its own interview allowance.
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

-- The race on create: the agent's first event can arrive before the gateway
-- has stored the agent's id. A signed event naming an unbound assignment
-- binds it — unless that interview id is already bound elsewhere (above).
select pg_temp.chk('event: an event for an unbound assignment binds the agent id and applies',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000004', 'interview.planned',
    '2b000000-0000-4000-8000-0000000000bb', '1a000000-0000-4000-8000-00000000e002',
    'awaiting_review', now() + interval '1 minute') = 'applied');
select pg_temp.chk('event: the bound id and the status are stored',
  (select external_interview_id = '2b000000-0000-4000-8000-0000000000bb' and status = 'awaiting_review'
   from interview_assignments where id = '1a000000-0000-4000-8000-00000000e002'));

-- ...but a create the gateway already gave up on stays given up: a late
-- event never revives a failed assignment beside a newer one.
insert into interview_assignments (id, application_id, status, modes, question_count, duration_minutes, config)
values ('1b000000-0000-4000-8000-00000000e003','1b000000-0000-4000-8000-0000000000f1', 'failed', array['text'], 8, 20, '{}');
select pg_temp.chk('event: a late event for a failed, unbound assignment is not applied',
  public.apply_interview_event('3b000000-0000-4000-8000-000000000005', 'interview.planned',
    '2b000000-0000-4000-8000-0000000000cc', '1b000000-0000-4000-8000-00000000e003',
    'awaiting_review', now() + interval '1 minute') = 'unknown');
select pg_temp.chk('event: the failed assignment stays failed and unbound',
  (select status = 'failed' and external_interview_id is null
   from interview_assignments where id = '1b000000-0000-4000-8000-00000000e003'));

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('staff cannot call apply_interview_event',
  $q$select public.apply_interview_event(gen_random_uuid(), 'x', gen_random_uuid(),
     '1a000000-0000-4000-8000-00000000e002', 'evaluated', now())$q$);
reset role;

select pg_temp.chk('rls: every interview table has row level security enabled',
  (select bool_and(relrowsecurity) from pg_class
    where relname in ('interview_assignments','interview_reports','interview_webhook_events',
                      'interview_job_banks')
      and relnamespace = 'public'::regnamespace));

-- ============================================================
-- I1 (0021): question banks, can_manage_job, the interview allowance
-- ============================================================

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000013','authenticated','authenticated','hr2@acme-i.test',   now(), now()),
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000014','authenticated','authenticated','admin@acme-i.test', now(), now());

insert into profiles (id, full_name) values
  ('1a000000-0000-4000-8000-000000000013','موظف موارد أكمي'),
  ('1a000000-0000-4000-8000-000000000014','مدير أكمي');

insert into memberships (org_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000013','hr'),
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000014','admin');

-- a2 is soft-deleted; a3 is a second live acme job.
insert into jobs (id, org_id, title, type, description, requirements, status, deleted_at) values
  ('1a000000-0000-4000-8000-0000000000a2','1a000000-0000-4000-8000-000000000001','وظيفة محذوفة','full_time','د','م','closed', now()),
  ('1a000000-0000-4000-8000-0000000000a3','1a000000-0000-4000-8000-000000000001','وظيفة أكمي الثانية','full_time','د','م','published', null);

-- c1 is written the way a buggy writer might: acme's job, globex's org_id.
insert into interview_job_banks (id, org_id, job_id, status) values
  ('1a000000-0000-4000-8000-0000000000c1','1b000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-0000000000a1','awaiting_review');
insert into interview_job_banks (id, job_id, status, bank_hash, locked_at) values
  ('1a000000-0000-4000-8000-0000000000c3','1a000000-0000-4000-8000-0000000000a3','locked', repeat('c', 64), now()),
  ('1b000000-0000-4000-8000-0000000000c1','1b000000-0000-4000-8000-0000000000b1','locked', repeat('b', 64), now());

select pg_temp.chk('bank trigger: org_id comes from the job, not the writer',
  (select org_id from interview_job_banks where id = '1a000000-0000-4000-8000-0000000000c1')
    = '1a000000-0000-4000-8000-000000000001');

select pg_temp.chk_denied('one in-progress bank per job',
  $q$insert into interview_job_banks (job_id, version, status)
     values ('1a000000-0000-4000-8000-0000000000a1', 2, 'generating')$q$);

select pg_temp.chk_denied('a job cannot have the same bank version twice',
  $q$insert into interview_job_banks (job_id, version, status)
     values ('1a000000-0000-4000-8000-0000000000a3', 1, 'failed')$q$);

select pg_temp.chk_denied('a locked bank must carry its hash and lock time',
  $q$insert into interview_job_banks (job_id, version, status)
     values ('1a000000-0000-4000-8000-0000000000a3', 2, 'locked')$q$);

select pg_temp.chk_denied('a bank hash must be 64 hex characters',
  $q$update interview_job_banks set bank_hash = 'not-a-hash'
     where id = '1a000000-0000-4000-8000-0000000000c3'$q$);

select pg_temp.chk('refused bank writes left no rows', (select count(*) from interview_job_banks) = 3);

update interview_job_banks
set status = 'locked', bank_hash = repeat('a', 64), locked_at = now()
where id = '1a000000-0000-4000-8000-0000000000c1';
insert into interview_job_banks (id, job_id, version, status) values
  ('1a000000-0000-4000-8000-0000000000c2','1a000000-0000-4000-8000-0000000000a1', 2, 'generating');
select pg_temp.chk('once a bank is locked, the job may start its next version',
  exists (select 1 from interview_job_banks where id = '1a000000-0000-4000-8000-0000000000c2'));

-- An interview is built only on a locked bank of its own application's job.
-- e002 is acme's live assignment for application f1 (job a1).
select pg_temp.chk_denied('an interview cannot use another job''s bank, even in its own org',
  $q$update interview_assignments set job_bank_id = '1a000000-0000-4000-8000-0000000000c3'
     where id = '1a000000-0000-4000-8000-00000000e002'$q$);
select pg_temp.chk_denied('an interview cannot use another organization''s bank',
  $q$update interview_assignments set job_bank_id = '1b000000-0000-4000-8000-0000000000c1'
     where id = '1a000000-0000-4000-8000-00000000e002'$q$);
select pg_temp.chk_denied('an interview cannot use a bank that is not locked',
  $q$update interview_assignments set job_bank_id = '1a000000-0000-4000-8000-0000000000c2'
     where id = '1a000000-0000-4000-8000-00000000e002'$q$);
update interview_assignments set job_bank_id = '1a000000-0000-4000-8000-0000000000c1'
where id = '1a000000-0000-4000-8000-00000000e002';
select pg_temp.chk('an interview can use its job''s locked bank',
  (select job_bank_id from interview_assignments where id = '1a000000-0000-4000-8000-00000000e002')
    = '1a000000-0000-4000-8000-0000000000c1');

-- ---------- reads ----------

select pg_temp.as_user('1a000000-0000-4000-8000-000000000013');
select pg_temp.chk('acme hr reads acme banks',
  (select count(*) from interview_job_banks where org_id = '1a000000-0000-4000-8000-000000000001') = 3);
select pg_temp.chk_blind('acme hr cannot see globex banks',
  $q$select count(*) from interview_job_banks where id = '1b000000-0000-4000-8000-0000000000c1'$q$);
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000012');
select pg_temp.chk('acme viewer reads acme banks',
  (select count(*) from interview_job_banks where org_id = '1a000000-0000-4000-8000-000000000001') = 3);
select pg_temp.chk_blind('acme viewer cannot see globex banks',
  $q$select count(*) from interview_job_banks where org_id = '1b000000-0000-4000-8000-000000000001'$q$);
reset role;

select pg_temp.as_user('1b000000-0000-4000-8000-000000000011');
select pg_temp.chk_blind('globex staff cannot see acme banks',
  $q$select count(*) from interview_job_banks where job_id = '1a000000-0000-4000-8000-0000000000a1'$q$);
reset role;

select pg_temp.as_user('1c000000-0000-4000-8000-000000000010');
select pg_temp.chk_blind('a user with no membership sees no banks',
  $q$select count(*) from interview_job_banks$q$);
reset role;

set local role anon;
select pg_temp.chk_blind('anon sees no banks', $q$select count(*) from interview_job_banks$q$);
reset role;

-- ---------- writes: none for any client role ----------

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('an owner cannot insert a bank directly',
  $q$insert into interview_job_banks (job_id, version, status)
     values ('1a000000-0000-4000-8000-0000000000a3', 2, 'generating')$q$);
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000014');
select pg_temp.chk_denied('an admin cannot change a bank directly',
  $q$update interview_job_banks set status = 'failed'
     where id = '1a000000-0000-4000-8000-0000000000c2'$q$);
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000013');
select pg_temp.chk_denied('hr cannot delete a bank',
  $q$delete from interview_job_banks where id = '1a000000-0000-4000-8000-0000000000c2'$q$);
reset role;

set local role anon;
select pg_temp.chk_denied('anon cannot insert a bank',
  $q$insert into interview_job_banks (job_id, version, status)
     values ('1a000000-0000-4000-8000-0000000000a3', 2, 'generating')$q$);
reset role;

select pg_temp.chk('refused client writes left the banks as they were',
  (select count(*) from interview_job_banks) = 4
  and (select status from interview_job_banks where id = '1a000000-0000-4000-8000-0000000000c2') = 'generating');

-- ---------- can_manage_job ----------

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk('can_manage_job: owner of the job''s org',
  public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
select pg_temp.chk('can_manage_job: not for a deleted job',
  not public.can_manage_job('1a000000-0000-4000-8000-0000000000a2'));
select pg_temp.chk('can_manage_job: not for a job that does not exist',
  not public.can_manage_job('1a000000-0000-4000-8000-0000000000a9'));
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000014');
select pg_temp.chk('can_manage_job: admin of the job''s org',
  public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000013');
select pg_temp.chk('can_manage_job: hr of the job''s org',
  public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000012');
select pg_temp.chk('can_manage_job: not for a viewer',
  not public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
reset role;

select pg_temp.as_user('1b000000-0000-4000-8000-000000000011');
select pg_temp.chk('can_manage_job: not for another org''s owner',
  not public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
reset role;

select pg_temp.as_user('1c000000-0000-4000-8000-000000000010');
select pg_temp.chk('can_manage_job: not for a user with no membership',
  not public.can_manage_job('1a000000-0000-4000-8000-0000000000a1'));
reset role;

set local role anon;
select pg_temp.chk_denied('can_manage_job: anon may not call it',
  $q$select public.can_manage_job('1a000000-0000-4000-8000-0000000000a1')$q$);
reset role;

-- ---------- the interview allowance (D33) ----------

insert into organizations (id, slug, name) values
  ('1d000000-0000-4000-8000-000000000001','fresh-i','جديدة');
select pg_temp.chk('quota: a new organization has no interviews until its plan sets them',
  (select monthly_interview_quota from organizations where id = '1d000000-0000-4000-8000-000000000001') = 0);

select pg_temp.chk_denied('quota: a negative allowance is refused',
  $q$update organizations set monthly_interview_quota = -1
     where id = '1a000000-0000-4000-8000-000000000001'$q$);

update organizations set monthly_interview_quota = 20
where id = '1a000000-0000-4000-8000-000000000001';

select pg_temp.chk('quota: no client role holds UPDATE on monthly_interview_quota',
  not has_column_privilege('authenticated', 'public.organizations', 'monthly_interview_quota', 'UPDATE')
  and not has_column_privilege('anon', 'public.organizations', 'monthly_interview_quota', 'UPDATE'));

select pg_temp.as_user('1a000000-0000-4000-8000-000000000014');
select pg_temp.chk_denied('quota: an org admin cannot raise the interview allowance',
  $q$update organizations set monthly_interview_quota = 100000
     where id = '1a000000-0000-4000-8000-000000000001'$q$);
-- Control: the same admin CAN update an ordinary column, so the refusal
-- above is the column grant, not RLS hiding the row.
update organizations set about = 'نبذة محدثة' where id = '1a000000-0000-4000-8000-000000000001';
reset role;

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_denied('quota: an org owner cannot change the interview allowance',
  $q$update organizations set monthly_interview_quota = null
     where id = '1a000000-0000-4000-8000-000000000001'$q$);
reset role;

select pg_temp.chk('quota: the allowance is unchanged and the ordinary update went through',
  (select monthly_interview_quota = 20 and about = 'نبذة محدثة'
     from organizations where id = '1a000000-0000-4000-8000-000000000001'));

-- ---------- erasure ----------

delete from interview_job_banks where id = '1a000000-0000-4000-8000-0000000000c1';
select pg_temp.chk('deleting a bank keeps the interview and clears its bank reference',
  (select job_bank_id is null from interview_assignments where id = '1a000000-0000-4000-8000-00000000e002'));

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
