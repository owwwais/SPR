-- 0025_billing.sql — plans, upgrade requests, invoices, and the limits the
-- pricing page already sells ("S5-short", PRODUCT-READINESS-PROPOSAL §2.4).
--
-- Until now only the analysis quota was enforced. The pricing page also sells
-- 1/3/15 active jobs and 2/3/10 users per plan; nothing checked either, so the
-- plans differed in one number and nobody could change plan without SQL.
--
-- Shape follows docs/SAAS_PLAN.md (plans, subscriptions, invoices, audit_log).
-- Payment follows D20: manual bank transfer first. An owner REQUESTS a plan;
-- a platform admin confirms the transfer, which issues the invoice and applies
-- the plan. Invoices exist only for money actually received, so their numbers
-- run without gaps from abandoned requests.
--
-- The enforced values stay on `organizations` (where 0014/0021 already keep
-- the analysis and interview quotas), copied from the plan when it is
-- applied. That keeps every existing enforcement path unchanged and lets a
-- platform admin override one organization (an enterprise deal, a test).
-- NULL means no ceiling, as in 0014.

-- ============================================================
-- Catalogue
-- ============================================================
create table plans (
  code                    text primary key check (code ~ '^[a-z_]{2,20}$'),
  name_ar                 text not null,
  price_monthly_halalas   int  not null default 0 check (price_monthly_halalas >= 0),
  -- 0 = not offered yearly. Nothing is sold yearly yet.
  price_yearly_halalas    int  not null default 0 check (price_yearly_halalas >= 0),
  max_active_jobs         int  check (max_active_jobs is null or max_active_jobs >= 0),
  max_seats               int  check (max_seats is null or max_seats >= 1),
  monthly_analysis_quota  int  check (monthly_analysis_quota is null or monthly_analysis_quota >= 0),
  -- D33: interviews are their own unit. 0 everywhere until the owner sets
  -- the numbers — the same default 0021 gives organizations.
  monthly_interview_quota int  default 0 check (monthly_interview_quota is null or monthly_interview_quota >= 0),
  custom_domain           boolean not null default false,
  remove_branding         boolean not null default false,
  api_access              boolean not null default false,
  -- false: shown, but reached by asking (enterprise), not by a priced request.
  self_serve              boolean not null default true,
  is_public               boolean not null default true,
  sort_order              int not null default 0
);

comment on table plans is
  'The plan catalogue. Values mirror /pricing (lib/i18n/ar.ts pricing.plans); change both together. Applied to an organization by apply_plan_limits().';

insert into plans (code, name_ar, price_monthly_halalas, max_active_jobs, max_seats,
                   monthly_analysis_quota, custom_domain, remove_branding, api_access,
                   self_serve, sort_order) values
  ('trial',      'تجربة',     0,     1,    2,    25,   false, false, false, false, 0),
  ('starter',    'الأساسية',  29900, 3,    3,    150,  false, false, false, true,  1),
  ('growth',     'النمو',     79900, 15,   10,   750,  true,  true,  false, true,  2),
  ('enterprise', 'المؤسسات',  0,     null, null, null, true,  true,  true,  false, 3);

alter table plans enable row level security;

-- The catalogue is public: /pricing and the upgrade screen both read it.
create policy plans_public_select on plans
  for select to anon, authenticated
  using (is_public);

create policy plans_platform_select on plans
  for select to authenticated
  using ((select public.is_platform_admin()));

revoke insert, update, delete on plans from anon, authenticated;

-- Existing rows may carry a plan_code typed by hand. NOT VALID: enforce for
-- every write from now on without failing this migration over old data.
alter table organizations
  add constraint organizations_plan_code_fkey
  foreign key (plan_code) references plans(code) not valid;

-- ============================================================
-- The two limits nobody enforced
-- ============================================================
alter table organizations
  add column if not exists max_active_jobs int
    check (max_active_jobs is null or max_active_jobs >= 0),
  add column if not exists max_seats int
    check (max_seats is null or max_seats >= 1);

comment on column organizations.max_active_jobs is
  'Published, non-deleted jobs allowed at once. NULL = uncapped. Copied from plans by apply_plan_limits().';
comment on column organizations.max_seats is
  'Members plus live pending invitations allowed. NULL = uncapped. Copied from plans by apply_plan_limits().';

-- Existing organizations get their plan's limits. Rows already above them
-- are left alone — the triggers below stop the NEXT publish or invitation,
-- they never unpublish a job or remove a member.
update organizations o
set max_active_jobs = p.max_active_jobs,
    max_seats = p.max_seats
from plans p
where p.code = o.plan_code
  and o.max_active_jobs is null
  and o.max_seats is null;

-- Same guard 0021 keeps for the interview quota: no client role may write a
-- limit. The column grants in 0006 already exclude these; this proves it.
do $$
begin
  if has_column_privilege('authenticated', 'public.organizations', 'max_active_jobs', 'UPDATE')
     or has_column_privilege('authenticated', 'public.organizations', 'max_seats', 'UPDATE')
     or has_column_privilege('authenticated', 'public.organizations', 'plan_code', 'UPDATE')
     or has_column_privilege('authenticated', 'public.organizations', 'monthly_analysis_quota', 'UPDATE')
  then
    raise exception 'plan limits must not be writable by a client role';
  end if;
end $$;

-- ============================================================
-- Subscriptions, requests, invoices, audit
-- ============================================================
create table subscriptions (
  org_id               uuid primary key references organizations(id) on delete cascade,
  plan_code            text not null references plans(code),
  billing_cycle        text not null default 'monthly'
                         check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz not null default now(),
  -- NULL: applied without a paid period (trial, a manual deal, a test).
  current_period_end   timestamptz,
  provider             text not null default 'manual'
                         check (provider in ('manual', 'moyasar', 'tap')),
  updated_at           timestamptz not null default now()
);

create table plan_requests (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  plan_code      text not null references plans(code),
  billing_cycle  text not null default 'monthly'
                   check (billing_cycle in ('monthly', 'yearly')),
  -- Quoted when requested, so a later price change does not move it.
  amount_halalas int not null check (amount_halalas >= 0),
  vat_halalas    int not null default 0 check (vat_halalas >= 0),
  -- What the owner writes on the bank transfer.
  reference      text not null unique,
  status         text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_by   uuid references auth.users(id) on delete set null,
  decided_by     uuid references auth.users(id) on delete set null,
  decided_at     timestamptz,
  note           text check (note is null or length(note) <= 500),
  created_at     timestamptz not null default now()
);

-- One open request per organization; a new one replaces it.
create unique index plan_requests_one_pending
  on plan_requests (org_id) where status = 'pending';
create index plan_requests_org_idx on plan_requests (org_id, created_at desc);

create sequence invoice_number_seq;

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  number              text not null unique,
  plan_code           text not null references plans(code),
  request_id          uuid references plan_requests(id) on delete set null,
  amount_halalas      int not null check (amount_halalas >= 0),
  vat_halalas         int not null default 0 check (vat_halalas >= 0),
  status              text not null default 'paid'
                        check (status in ('open', 'paid', 'void', 'refunded')),
  provider            text not null default 'manual',
  -- The bank transfer reference the platform admin confirmed.
  provider_payment_id text check (provider_payment_id is null or length(provider_payment_id) <= 120),
  period_start        timestamptz,
  period_end          timestamptz,
  -- e-invoicing (SAAS_PLAN §8.3). Empty until ZATCA integration exists.
  zatca_uuid text, zatca_hash text, zatca_qr text,
  issued_at           timestamptz not null default now(),
  paid_at             timestamptz
);
create index invoices_org_idx on invoices (org_id, issued_at desc);

create table audit_log (
  id            bigint generated always as identity primary key,
  org_id        uuid references organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_kind    text not null default 'user'
                  check (actor_kind in ('user', 'platform_admin', 'system')),
  action        text not null,
  target_type   text,
  target_id     text,
  meta          jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index audit_log_org_idx on audit_log (org_id, created_at desc);

alter table subscriptions enable row level security;
alter table plan_requests enable row level security;
alter table invoices enable row level security;
alter table audit_log enable row level security;

-- Billing is an owner/admin matter inside a tenant (the same roles that may
-- change org settings), and every row is visible to platform admins (D13).
-- Nothing here is written by a client: only the functions below write.
create policy subscriptions_select on subscriptions for select to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[])
         or (select public.is_platform_admin()));
create policy plan_requests_select on plan_requests for select to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[])
         or (select public.is_platform_admin()));
create policy invoices_select on invoices for select to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[])
         or (select public.is_platform_admin()));
create policy audit_log_select on audit_log for select to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[])
         or (select public.is_platform_admin()));

revoke insert, update, delete on subscriptions, plan_requests, invoices, audit_log
  from anon, authenticated;
revoke all on sequence invoice_number_seq from anon, authenticated;

-- ============================================================
-- Internal helpers (never callable by a client)
-- ============================================================
create or replace function public.log_audit(
  p_org uuid, p_action text, p_target_type text, p_target_id text, p_meta jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into audit_log (org_id, actor_user_id, actor_kind, action, target_type, target_id, meta)
  values (
    p_org,
    auth.uid(),
    case when auth.uid() is null then 'system'
         when public.is_platform_admin() then 'platform_admin'
         else 'user' end,
    p_action, p_target_type, p_target_id, coalesce(p_meta, '{}'::jsonb)
  );
$$;

-- Copies a plan's limits onto the organization. Interview quota included:
-- changing plan is exactly when the allowance should follow it (D33).
create or replace function public.apply_plan_limits(p_org uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v plans%rowtype;
begin
  select * into v from plans where code = p_plan;
  if not found then
    raise exception 'unknown plan %', p_plan using errcode = '22023';
  end if;
  update organizations
  set plan_code               = v.code,
      max_active_jobs         = v.max_active_jobs,
      max_seats               = v.max_seats,
      monthly_analysis_quota  = v.monthly_analysis_quota,
      monthly_interview_quota = v.monthly_interview_quota
  where id = p_org;
end;
$$;

revoke execute on function public.log_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.apply_plan_limits(uuid, text) from public, anon, authenticated;

-- ============================================================
-- Enforcement: active jobs
-- ============================================================
-- Fires only on the transition INTO "published and not deleted", so editing a
-- job that is already live, saving a draft, or closing one never trips it.
create or replace function public.enforce_active_job_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_live int;
begin
  if new.status <> 'published' or new.deleted_at is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.deleted_at is null then
    return new;
  end if;

  -- Serialise per organization so two simultaneous publishes cannot both
  -- take the last slot.
  select max_active_jobs into v_limit from organizations where id = new.org_id for update;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_live
  from jobs
  where org_id = new.org_id and status = 'published' and deleted_at is null and id <> new.id;

  if v_live >= v_limit then
    raise exception 'active_job_limit_reached'
      using errcode = 'HK001', detail = format('limit=%s', v_limit),
            hint = 'Upgrade the plan or close a published job.';
  end if;
  return new;
end;
$$;

create trigger jobs_enforce_active_limit
before insert or update of status, deleted_at on jobs
for each row execute function public.enforce_active_job_limit();

-- ============================================================
-- Enforcement: seats
-- ============================================================
-- A seat is a member or a live invitation. An invitation that is revoked,
-- accepted or already expired holds nothing.
create or replace function public.enforce_seat_limit_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_used int;
begin
  if new.status <> 'pending' or new.expires_at <= now() then
    return new;
  end if;

  select max_seats into v_limit from organizations where id = new.org_id for update;
  if v_limit is null then
    return new;
  end if;

  select (select count(*) from memberships where org_id = new.org_id)
       + (select count(*) from invitations
          where org_id = new.org_id and status = 'pending' and expires_at > now()
            and lower(email) <> lower(new.email))
  into v_used;

  if v_used >= v_limit then
    raise exception 'seat_limit_reached'
      using errcode = 'HK002', detail = format('limit=%s', v_limit),
            hint = 'Upgrade the plan or remove a member or a pending invitation.';
  end if;
  return new;
end;
$$;

-- Accepting an invitation moves a seat from "invited" to "member", so only
-- existing members count here; the invitation itself was counted when sent.
create or replace function public.enforce_seat_limit_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit int;
  v_members int;
begin
  select max_seats into v_limit from organizations where id = new.org_id for update;
  if v_limit is null then
    return new;
  end if;

  select count(*) into v_members from memberships where org_id = new.org_id;
  if v_members >= v_limit then
    raise exception 'seat_limit_reached'
      using errcode = 'HK002', detail = format('limit=%s', v_limit),
            hint = 'Upgrade the plan or remove a member.';
  end if;
  return new;
end;
$$;

create trigger invitations_enforce_seat_limit
before insert on invitations
for each row execute function public.enforce_seat_limit_invitation();

create trigger memberships_enforce_seat_limit
before insert on memberships
for each row execute function public.enforce_seat_limit_membership();

-- ============================================================
-- Signup starts on the trial plan's limits
-- ============================================================
-- Same function as 0009 with one line added after the organization insert.
-- Organizations created any other way (tests, seed) keep NULL limits.
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

  perform public.apply_plan_limits(v_org, 'trial');

  insert into profiles (id, full_name)
  values (v_user, btrim(p_full_name))
  on conflict (id) do update set full_name = excluded.full_name;

  insert into memberships (org_id, user_id, role)
  values (v_org, v_user, 'owner');

  return v_org;
end;
$$;

-- ============================================================
-- Tenant side: what the billing screen reads and does
-- ============================================================
create or replace function public.org_billing_overview(p_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_org organizations%rowtype;
  v_month date := date_trunc('month', now())::date;
  v_manage boolean;
begin
  if p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;
  select * into v_org from organizations where id = p_org;
  v_manage := public.is_org_member(p_org, array['owner','admin']::member_role[]);

  return jsonb_build_object(
    'can_manage', v_manage,
    'status', v_org.status,
    'plan', (select jsonb_build_object('code', p.code, 'name_ar', p.name_ar,
                                       'price_monthly_halalas', p.price_monthly_halalas)
             from plans p where p.code = v_org.plan_code),
    'limits', jsonb_build_object(
      'analyses', v_org.monthly_analysis_quota,
      'interviews', v_org.monthly_interview_quota,
      'active_jobs', v_org.max_active_jobs,
      'seats', v_org.max_seats
    ),
    'usage', jsonb_build_object(
      'analyses', coalesce((select used from analysis_usage
                            where org_id = p_org and period_start = v_month), 0),
      'interviews', (select count(*) from interview_assignments
                     where org_id = p_org and external_interview_id is not null
                       and created_at >= v_month),
      'active_jobs', (select count(*) from jobs
                      where org_id = p_org and status = 'published' and deleted_at is null),
      'seats', (select count(*) from memberships where org_id = p_org)
             + (select count(*) from invitations
                where org_id = p_org and status = 'pending' and expires_at > now())
    ),
    'subscription', (select jsonb_build_object(
                       'plan_code', s.plan_code,
                       'current_period_start', s.current_period_start,
                       'current_period_end', s.current_period_end)
                     from subscriptions s where s.org_id = p_org),
    -- Money is for the people who may change the plan.
    'pending_request', case when v_manage then (
      select jsonb_build_object('id', r.id, 'plan_code', r.plan_code,
                                'amount_halalas', r.amount_halalas,
                                'vat_halalas', r.vat_halalas,
                                'reference', r.reference, 'created_at', r.created_at)
      from plan_requests r where r.org_id = p_org and r.status = 'pending') end,
    'invoices', case when v_manage then coalesce((
      select jsonb_agg(jsonb_build_object(
               'number', i.number, 'plan_code', i.plan_code,
               'amount_halalas', i.amount_halalas, 'vat_halalas', i.vat_halalas,
               'status', i.status, 'paid_at', i.paid_at,
               'period_end', i.period_end) order by i.issued_at desc)
      from (select * from invoices where org_id = p_org
            order by issued_at desc limit 12) i), '[]'::jsonb) end
  );
end;
$$;

-- VAT: the published prices exclude it ("الأسعار لا تشمل ضريبة القيمة
-- المضافة"); 15% is the Saudi standard rate.
create or replace function public.request_plan_change(p_org uuid, p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plans%rowtype;
  v_current text;
  v_vat int;
  v_id uuid;
  v_ref text;
begin
  if not public.is_org_member(p_org, array['owner','admin']::member_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_plan from plans where code = p_plan and is_public;
  if not found or v_plan.code = 'trial' then
    raise exception 'plan not requestable' using errcode = '22023';
  end if;

  select plan_code into v_current from organizations where id = p_org;
  if v_current = p_plan then
    raise exception 'already on this plan' using errcode = '22023';
  end if;

  -- A new request replaces the open one rather than stacking.
  update plan_requests
  set status = 'cancelled', decided_at = now(), decided_by = auth.uid(),
      note = 'replaced by a newer request'
  where org_id = p_org and status = 'pending';

  v_vat := round(v_plan.price_monthly_halalas * 0.15);
  v_ref := 'PR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into plan_requests (org_id, plan_code, amount_halalas, vat_halalas, reference, requested_by)
  values (p_org, v_plan.code, v_plan.price_monthly_halalas, v_vat, v_ref, auth.uid())
  returning id into v_id;

  perform public.log_audit(p_org, 'plan.request', 'plan_request', v_id::text,
    jsonb_build_object('from', v_current, 'to', v_plan.code,
                       'amount_halalas', v_plan.price_monthly_halalas));

  return jsonb_build_object('id', v_id, 'reference', v_ref,
                            'amount_halalas', v_plan.price_monthly_halalas,
                            'vat_halalas', v_vat);
end;
$$;

create or replace function public.cancel_plan_request(p_request uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from plan_requests where id = p_request and status = 'pending';
  if v_org is null
     or not public.is_org_member(v_org, array['owner','admin']::member_role[]) then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  update plan_requests
  set status = 'cancelled', decided_at = now(), decided_by = auth.uid()
  where id = p_request;
  perform public.log_audit(v_org, 'plan.request_cancel', 'plan_request', p_request::text, '{}');
end;
$$;

-- ============================================================
-- Platform side (D13: platform_admins only, never a tenant role)
-- ============================================================
create or replace function public.platform_billing_overview()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_month date := date_trunc('month', now())::date;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(row order by has_request desc, created_at desc)
    from (
      select
        exists (select 1 from plan_requests r where r.org_id = o.id and r.status = 'pending') as has_request,
        o.created_at,
        jsonb_build_object(
          'id', o.id, 'name', o.name, 'slug', o.slug, 'status', o.status,
          'plan_code', o.plan_code,
          'limits', jsonb_build_object(
            'analyses', o.monthly_analysis_quota, 'interviews', o.monthly_interview_quota,
            'active_jobs', o.max_active_jobs, 'seats', o.max_seats),
          'usage', jsonb_build_object(
            'analyses', coalesce((select used from analysis_usage u
                                  where u.org_id = o.id and u.period_start = v_month), 0),
            'active_jobs', (select count(*) from jobs j
                            where j.org_id = o.id and j.status = 'published' and j.deleted_at is null),
            'seats', (select count(*) from memberships m where m.org_id = o.id)),
          'period_end', (select s.current_period_end from subscriptions s where s.org_id = o.id),
          'pending_request', (
            select jsonb_build_object('id', r.id, 'plan_code', r.plan_code,
                                      'amount_halalas', r.amount_halalas,
                                      'vat_halalas', r.vat_halalas,
                                      'reference', r.reference, 'created_at', r.created_at)
            from plan_requests r where r.org_id = o.id and r.status = 'pending')
        ) as row
      from organizations o
      where o.deleted_at is null
      order by o.created_at desc
      limit 500
    ) t
  ), '[]'::jsonb);
end;
$$;

-- Apply a plan with no payment: a manual deal, a correction, or the owner of
-- the platform trying plans out on their own accounts.
create or replace function public.platform_apply_plan(p_org uuid, p_plan text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from text;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only' using errcode = '42501';
  end if;
  select plan_code into v_from from organizations where id = p_org and deleted_at is null;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  perform public.apply_plan_limits(p_org, p_plan);
  update organizations
  set status = case when p_plan = 'trial' then 'trial' else 'active' end::org_status
  where id = p_org;

  insert into subscriptions (org_id, plan_code, current_period_start, current_period_end, updated_at)
  values (p_org, p_plan, now(), null, now())
  on conflict (org_id) do update
    set plan_code = excluded.plan_code, current_period_start = now(),
        current_period_end = null, updated_at = now();

  perform public.log_audit(p_org, 'plan.apply', 'organization', p_org::text,
    jsonb_build_object('from', v_from, 'to', p_plan, 'note', p_note, 'paid', false));
end;
$$;

-- The transfer arrived: issue the invoice, apply the plan, start the period.
create or replace function public.platform_confirm_request(p_request uuid, p_payment_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r plan_requests%rowtype;
  v_from text;
  v_number text;
  v_end timestamptz := now() + interval '1 month';
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only' using errcode = '42501';
  end if;
  select * into r from plan_requests where id = p_request and status = 'pending' for update;
  if not found then
    raise exception 'request not found or already decided' using errcode = 'P0002';
  end if;

  select plan_code into v_from from organizations where id = r.org_id;
  perform public.apply_plan_limits(r.org_id, r.plan_code);
  update organizations set status = 'active' where id = r.org_id;

  insert into subscriptions (org_id, plan_code, billing_cycle, current_period_start,
                             current_period_end, updated_at)
  values (r.org_id, r.plan_code, r.billing_cycle, now(), v_end, now())
  on conflict (org_id) do update
    set plan_code = excluded.plan_code, billing_cycle = excluded.billing_cycle,
        current_period_start = now(), current_period_end = v_end, updated_at = now();

  v_number := 'INV-' || to_char(now() at time zone 'Asia/Riyadh', 'YYYY') || '-'
              || lpad(nextval('invoice_number_seq')::text, 5, '0');
  insert into invoices (org_id, number, plan_code, request_id, amount_halalas, vat_halalas,
                        status, provider, provider_payment_id, period_start, period_end, paid_at)
  values (r.org_id, v_number, r.plan_code, r.id, r.amount_halalas, r.vat_halalas,
          'paid', 'manual', nullif(btrim(coalesce(p_payment_ref, '')), ''), now(), v_end, now());

  update plan_requests
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where id = r.id;

  perform public.log_audit(r.org_id, 'payment.confirm', 'invoice', v_number,
    jsonb_build_object('from', v_from, 'to', r.plan_code, 'request', r.reference,
                       'amount_halalas', r.amount_halalas, 'vat_halalas', r.vat_halalas));

  return jsonb_build_object('invoice_number', v_number, 'period_end', v_end);
end;
$$;

create or replace function public.platform_reject_request(p_request uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only' using errcode = '42501';
  end if;
  update plan_requests
  set status = 'rejected', decided_by = auth.uid(), decided_at = now(),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_request and status = 'pending'
  returning org_id into v_org;
  if v_org is null then
    raise exception 'request not found or already decided' using errcode = 'P0002';
  end if;
  perform public.log_audit(v_org, 'plan.request_reject', 'plan_request', p_request::text,
    jsonb_build_object('note', p_note));
end;
$$;

-- One organization's own numbers, for an enterprise deal or a test. NULL
-- means uncapped, so every argument is "set to this", not "leave alone".
create or replace function public.platform_set_limits(
  p_org uuid, p_analyses int, p_interviews int, p_active_jobs int, p_seats int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'platform admins only' using errcode = '42501';
  end if;
  update organizations
  set monthly_analysis_quota = p_analyses,
      monthly_interview_quota = p_interviews,
      max_active_jobs = p_active_jobs,
      max_seats = p_seats
  where id = p_org and deleted_at is null;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  perform public.log_audit(p_org, 'plan.limits_override', 'organization', p_org::text,
    jsonb_build_object('analyses', p_analyses, 'interviews', p_interviews,
                       'active_jobs', p_active_jobs, 'seats', p_seats));
end;
$$;

revoke execute on function public.org_billing_overview(uuid) from public, anon;
revoke execute on function public.request_plan_change(uuid, text) from public, anon;
revoke execute on function public.cancel_plan_request(uuid) from public, anon;
revoke execute on function public.platform_billing_overview() from public, anon;
revoke execute on function public.platform_apply_plan(uuid, text, text) from public, anon;
revoke execute on function public.platform_confirm_request(uuid, text) from public, anon;
revoke execute on function public.platform_reject_request(uuid, text) from public, anon;
revoke execute on function public.platform_set_limits(uuid, int, int, int, int) from public, anon;

grant execute on function public.org_billing_overview(uuid) to authenticated;
grant execute on function public.request_plan_change(uuid, text) to authenticated;
grant execute on function public.cancel_plan_request(uuid) to authenticated;
-- The platform functions check is_platform_admin() themselves; the grant only
-- lets a signed-in caller reach that check.
grant execute on function public.platform_billing_overview() to authenticated;
grant execute on function public.platform_apply_plan(uuid, text, text) to authenticated;
grant execute on function public.platform_confirm_request(uuid, text) to authenticated;
grant execute on function public.platform_reject_request(uuid, text) to authenticated;
grant execute on function public.platform_set_limits(uuid, int, int, int, int) to authenticated;
