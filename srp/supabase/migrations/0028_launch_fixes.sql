-- 0028_launch_fixes.sql — the database half of the launch blockers
-- (docs/PRODUCT-READINESS-PROPOSAL.md, phase 1a; docs/PRD.md §13.2–13.3).
--
--   1. Explicit grants for every object 0023–0027 created. Supabase stops
--      auto-exposing new objects on 2026-10-30 (config.toml): applied after
--      that date, or to a fresh project, those migrations left plans,
--      billing and the evaluation history unreachable. Production received
--      them under the legacy defaults, which granted too much; this sets
--      exactly what each role needs, under either default.
--   2. SEC-01 — an admin could rewrite a pending invitation's role, email and
--      token hash (no owner ceiling, table-wide UPDATE), set role 'owner' with
--      a token they know, and accept it from a second account.
--   3. SEC-02 — hr could insert status_history rows by hand, naming anyone as
--      changed_by, and the transparency report would list them as human
--      decisions (D24). History is written by the status trigger only.
--   4. KD-01 / KD-02 — the compliance settings (0016) and the per-hire
--      Saudization indicator had no UPDATE grant after 0006 moved to column
--      grants, so neither could ever be saved.
--   5. KD-16 — a monthly analysis quota of 0 still allowed the first
--      analysis of each month (the usage row was inserted unconditionally).
--   6. KD-17 — two forced re-runs of one application both ran and both paid
--      (§8 cost guard). A forced claim now takes a 'processing' row only once
--      its claim is stale, which is all housekeeping ever needed.
--
-- Every statement is safe to re-run.

-- ============================================================
-- 1) Grants for 0023–0027
-- ============================================================

-- 0023: read-only mirror of ai_evaluations, written only by its trigger.
revoke all on ai_evaluation_history from anon, authenticated;
grant select on ai_evaluation_history to authenticated;
grant all on ai_evaluation_history to service_role;

-- 0025: the plan catalogue is public (/pricing reads it as anon).
revoke all on plans from anon, authenticated;
grant select on plans to anon, authenticated;
grant all on plans to service_role;

-- 0025: billing rows are read by owners/admins and platform admins (RLS);
-- only the security definer functions write them.
revoke all on subscriptions, plan_requests, invoices, audit_log from anon, authenticated;
grant select on subscriptions, plan_requests, invoices, audit_log to authenticated;
grant all on subscriptions, plan_requests, invoices, audit_log to service_role;

revoke all on sequence invoice_number_seq from anon, authenticated;
grant usage, select on sequence invoice_number_seq to service_role;
revoke all on sequence audit_log_id_seq from anon, authenticated;
grant usage, select on sequence audit_log_id_seq to service_role;

-- 0023–0027 functions: the RPCs already grant EXECUTE to authenticated
-- explicitly. The two internal helpers stay owner-only; service_role is
-- named so a direct call from an Edge Function is possible under the new
-- default too.
grant execute on function public.change_application_status(uuid, app_status, text, text) to service_role;
grant execute on function public.search_candidates(uuid, text, int, int) to service_role;
grant execute on function public.org_billing_overview(uuid) to service_role;
grant execute on function public.workspace_today(uuid) to service_role;
grant execute on function public.search_workspace(uuid, text) to service_role;

-- ============================================================
-- 2) SEC-01 — invitations: revoke only, never rewrite
-- ============================================================
-- The one client write after creation is revoking (settings → team). Every
-- other column is fixed at insert: the token hash exists once, in the email,
-- and accept_invitation() (security definer) does the accepting.
revoke update on invitations from authenticated;
grant update (status) on invitations to authenticated;

drop policy if exists invitations_admin_update on invitations;
create policy invitations_admin_update on invitations
  for update to authenticated
  using (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    -- The same ceiling as insert: an owner invitation is an owner's to touch.
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
  )
  with check (
    public.is_org_member(org_id, array['owner','admin']::member_role[])
    and (role <> 'owner'
         or public.is_org_member(org_id, array['owner']::member_role[]))
    and status = 'revoked'
  );

-- ============================================================
-- 3) SEC-02 — status_history is written by the trigger alone
-- ============================================================
-- log_application_status_change() is security definer, so the status RPC and
-- the guarded direct update keep recording history without this grant.
drop policy if exists status_history_member_insert on status_history;
revoke insert on status_history from authenticated;

-- ============================================================
-- 4) KD-01 / KD-02 — column grants 0016 forgot
-- ============================================================
-- Row access stays with the existing policies: organizations_admin_update
-- (owner/admin) and applications_member_update (owner/admin/hr).
grant update (blind_screening, nitaqat_band, saudization_target)
  on organizations to authenticated;
grant update (counts_toward_saudization) on applications to authenticated;

-- ============================================================
-- 5) KD-16 — a quota of 0 means no analyses
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

  -- The insert below records the month's first unit without comparing it
  -- with the quota, so a zero allowance has to be refused before it (KD-16).
  if v_quota <= 0 then
    select used into v_used
    from analysis_usage where org_id = p_org and period_start = v_period;
    return jsonb_build_object(
      'allowed', false, 'reason', 'quota_exceeded',
      'used', coalesce(v_used, 0), 'quota', v_quota
    );
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
grant execute on function public.consume_analysis_quota(uuid) to service_role;

-- ============================================================
-- 6) KD-17 — one forced run at a time
-- ============================================================
alter table applications add column if not exists analysis_claimed_at timestamptz;

comment on column applications.analysis_claimed_at is
  'When the current or last analysis run claimed the row. A forced claim takes a processing row only once this is 15 minutes old (a crashed run), never from a live one (KD-17).';

create or replace function public.claim_application_for_analysis(
  p_application_id uuid,
  p_force boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed uuid;
begin
  -- A run lasts at most the Edge Function's wall-clock limit (minutes), so a
  -- claim older than 15 minutes belongs to a run that died. A row claimed
  -- before this column existed has no timestamp and counts as stale.
  update applications
  set analysis_status = 'processing',
      analysis_attempts = analysis_attempts + 1,
      analysis_error = null,
      analysis_claimed_at = now()
  where id = p_application_id
    and (
      analysis_status = 'pending'
      or (p_force and analysis_status in ('failed', 'done'))
      or (p_force and analysis_status = 'processing'
          and (analysis_claimed_at is null
               or analysis_claimed_at < now() - interval '15 minutes'))
    )
  returning id into v_claimed;

  return v_claimed is not null;
end;
$$;

revoke execute on function public.claim_application_for_analysis(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_application_for_analysis(uuid, boolean) to service_role;
