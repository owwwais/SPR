-- billing.sql — 0025: plans, upgrade requests, invoices, and the two limits
-- (active jobs, seats) the pricing page sells.
--
-- Self-contained like tenant_isolation.sql: builds its own two tenants plus a
-- platform admin, asserts, and rolls back.

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

-- Passes when the statement raises the given SQLSTATE (or any refusal when
-- p_state is null).
create function pg_temp.chk_raises(p_label text, p_sql text, p_state text default null)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (label, pass) values (p_label, false);
exception when others then
  insert into t_results (label, pass)
  values (p_label, p_state is null or sqlstate = p_state);
end $$;

create function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claims to %L',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text);
end $$;

\o /dev/null

-- ---------- fixture ----------
insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000010','authenticated','authenticated','owner@north.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000011','authenticated','authenticated','admin@north.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','1a000000-0000-4000-8000-000000000012','authenticated','authenticated','hr@north.test',    now(), now()),
  ('00000000-0000-0000-0000-000000000000','1b000000-0000-4000-8000-000000000010','authenticated','authenticated','owner@south.test', now(), now()),
  ('00000000-0000-0000-0000-000000000000','1d000000-0000-4000-8000-000000000010','authenticated','authenticated','ops@platform.test',now(), now()),
  ('00000000-0000-0000-0000-000000000000','1e000000-0000-4000-8000-000000000010','authenticated','authenticated','new@signup.test',  now(), now());

insert into profiles (id, full_name) values
  ('1a000000-0000-4000-8000-000000000010','مالكة الشمال'),
  ('1a000000-0000-4000-8000-000000000011','مدير الشمال'),
  ('1a000000-0000-4000-8000-000000000012','موظفة الشمال'),
  ('1b000000-0000-4000-8000-000000000010','مالك الجنوب'),
  ('1d000000-0000-4000-8000-000000000010','تشغيل المنصة');

-- North starts on trial limits the way a signup would; South stays uncapped
-- (NULL), the way every pre-existing fixture organization does.
insert into organizations (id, slug, name, status) values
  ('1a000000-0000-4000-8000-000000000001','north-co','شركة الشمال','trial'),
  ('1b000000-0000-4000-8000-000000000001','south-co','شركة الجنوب','active');
update organizations set plan_code = 'trial', max_active_jobs = 1, max_seats = 3
where id = '1a000000-0000-4000-8000-000000000001';

insert into memberships (org_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000010','owner'),
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000011','admin'),
  ('1a000000-0000-4000-8000-000000000001','1a000000-0000-4000-8000-000000000012','hr'),
  ('1b000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000010','owner');

insert into platform_admins (user_id) values ('1d000000-0000-4000-8000-000000000010');

-- ---------- catalogue ----------
select pg_temp.chk('catalogue: four plans seeded with the published limits',
  (select count(*) from plans) = 4
  and (select max_active_jobs from plans where code = 'starter') = 3
  and (select max_seats from plans where code = 'growth') = 10
  and (select monthly_analysis_quota from plans where code = 'trial') = 25);

set local role anon;
set local request.jwt.claims to '';
select pg_temp.chk('anon: reads the public catalogue',
  (select count(*) from plans) = 4);
select pg_temp.chk_raises('anon: cannot call request_plan_change',
  $$select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'starter')$$);
reset role;

-- ---------- limits: active jobs ----------
insert into jobs (id, org_id, title, type, description, requirements, status) values
  ('1a000000-0000-4000-8000-0000000000a1','1a000000-0000-4000-8000-000000000001','الأولى','full_time','د','م','published'),
  ('1a000000-0000-4000-8000-0000000000a2','1a000000-0000-4000-8000-000000000001','الثانية','full_time','د','م','draft');

select pg_temp.as_user('1a000000-0000-4000-8000-000000000012');
select pg_temp.chk_raises('jobs: publishing past max_active_jobs raises HK001',
  $$update jobs set status = 'published' where id = '1a000000-0000-4000-8000-0000000000a2'$$, 'HK001');
select pg_temp.chk_raises('jobs: inserting a published job past the limit raises HK001',
  $$insert into jobs (org_id, title, type, description, requirements, status)
    values ('1a000000-0000-4000-8000-000000000001','ثالثة','full_time','د','م','published')$$, 'HK001');
update jobs set title = 'الأولى — معدّلة' where id = '1a000000-0000-4000-8000-0000000000a1';
select pg_temp.chk('jobs: editing an already-published job is not blocked',
  (select title from jobs where id = '1a000000-0000-4000-8000-0000000000a1') = 'الأولى — معدّلة');
update jobs set status = 'closed' where id = '1a000000-0000-4000-8000-0000000000a1';
update jobs set status = 'published' where id = '1a000000-0000-4000-8000-0000000000a2';
select pg_temp.chk('jobs: closing one frees the slot for another',
  (select status from jobs where id = '1a000000-0000-4000-8000-0000000000a2') = 'published');
reset role;

-- South has NULL limits: nothing is capped.
insert into jobs (org_id, title, type, description, requirements, status)
select '1b000000-0000-4000-8000-000000000001', 'جنوب ' || g, 'full_time', 'د', 'م', 'published'
from generate_series(1, 5) g;
select pg_temp.chk('jobs: an organization with NULL limits is uncapped',
  (select count(*) from jobs where org_id = '1b000000-0000-4000-8000-000000000001' and status = 'published') = 5);

-- ---------- limits: seats ----------
-- North: 3 members, max_seats 3.
select pg_temp.chk_raises('seats: an invitation past max_seats raises HK002',
  $$insert into invitations (org_id, email, role, token_hash)
    values ('1a000000-0000-4000-8000-000000000001','extra@north.test','hr','tok-north-1')$$, 'HK002');
insert into invitations (org_id, email, role, token_hash, expires_at)
values ('1a000000-0000-4000-8000-000000000001','late@north.test','hr','tok-north-2', now() - interval '1 day');
select pg_temp.chk('seats: an already-expired invitation holds no seat and is not refused',
  exists (select 1 from invitations where token_hash = 'tok-north-2'));
select pg_temp.chk_raises('seats: a membership past max_seats raises HK002',
  $$insert into memberships (org_id, user_id, role)
    values ('1a000000-0000-4000-8000-000000000001','1b000000-0000-4000-8000-000000000010','viewer')$$, 'HK002');

-- ---------- requests ----------
select pg_temp.as_user('1a000000-0000-4000-8000-000000000012');
select pg_temp.chk_raises('request: hr cannot request a plan change',
  $$select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'starter')$$, '42501');

select pg_temp.as_user('1a000000-0000-4000-8000-000000000011');
select pg_temp.chk_raises('request: trial cannot be requested',
  $$select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'trial')$$, '22023');
select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'starter');
select pg_temp.chk('request: admin can request; amount and 15% VAT are quoted',
  exists (select 1 from plan_requests
          where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'pending'
            and plan_code = 'starter' and amount_halalas = 29900 and vat_halalas = 4485));

select pg_temp.as_user('1a000000-0000-4000-8000-000000000010');
select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'growth');
select pg_temp.chk('request: a second request replaces the first',
  (select count(*) from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'pending') = 1
  and (select plan_code from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'pending') = 'growth'
  and (select count(*) from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'cancelled') = 1);
select pg_temp.chk('overview: owner sees usage, limits and the open request',
  (select (public.org_billing_overview('1a000000-0000-4000-8000-000000000001')
           -> 'pending_request' ->> 'plan_code')) = 'growth'
  and (select (public.org_billing_overview('1a000000-0000-4000-8000-000000000001')
               -> 'usage' ->> 'seats')::int) = 3);
select pg_temp.chk_raises('owner: cannot write plan_code directly',
  $$update organizations set plan_code = 'growth' where id = '1a000000-0000-4000-8000-000000000001'$$, '42501');
select pg_temp.chk_raises('owner: cannot raise its own seat limit',
  $$update organizations set max_seats = 99 where id = '1a000000-0000-4000-8000-000000000001'$$, '42501');
select pg_temp.chk_raises('owner: cannot insert an invoice',
  $$insert into invoices (org_id, number, plan_code, amount_halalas)
    values ('1a000000-0000-4000-8000-000000000001','INV-FAKE','growth',0)$$);
select pg_temp.chk_raises('owner: cannot approve its own request',
  $$update plan_requests set status = 'approved' where org_id = '1a000000-0000-4000-8000-000000000001'$$);
select pg_temp.chk_raises('owner: cannot call platform_apply_plan',
  $$select public.platform_apply_plan('1a000000-0000-4000-8000-000000000001', 'growth')$$, '42501');
select pg_temp.chk_raises('owner: cannot call platform_billing_overview',
  $$select public.platform_billing_overview()$$, '42501');

-- ---------- isolation ----------
select pg_temp.as_user('1b000000-0000-4000-8000-000000000010');
select pg_temp.chk('isolation: south cannot see north''s requests',
  (select count(*) from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001') = 0);
select pg_temp.chk_raises('isolation: south cannot read north''s billing overview',
  $$select public.org_billing_overview('1a000000-0000-4000-8000-000000000001')$$, '42501');
select pg_temp.chk_raises('isolation: south cannot request for north',
  $$select public.request_plan_change('1a000000-0000-4000-8000-000000000001', 'starter')$$, '42501');
select pg_temp.chk_raises('isolation: south cannot cancel north''s request',
  format($$select public.cancel_plan_request(%L)$$,
    (select id from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'pending')),
  'P0002');

-- ---------- platform ----------
select pg_temp.as_user('1d000000-0000-4000-8000-000000000010');
select pg_temp.chk('platform: overview lists organizations with the pending request first',
  (select (public.platform_billing_overview() -> 0 ->> 'id')) = '1a000000-0000-4000-8000-000000000001');
select public.platform_confirm_request(
  (select id from plan_requests where org_id = '1a000000-0000-4000-8000-000000000001' and status = 'pending'),
  'TRF-88213');
select pg_temp.chk('platform: confirming issues a paid invoice and applies the plan',
  exists (select 1 from invoices where org_id = '1a000000-0000-4000-8000-000000000001'
          and status = 'paid' and plan_code = 'growth' and amount_halalas = 79900
          and vat_halalas = 11985 and provider_payment_id = 'TRF-88213' and number like 'INV-%')
  and (select plan_code from organizations where id = '1a000000-0000-4000-8000-000000000001') = 'growth'
  and (select max_active_jobs from organizations where id = '1a000000-0000-4000-8000-000000000001') = 15
  and (select max_seats from organizations where id = '1a000000-0000-4000-8000-000000000001') = 10
  and (select monthly_analysis_quota from organizations where id = '1a000000-0000-4000-8000-000000000001') = 750
  and (select status from organizations where id = '1a000000-0000-4000-8000-000000000001') = 'active'
  and (select current_period_end > now() from subscriptions where org_id = '1a000000-0000-4000-8000-000000000001'));
select pg_temp.chk('platform: every billing step is in the audit log',
  (select count(*) from audit_log where org_id = '1a000000-0000-4000-8000-000000000001'
     and action in ('plan.request', 'payment.confirm')) = 3);
select public.platform_apply_plan('1b000000-0000-4000-8000-000000000001', 'starter', 'trying plans');
select pg_temp.chk('platform: applying a plan directly sets its limits without an invoice',
  (select max_active_jobs from organizations where id = '1b000000-0000-4000-8000-000000000001') = 3
  and not exists (select 1 from invoices where org_id = '1b000000-0000-4000-8000-000000000001'));
select public.platform_set_limits('1b000000-0000-4000-8000-000000000001', 500, 20, null, 50);
select pg_temp.chk('platform: per-organization override (enterprise deal, interviews on)',
  (select monthly_interview_quota from organizations where id = '1b000000-0000-4000-8000-000000000001') = 20
  and (select max_active_jobs from organizations where id = '1b000000-0000-4000-8000-000000000001') is null);
reset role;

-- North (now growth) can invite again.
insert into invitations (org_id, email, role, token_hash)
values ('1a000000-0000-4000-8000-000000000001','extra@north.test','hr','tok-north-3');
select pg_temp.chk('seats: after the upgrade the invitation goes through',
  exists (select 1 from invitations where token_hash = 'tok-north-3'));

-- ---------- signup ----------
select pg_temp.as_user('1e000000-0000-4000-8000-000000000010');
select public.create_organization('شركة جديدة', 'fresh-co', 'مستخدم جديد');
reset role;
select pg_temp.chk('signup: a new organization starts on the trial limits',
  (select max_active_jobs = 1 and max_seats = 2 and monthly_analysis_quota = 25 and plan_code = 'trial'
   from organizations where slug = 'fresh-co'));

\o
select id, label, pass from t_results order by id;
select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total
from t_results;

do $$
begin
  if exists (select 1 from t_results where not pass) then
    raise exception 'billing: % check(s) failed',
      (select count(*) from t_results where not pass);
  end if;
  raise notice 'billing: all checks passed';
end $$;

rollback;
