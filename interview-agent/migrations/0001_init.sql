-- 0001_init.sql — the interview agent's own database (D30, design §8.1).
--
-- This database belongs to the agent alone. The platform never connects to
-- it; everything crosses through the signed API. It holds working data for
-- as long as an interview needs it and is erased on the platform's request
-- (DELETE /v1/platform/interviews/{id}) — every child row cascades, so one
-- delete leaves no trace.
--
-- I0 scope: the lifecycle, the audit trail, delivery of events and the two
-- replay guards. Question banks, turns, telemetry and evaluation steps land
-- with the milestones that write them (I1–I3).

create type interview_status as enum (
  'draft', 'planning', 'awaiting_review', 'scheduled', 'open', 'in_progress',
  'submitted', 'evaluating', 'evaluated', 'expired', 'cancelled', 'failed'
);

create table interviews (
  id uuid primary key default gen_random_uuid(),
  -- The platform's identifier for this interview (its assignment id). Opaque
  -- to us; unique so a retried create can never make a second interview.
  external_ref text not null unique,
  -- Opaque candidate reference. Never a name, email or user id (§3.5).
  candidate_ref text not null,
  status interview_status not null default 'draft',
  job jsonb not null,
  candidate_profile jsonb not null,
  config jsonb not null,
  opens_at timestamptz,
  closes_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  -- Bumped on every session-token mint; a token naming an older epoch is
  -- refused. One live device per interview (design §4.4).
  session_epoch int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at)
);

create index on interviews (status);

-- Every transition, with who caused it. Content never goes here — only the
-- fact of a change (D8 parity).
create table audit_log (
  id bigint generated always as identity primary key,
  interview_id uuid not null references interviews(id) on delete cascade,
  actor text not null check (actor in ('platform', 'candidate', 'system')),
  action text not null,
  from_status interview_status,
  to_status interview_status,
  at timestamptz not null default now()
);

create index on audit_log (interview_id, at);

-- Transactional outbox: an event is written in the same transaction as the
-- change it reports, then delivered by the worker with retries. A crash
-- between the two can delay an event but never lose one.
create table webhook_outbox (
  id bigint generated always as identity primary key,
  event_id uuid not null unique default gen_random_uuid(),
  interview_id uuid not null references interviews(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  delivered_at timestamptz,
  dead_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index on webhook_outbox (next_attempt_at)
  where delivered_at is null and dead_at is null;

-- Idempotency-Key for mutating platform calls: a retried request gets the
-- stored response instead of a second side effect.
create table idempotency_keys (
  key text primary key,
  request_hash text not null,
  response_status int,
  response_body jsonb,
  created_at timestamptz not null default now()
);

-- Nonces of signed requests seen inside the signature window. A captured
-- request replayed within five minutes carries a nonce already here.
create table request_nonces (
  nonce text primary key,
  seen_at timestamptz not null default now()
);

create index on request_nonces (seen_at);
