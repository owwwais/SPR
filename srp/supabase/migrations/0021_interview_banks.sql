-- 0021_interview_banks.sql — the platform side of the interview question
-- bank (D30, D33, docs/INTERVIEW-AGENT-DESIGN.md §4.2–4.3). Milestone I1.
--
-- The questions themselves live on the interview agent. What lives here is
-- the platform's record of each job's core bank — which version is current,
-- whether staff have locked it, and its fingerprint — plus the monthly
-- interview allowance the agent enforces before any model call.
--
-- As in 0019, every write comes from interview-gateway running as the
-- service role, after it has authorised the caller against the JOB's own
-- organization (can_manage_job below). No client role inserts, updates or
-- deletes a bank row.

-- ============================================================
-- The interview allowance (D33)
-- ============================================================

-- Default 0: an organization has no interviews until the owner assigns its
-- plan a number. The per-plan numbers are a commercial decision that has not
-- been made, so none is invented here (unlike 0014, whose numbers were
-- already published on /pricing).
alter table organizations
  add column if not exists monthly_interview_quota int default 0
    check (monthly_interview_quota is null or monthly_interview_quota >= 0);

comment on column organizations.monthly_interview_quota is
  'Virtual interviews allowed per calendar month (UTC), enforced by the interview agent before any model call (D33). NULL = uncapped; 0 = the plan includes none. The owner sets the per-plan numbers; tenants cannot change it.';

-- A tenant raising its own allowance would be a billing bypass. 0006 grants
-- UPDATE on organizations column by column, so a column added later is not
-- writable by any client role — this asserts that instead of assuming it, and
-- fails the migration if some later grant ever widened it.
do $$
begin
  if has_column_privilege('authenticated', 'public.organizations', 'monthly_interview_quota', 'UPDATE')
     or has_column_privilege('anon', 'public.organizations', 'monthly_interview_quota', 'UPDATE')
  then
    raise exception 'organizations.monthly_interview_quota must not be writable by a client role (D33)';
  end if;
end $$;

-- ============================================================
-- interview_job_banks — one row per version of a job's core bank
-- ============================================================

create table interview_job_banks (
  id uuid primary key default gen_random_uuid(),
  -- Derived from the job by trigger, never supplied (D11, §10.10).
  org_id uuid not null references organizations(id) on delete cascade,
  job_id uuid not null references jobs(id) on delete cascade,
  -- The agent's id for this bank, set once the agent accepted it. A row
  -- without one is a creation the agent never acknowledged.
  external_bank_id uuid unique,
  -- Counted per job by the platform: staff revise a locked bank by creating
  -- the next version, never by changing a locked one.
  version int not null default 1 check (version >= 1),
  -- generating -> awaiting_review -> locked, or failed; superseded when a
  -- newer version of the same job is locked. Mirrors the agent's
  -- JobBankStatus, plus 'superseded', which only the platform knows.
  status text not null default 'generating'
    check (status in ('generating', 'awaiting_review', 'locked', 'failed', 'superseded')),
  -- sha256 of the approved questions, fixed at lock. Every interview and
  -- report built on this bank can be traced back to exactly this content.
  bank_hash text check (bank_hash is null or bank_hash ~ '^[0-9a-f]{64}$'),
  -- Non-removed and approved questions, as of the last sync with the agent.
  question_count int not null default 0 check (question_count >= 0),
  approved_count int not null default 0 check (approved_count >= 0),
  -- Why generation or the last call to the agent failed: a code, never
  -- model output or job content.
  last_error text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locked_at timestamptz,
  unique (job_id, version),
  -- A locked bank without its fingerprint could not be audited.
  check (status <> 'locked' or (bank_hash is not null and locked_at is not null))
);

comment on table interview_job_banks is
  'The platform''s record of each job''s core interview question bank (I1). The questions live on the interview agent; a job''s current bank is its newest locked version.';

-- At most one bank per job is being generated or reviewed at a time, so two
-- staff members cannot start competing versions.
create unique index interview_job_banks_one_in_progress
  on interview_job_banks (job_id)
  where status in ('generating', 'awaiting_review');

create index on interview_job_banks (org_id, job_id);

-- org_id always follows the job. set_org_from_job() (0006) reads exactly
-- new.job_id and writes new.org_id, so it fits this table unchanged.
create trigger interview_job_banks_set_org
before insert or update of job_id on interview_job_banks
for each row execute function public.set_org_from_job();

create or replace function public.interview_job_banks_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger interview_job_banks_touch
before update on interview_job_banks
for each row execute function public.interview_job_banks_touch();

-- ============================================================
-- interview_assignments — which bank an interview was built on
-- ============================================================

alter table interview_assignments
  add column job_bank_id uuid references interview_job_banks(id) on delete set null,
  -- The interview's plan fingerprint (core bank + gap probes, in order),
  -- fixed when staff lock the interview's questions.
  add column bank_hash text check (bank_hash is null or bank_hash ~ '^[0-9a-f]{64}$'),
  add column bank_locked_at timestamptz;

-- An interview may only be built on a locked bank of its own application's
-- job. org_id alone would not catch a bug that picked another job's bank in
-- the same organization, and the job match implies the org match.
create or replace function public.check_interview_assignment_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_bank_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from interview_job_banks b
    join applications a on a.job_id = b.job_id and a.org_id = b.org_id
    where b.id = new.job_bank_id
      and a.id = new.application_id
      and b.status in ('locked', 'superseded')
  ) then
    raise exception 'bank % is not a locked bank of the job of application %',
      new.job_bank_id, new.application_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Named to sort after interview_assignments_set_org: triggers of the same
-- timing fire alphabetically, and the check reads the application anyway.
create trigger interview_assignments_verify_bank
before insert or update of job_bank_id, application_id on interview_assignments
for each row execute function public.check_interview_assignment_bank();

-- ============================================================
-- can_manage_job — the gate for bank actions in interview-gateway
--
-- The job-level twin of can_manage_application (0006): owner, admin or hr
-- of the job's OWN organization, and only for a job that still exists.
-- ============================================================

create or replace function public.can_manage_job(p_job_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from jobs j
    where j.id = p_job_id
      and j.deleted_at is null
      and public.is_org_member(j.org_id, array['owner','admin','hr']::member_role[])
  )
$$;

-- anon is revoked by name too: the schema's default privileges grant it
-- every new routine, and an anonymous caller has no job to manage.
revoke execute on function public.can_manage_job(uuid) from public, anon;
grant execute on function public.can_manage_job(uuid) to authenticated, service_role;

-- ============================================================
-- RLS — the §4.1 pattern, as in 0019: members of the org read, nobody
-- writes but the service role.
-- ============================================================

alter table interview_job_banks enable row level security;

create policy interview_job_banks_member_select on interview_job_banks
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy interview_job_banks_platform_select on interview_job_banks
  for select to authenticated
  using ((select public.is_platform_admin()));

-- Explicit grants: Supabase stops auto-exposing new tables on 2026-10-30.
revoke all on interview_job_banks from anon, authenticated;
grant select on interview_job_banks to authenticated;
grant all on interview_job_banks to service_role;

-- ============================================================
-- apply_interview_event — bind the agent's id when the event wins the race
--
-- The gateway stores external_interview_id only after the agent's create
-- response returns, but the agent may already have queued an event for the
-- new interview (with no gap probes it is awaiting_review at once). That
-- event matched no row, was reported 'unknown', and was dropped. The event
-- is HMAC-signed by the agent and names our assignment id as its
-- external_ref, so binding the agent's id to an assignment that has none yet
-- is safe; an assignment already bound to a different interview still
-- matches nothing.
-- ============================================================
-- The signature gains p_reason (the agent's failure code from
-- interview.failed), so the 0019 function is dropped rather than overloaded:
-- with a defaulted seventh argument, a six-argument call would match both.
drop function if exists public.apply_interview_event(
  uuid, text, uuid, uuid, interview_status, timestamptz
);

create function public.apply_interview_event(
  p_event_id uuid,
  p_type text,
  p_interview_id uuid,
  p_assignment_id uuid,
  p_status interview_status,
  p_occurred_at timestamptz,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into interview_webhook_events (event_id, type, external_interview_id)
  values (p_event_id, p_type, p_interview_id)
  on conflict (event_id) do nothing;
  if not found then
    return 'duplicate';
  end if;

  update interview_assignments
  set status = p_status,
      status_at = p_occurred_at,
      external_interview_id = coalesce(external_interview_id, p_interview_id),
      -- Why planning failed, so staff see a reason instead of a bare
      -- "failed". A code only (the agent never sends content); anything else
      -- is ignored rather than stored.
      last_error = case
        when p_status = 'failed' and p_reason ~ '^[a-z_]{1,60}$' then p_reason
        else last_error
      end,
      updated_at = now()
  where id = p_assignment_id
    and (
      external_interview_id = p_interview_id
      or (
        external_interview_id is null
        -- Only an assignment still waiting for the agent's answer: one the
        -- gateway already marked failed (a create that timed out although
        -- the agent did create it) stays failed rather than coming back to
        -- life beside the newer interview staff may have started since.
        and status = 'draft'
        -- An interview already bound to another assignment never moves.
        and not exists (
          select 1 from interview_assignments other
          where other.external_interview_id = p_interview_id
        )
      )
    )
    -- A draft's status_at is the platform's clock at insert, not the
    -- agent's: compared with the agent's occurred_at, a few milliseconds of
    -- clock skew would drop the agent's first event as stale and leave the
    -- row in draft. Draft is the platform's placeholder until the agent
    -- answers, so any event from the agent is newer than it.
    and (status = 'draft' or status_at < p_occurred_at);
  if found then
    return 'applied';
  end if;

  if exists (
    select 1 from interview_assignments
    where id = p_assignment_id
      and (
        external_interview_id = p_interview_id
        or (
          external_interview_id is null
          and status = 'draft'
          and not exists (
            select 1 from interview_assignments other
            where other.external_interview_id = p_interview_id
          )
        )
      )
  ) then
    return 'stale';
  end if;
  return 'unknown';
exception
  -- A status that would make a second live interview for one application
  -- (interview_assignments_one_live). Acknowledged rather than raised: a 500
  -- would only make the agent redeliver it for hours to the same outcome.
  when unique_violation then
    return 'stale';
end;
$$;

revoke execute on function public.apply_interview_event(
  uuid, text, uuid, uuid, interview_status, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.apply_interview_event(
  uuid, text, uuid, uuid, interview_status, timestamptz, text
) to service_role;
