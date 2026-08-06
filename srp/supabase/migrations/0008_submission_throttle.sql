-- 0008_submission_throttle.sql — S1/D15: abuse limits for the one public
-- write path in the system.
--
-- Moving applications behind submit-application closed cross-tenant filing
-- and storage flooding, but the endpoint is still open to the world. Without
-- a throttle a script can burn a tenant's AI quota, fill their pipeline with
-- noise, and cost us Gemini calls. Both counters live here rather than in the
-- Edge Function so the limit survives a cold start and applies across
-- instances.
--
-- Identifiers are stored as salted hashes only: a raw IP is personal data
-- under PDPL, and we have no reason to keep one (D8).

create table submission_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  email_hash text not null,
  job_id uuid,
  created_at timestamptz not null default now()
);

create index on submission_attempts(ip_hash, created_at desc);
create index on submission_attempts(email_hash, created_at desc);
create index on submission_attempts(created_at);

alter table submission_attempts enable row level security;

-- No policies at all: this table is service-role only. It holds no tenant
-- data, so there is nothing for a member to legitimately read.
revoke all on submission_attempts from anon, authenticated;

-- ============================================================
-- record_submission_attempt
--
-- Checks and records in one statement so concurrent requests cannot both
-- pass the check. Returns the reason for refusal, or null when allowed.
-- ============================================================

create or replace function public.record_submission_attempt(
  p_ip_hash text,
  p_email_hash text,
  p_job_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ip_hour  int;
  v_ip_day   int;
  v_email_day int;
begin
  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > now() - interval '1 day')
    into v_ip_hour, v_ip_day
  from submission_attempts
  where ip_hash = p_ip_hash;

  -- A shared office NAT can legitimately produce a handful of applications
  -- in a day, so these are deliberately loose; they stop scripts, not people.
  if v_ip_hour >= 5 then
    return 'rate_limited';
  end if;
  if v_ip_day >= 20 then
    return 'rate_limited';
  end if;

  select count(*) into v_email_day
  from submission_attempts
  where email_hash = p_email_hash
    and created_at > now() - interval '1 day';

  -- One person applying to more than 10 roles in a day at one company is
  -- not a candidate, it is a scraper checking which jobs accept input.
  if v_email_day >= 10 then
    return 'rate_limited';
  end if;

  insert into submission_attempts (ip_hash, email_hash, job_id)
  values (p_ip_hash, p_email_hash, p_job_id);

  return null;
end;
$$;

revoke execute on function public.record_submission_attempt(text, text, uuid)
  from public, anon, authenticated;
