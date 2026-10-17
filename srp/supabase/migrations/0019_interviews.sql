-- 0019_interviews.sql — the platform side of the virtual interview (D30,
-- docs/INTERVIEW-AGENT-DESIGN.md §8.2). Milestone I0.
--
-- The interview itself runs on a separate server (interview-agent/). What
-- lives here is the platform's record of it: who dispatched what to which
-- applicant, the status the agent last reported, and — from I3 — a copy of
-- the report, so reading results never depends on the agent being up.
--
-- Writes come only from two Edge Functions running as the service role:
-- interview-gateway (staff actions, authorised against the application's
-- own org) and interview-webhook (signed events from the agent). No client
-- role can insert, update or delete any row here.

-- Mirrors the agent's lifecycle (interview-agent/src/contract/index.ts).
create type interview_status as enum (
  'draft', 'planning', 'awaiting_review', 'scheduled', 'open', 'in_progress',
  'submitted', 'evaluating', 'evaluated', 'expired', 'cancelled', 'failed'
);

create table interview_assignments (
  id uuid primary key default gen_random_uuid(),
  -- Derived from the application by trigger, never supplied (D11, §10.10).
  org_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  -- The agent's id for this interview, set once the agent accepted it.
  external_interview_id uuid unique,
  status interview_status not null default 'draft',
  -- When the status above was true, per the agent. Webhooks can arrive out
  -- of order after retries; an older event never overwrites a newer one.
  status_at timestamptz not null default now(),
  modes text[] not null check (modes <@ array['text','voice'] and cardinality(modes) between 1 and 2),
  question_count int not null check (question_count between 4 and 15),
  duration_minutes int not null check (duration_minutes between 10 and 120),
  candidate_result text not null default 'completion'
    check (candidate_result in ('none', 'completion', 'summary')),
  paste_policy text not null default 'record'
    check (paste_policy in ('record', 'block')),
  opens_at timestamptz,
  closes_at timestamptz,
  -- The full configuration as sent to the agent (contract InterviewConfig).
  config jsonb not null,
  -- Why the last call to the agent failed, for staff and support — never
  -- candidate content.
  last_error text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

-- At most one live interview per application; a cancelled, expired or
-- failed one may be followed by a new one.
create unique index interview_assignments_one_live
  on interview_assignments (application_id)
  where status not in ('cancelled', 'expired', 'failed');

create index on interview_assignments (org_id, status);

create table interview_reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  assignment_id uuid not null unique
    references interview_assignments(id) on delete cascade,
  -- Computed by the agent in code from per-question scores, never taken from
  -- the model (design §5, step 7). Advisory, like every score (D24).
  overall_score int check (overall_score between 0 and 100),
  confidence text check (confidence in ('high', 'medium', 'low')),
  report jsonb not null,
  bank_hash text,
  model text,
  prompt_versions jsonb,
  received_at timestamptz not null default now()
);

create index on interview_reports (org_id);

-- Every webhook event processed, by id: a redelivered event is acknowledged
-- and ignored instead of applied twice. Service role only — no policies.
create table interview_webhook_events (
  event_id uuid primary key,
  type text not null,
  external_interview_id uuid not null,
  received_at timestamptz not null default now()
);

create index on interview_webhook_events (received_at);

-- ============================================================
-- Consistency guards — org_id always comes from the parent row
-- ============================================================

create trigger interview_assignments_set_org
before insert or update of application_id on interview_assignments
for each row execute function public.set_org_from_application();

create or replace function public.set_org_from_interview_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
begin
  select org_id into v_org from interview_assignments where id = new.assignment_id;
  if v_org is null then
    raise exception 'interview assignment % not found', new.assignment_id
      using errcode = '23503';
  end if;
  new.org_id := v_org;
  return new;
end;
$$;

create trigger interview_reports_set_org
before insert or update of assignment_id on interview_reports
for each row execute function public.set_org_from_interview_assignment();

-- ============================================================
-- apply_interview_event — what interview-webhook calls for every event
--
-- Records the event id and applies its status in ONE transaction. Done as
-- two separate calls from the function, a failure between them would leave
-- the event marked as seen but never applied, and the agent's retry would
-- then be ignored as a duplicate. Returns what happened:
--   applied    the status moved
--   duplicate  this event id was processed before
--   stale      a newer status is already recorded (out-of-order delivery)
--   unknown    no assignment matches both ids (e.g. erased by retention)
-- ============================================================

create or replace function public.apply_interview_event(
  p_event_id uuid,
  p_type text,
  p_interview_id uuid,
  p_assignment_id uuid,
  p_status interview_status,
  p_occurred_at timestamptz
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

  -- Both ids must match: the agent's interview id AND our assignment id
  -- (the external_ref it was created with). Either alone is not enough.
  update interview_assignments
  set status = p_status, status_at = p_occurred_at, updated_at = now()
  where id = p_assignment_id
    and external_interview_id = p_interview_id
    and status_at < p_occurred_at;
  if found then
    return 'applied';
  end if;

  if exists (
    select 1 from interview_assignments
    where id = p_assignment_id and external_interview_id = p_interview_id
  ) then
    return 'stale';
  end if;
  return 'unknown';
end;
$$;

revoke execute on function public.apply_interview_event(
  uuid, text, uuid, uuid, interview_status, timestamptz
) from public, anon, authenticated;
grant execute on function public.apply_interview_event(
  uuid, text, uuid, uuid, interview_status, timestamptz
) to service_role;

-- ============================================================
-- RLS — the §4.1 pattern: members of the org read, nobody writes but the
-- service role.
-- ============================================================

alter table interview_assignments enable row level security;
alter table interview_reports enable row level security;
alter table interview_webhook_events enable row level security;

create policy interview_assignments_member_select on interview_assignments
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy interview_assignments_platform_select on interview_assignments
  for select to authenticated
  using ((select public.is_platform_admin()));

create policy interview_reports_member_select on interview_reports
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy interview_reports_platform_select on interview_reports
  for select to authenticated
  using ((select public.is_platform_admin()));

-- Explicit grants: Supabase stops auto-exposing new tables on 2026-10-30,
-- and least privilege is the right default regardless.
revoke all on interview_assignments, interview_reports, interview_webhook_events
  from anon, authenticated;
grant select on interview_assignments, interview_reports to authenticated;
grant all on interview_assignments, interview_reports, interview_webhook_events
  to service_role;
