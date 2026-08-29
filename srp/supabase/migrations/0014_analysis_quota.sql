-- 0014_analysis_quota.sql — D16: the quota check that belongs inside
-- analyze-application, before the model call.
--
-- /pricing already sells plans with concrete monthly analysis allowances —
-- 25 on trial, 150 on starter, 750 on growth — and nothing enforced them. An
-- organisation could run any number of analyses, and after the rate-limit
-- fix in 0012 the bill was still bounded only by how many applications
-- arrived. The numbers below are taken from the published plans rather than
-- invented, so the code and the pricing page cannot disagree.

create table if not exists analysis_usage (
  org_id uuid not null references organizations(id) on delete cascade,
  -- First day of the month this row counts. Monthly, because that is the
  -- period the plans are sold in.
  period_start date not null,
  used int not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (org_id, period_start)
);

alter table analysis_usage enable row level security;

-- Members may read their own consumption; only the service role writes it.
create policy analysis_usage_member_select on analysis_usage
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

alter table organizations
  add column if not exists plan_code text not null default 'trial',
  -- null means no ceiling (negotiated plans). 0 would mean "no analyses at
  -- all", which is a different statement and must stay expressible.
  add column if not exists monthly_analysis_quota int
    check (monthly_analysis_quota is null or monthly_analysis_quota >= 0);

comment on column organizations.monthly_analysis_quota is
  'Analyses allowed per calendar month. NULL = uncapped. Defaults follow the published plans: trial 25, starter 150, growth 750.';

-- Existing rows predate the column and are all on trial.
update organizations
set monthly_analysis_quota = 25
where monthly_analysis_quota is null and plan_code = 'trial';

alter table organizations alter column monthly_analysis_quota set default 25;

-- ============================================================
-- consume_analysis_quota
--
-- Checks and records in one statement so two concurrent analyses cannot both
-- pass the last remaining unit — the same reasoning as
-- record_submission_attempt in 0008.
--
-- Returns the decision plus the numbers behind it, so the Edge Function can
-- log why it refused and the dashboard can show what is left.
-- ============================================================
create or replace function public.consume_analysis_quota(p_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quota int;
  v_period date := date_trunc('month', now())::date;
  v_used int;
begin
  select monthly_analysis_quota into v_quota
  from organizations where id = p_org;

  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'unknown_org');
  end if;

  -- Uncapped plan: record consumption for reporting, never refuse.
  if v_quota is null then
    insert into analysis_usage (org_id, period_start, used)
    values (p_org, v_period, 1)
    on conflict (org_id, period_start)
      do update set used = analysis_usage.used + 1, updated_at = now()
    returning used into v_used;
    return jsonb_build_object('allowed', true, 'used', v_used, 'quota', null);
  end if;

  -- Claim a unit only while one is left. The WHERE on the DO UPDATE is what
  -- makes this safe under concurrency: the row is locked for the update, so
  -- two callers cannot both read the same remaining count.
  insert into analysis_usage (org_id, period_start, used)
  values (p_org, v_period, 1)
  on conflict (org_id, period_start)
    do update set used = analysis_usage.used + 1, updated_at = now()
    where analysis_usage.used < v_quota
  returning used into v_used;

  if v_used is null then
    select used into v_used
    from analysis_usage where org_id = p_org and period_start = v_period;
    return jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded',
      'used', coalesce(v_used, 0), 'quota', v_quota
    );
  end if;

  return jsonb_build_object('allowed', true, 'used', v_used, 'quota', v_quota);
end;
$$;

revoke execute on function public.consume_analysis_quota(uuid)
  from public, anon, authenticated;

comment on function public.consume_analysis_quota(uuid) is
  'Atomically claims one monthly analysis unit. Service role only — called by analyze-application before the model call (D16).';

-- ============================================================
-- release_analysis_quota
--
-- An analysis that never reached the model should not be charged. Called when
-- the run fails before spending anything.
-- ============================================================
create or replace function public.release_analysis_quota(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update analysis_usage
  set used = greatest(used - 1, 0), updated_at = now()
  where org_id = p_org and period_start = date_trunc('month', now())::date;
$$;

revoke execute on function public.release_analysis_quota(uuid)
  from public, anon, authenticated;

-- ============================================================
-- org_quota — what the dashboard shows the customer.
-- ============================================================
create or replace function public.org_quota(p_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_quota int;
  v_used int;
begin
  if p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select monthly_analysis_quota into v_quota from organizations where id = p_org;
  select coalesce(used, 0) into v_used
  from analysis_usage
  where org_id = p_org and period_start = date_trunc('month', now())::date;

  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'quota', v_quota,
    'remaining', case when v_quota is null then null
                      else greatest(v_quota - coalesce(v_used, 0), 0) end
  );
end;
$$;

revoke execute on function public.org_quota(uuid) from public, anon;
grant execute on function public.org_quota(uuid) to authenticated;
