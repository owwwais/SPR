-- 0002_question_banks.sql — question banks, model-call tracing and the
-- interview allowance (milestone I1; design §4.1–4.3, §8.1; CLAUDE.md D30, D33).
--
-- A job's core bank is generated once, reviewed by staff (mandatory, D30),
-- locked, and shared by every interview for that job, so candidates for the
-- same job are compared on the same structure. Each interview adds its own
-- gap-probe questions derived from the candidate's profile. Locking freezes
-- both: the triggers below refuse any change to a question of a locked bank,
-- so "the bank this interview used" can never drift after the fact.
--
-- Every row here is erased with its interview (DELETE /v1/platform/
-- interviews/{id}): gap probes and model-call traces cascade from it.

create type job_bank_status as enum ('generating', 'awaiting_review', 'locked', 'failed');

create type question_kind as enum (
  'warmup', 'technical', 'behavioral', 'situational', 'gap_probe', 'coding'
);

create type question_status as enum ('pending', 'approved', 'removed');

-- ---------------------------------------------------------------------------
-- The interview allowance (D33): one unit per interview per calendar month
-- (UTC). Claimed in the same transaction as the interview insert, so a
-- refused claim creates nothing and two concurrent creates cannot both take
-- the last unit (the row lock taken by ON CONFLICT DO UPDATE serialises them,
-- the same reasoning as consume_analysis_quota on the platform).
-- ---------------------------------------------------------------------------
create table tenant_usage (
  tenant_ref text not null,
  period_start date not null,
  used int not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_ref, period_start)
);

-- One row per bank generation started (create or retry), for the per-tenant
-- daily limit. Rows carry no content.
create table tenant_generation_log (
  id bigint generated always as identity primary key,
  tenant_ref text not null,
  created_at timestamptz not null default now()
);

create index on tenant_generation_log (tenant_ref, created_at);

-- ---------------------------------------------------------------------------
-- Core banks, one row per version. A locked version never changes; revising
-- a job's questions creates the next version.
-- ---------------------------------------------------------------------------
create table job_banks (
  id uuid primary key default gen_random_uuid(),
  -- The platform's identifier for this bank. Opaque to us.
  external_ref text not null,
  -- Keyed hash of the platform's organization id (TenantContext.ref).
  tenant_ref text not null,
  version int not null check (version >= 1),
  status job_bank_status not null default 'generating',
  -- Snapshot of the job the bank was written against (JobContext). Copied
  -- onto every interview created from the bank.
  job jsonb not null,
  bank_hash text check (bank_hash ~ '^[0-9a-f]{64}$'),
  locked_at timestamptz,
  -- Planner lease (no queue dependency: the rows are the queue).
  attempts int not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  -- A machine-readable reason, never model output.
  failure text check (char_length(failure) <= 100),
  -- Harness budget (design §4.1), counted against this bank.
  model_calls int not null default 0 check (model_calls >= 0),
  regenerations int not null default 0 check (regenerations >= 0),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_ref, version),
  check ((status = 'locked') = (locked_at is not null)),
  check (status <> 'locked' or bank_hash is not null)
);

create index on job_banks (created_at) where status = 'generating';
create index on job_banks (tenant_ref);

-- ---------------------------------------------------------------------------
-- Interviews gain their bank, their plan and their own budget.
-- ---------------------------------------------------------------------------
alter table interviews
  add column tenant_ref text,
  add column job_bank_id uuid references job_banks(id),
  -- The allowance period the interview's unit was claimed in; cleared when
  -- the unit is released, so a unit is never given back twice.
  add column quota_period date,
  add column bank_locked_at timestamptz,
  -- Fixed at lock: [{question_id, kind, content}] in the order asked.
  add column plan jsonb,
  add column plan_hash text check (plan_hash ~ '^[0-9a-f]{64}$'),
  add column attempts int not null default 0 check (attempts >= 0),
  add column lease_until timestamptz,
  add column failure text check (char_length(failure) <= 100),
  add column model_calls int not null default 0 check (model_calls >= 0),
  add column input_tokens int not null default 0 check (input_tokens >= 0),
  add column output_tokens int not null default 0 check (output_tokens >= 0),
  add column gap_regenerations int not null default 0 check (gap_regenerations >= 0),
  add constraint interviews_plan_complete check (
    (bank_locked_at is null) = (plan_hash is null)
    and (plan is null) = (plan_hash is null)
  );

create index on interviews (created_at) where status = 'planning';
create index on interviews (job_bank_id);

-- ---------------------------------------------------------------------------
-- Questions: a core-bank question belongs to a job bank, a gap probe to one
-- interview. `original` is what the model produced and is immutable; staff's
-- version lives in `edited` (the CLAUDE.md §10.6 rule for evaluations).
-- ---------------------------------------------------------------------------
create table bank_questions (
  id uuid primary key default gen_random_uuid(),
  job_bank_id uuid references job_banks(id) on delete cascade,
  interview_id uuid references interviews(id) on delete cascade,
  position int not null check (position >= 0),
  kind question_kind not null,
  status question_status not null default 'pending',
  original jsonb not null,
  edited jsonb,
  -- The question this one was generated to replace (kept, marked removed).
  replaces uuid references bank_questions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((job_bank_id is null) <> (interview_id is null)),
  check (original ->> 'kind' = kind::text),
  check (edited is null or edited ->> 'kind' = kind::text)
);

create index on bank_questions (job_bank_id, position) where job_bank_id is not null;
create index on bank_questions (interview_id, position) where interview_id is not null;

-- ---------------------------------------------------------------------------
-- One row per model call (design §4.1 tracing). Deliberately no column for a
-- prompt, an answer or model output (D8): the hash identifies the input
-- without holding it.
-- ---------------------------------------------------------------------------
create table llm_calls (
  id bigint generated always as identity primary key,
  job_bank_id uuid references job_banks(id) on delete cascade,
  interview_id uuid references interviews(id) on delete cascade,
  tool text not null,
  model text not null,
  prompt_version text not null,
  input_sha256 text not null check (input_sha256 ~ '^[0-9a-f]{64}$'),
  input_tokens int not null default 0 check (input_tokens >= 0),
  output_tokens int not null default 0 check (output_tokens >= 0),
  duration_ms int not null check (duration_ms >= 0),
  outcome text not null check (outcome in ('ok', 'invalid_output', 'model_error', 'timeout')),
  error_code text check (char_length(error_code) <= 100),
  created_at timestamptz not null default now(),
  check ((job_bank_id is null) <> (interview_id is null))
);

create index on llm_calls (job_bank_id) where job_bank_id is not null;
create index on llm_calls (interview_id) where interview_id is not null;
create index on llm_calls (created_at);

-- ---------------------------------------------------------------------------
-- Immutability, enforced in the database as well as in the API (two layers,
-- the same principle as the platform's isolation invariant). SQLSTATE HKL01
-- is mapped to 409 bank_locked by the API.
-- ---------------------------------------------------------------------------

-- True when the question's parent exists and is locked. A parent that no
-- longer exists is being deleted (erasure cascades through here), and that
-- must succeed even for a locked bank.
create function question_parent_locked(p_job_bank_id uuid, p_interview_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select status = 'locked' from job_banks where id = p_job_bank_id),
    (select bank_locked_at is not null from interviews where id = p_interview_id),
    false
  )
$$;

create function bank_questions_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op in ('UPDATE', 'DELETE')
     and question_parent_locked(old.job_bank_id, old.interview_id) then
    raise exception 'question % belongs to a locked bank', old.id
      using errcode = 'HKL01';
  end if;
  if tg_op in ('INSERT', 'UPDATE')
     and question_parent_locked(new.job_bank_id, new.interview_id) then
    raise exception 'cannot add or change a question of a locked bank'
      using errcode = 'HKL01';
  end if;
  if tg_op = 'UPDATE' and (
       new.original is distinct from old.original
       or new.kind is distinct from old.kind
       or new.job_bank_id is distinct from old.job_bank_id
       or new.interview_id is distinct from old.interview_id
     ) then
    raise exception 'the generated original of question % is immutable', old.id
      using errcode = 'HKI01';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger bank_questions_guard
  before insert or update or delete on bank_questions
  for each row execute function bank_questions_guard();

-- A locked job bank keeps its identity, job snapshot and hash forever.
create function job_banks_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'locked' and (
       new.status, new.bank_hash, new.locked_at, new.job,
       new.external_ref, new.version, new.tenant_ref
     ) is distinct from (
       old.status, old.bank_hash, old.locked_at, old.job,
       old.external_ref, old.version, old.tenant_ref
     ) then
    raise exception 'job bank % is locked', old.id using errcode = 'HKL01';
  end if;
  return new;
end
$$;

create trigger job_banks_guard
  before update on job_banks
  for each row execute function job_banks_guard();

-- An interview's plan, once drawn, is what every later step refers to.
create function interviews_plan_guard()
returns trigger
language plpgsql
as $$
begin
  if old.bank_locked_at is not null and (
       new.bank_locked_at, new.plan, new.plan_hash, new.job_bank_id
     ) is distinct from (
       old.bank_locked_at, old.plan, old.plan_hash, old.job_bank_id
     ) then
    raise exception 'the plan of interview % is locked', old.id using errcode = 'HKL01';
  end if;
  return new;
end
$$;

create trigger interviews_plan_guard
  before update on interviews
  for each row execute function interviews_plan_guard();
