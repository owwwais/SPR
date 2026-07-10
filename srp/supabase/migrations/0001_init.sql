-- 0001_init.sql — Smart Recruitment Portal
-- Authoritative schema per CLAUDE.md §4, RLS per §4.1, storage bucket per D8.

-- ============================================================
-- Enums
-- ============================================================

create type job_status as enum ('draft','published','closed');
create type job_type as enum ('full_time','part_time','contract','remote','internship');
create type app_status as enum ('new','under_review','interview','accepted','rejected');
create type analysis_status as enum ('pending','processing','done','failed');
create type user_role as enum ('admin','hr');

-- ============================================================
-- Tables (§4 — verbatim)
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'hr',
  full_name text not null,
  created_at timestamptz not null default now()
);

create table settings (
  id int primary key default 1 check (id = 1),   -- single row
  company_name text not null default '',
  retention_months int not null default 12 check (retention_months between 1 and 60)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  department text,
  location text,
  type job_type not null,
  description text not null,          -- markdown
  requirements text not null,         -- markdown; THIS is the AI matching source
  skills text[] not null default '{}',
  min_years_experience int default 0,
  status job_status not null default 'draft',
  closes_at date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id),
  ref_code text not null unique,                 -- short public tracking code
  full_name text not null,
  email text not null,
  phone text not null,
  cv_path text not null,                         -- storage path in 'cvs' bucket
  cv_mime text not null check (cv_mime in
    ('application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  cover_note text,
  status app_status not null default 'new',
  analysis_status analysis_status not null default 'pending',
  analysis_attempts int not null default 0,
  created_at timestamptz not null default now(),
  unique (job_id, email)                         -- FR-03: no duplicate applications
);

create table ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  extracted jsonb not null,        -- structured CV data (schema in §6)
  fit_score int not null check (fit_score between 0 and 100),
  score_breakdown jsonb not null,  -- per-criterion scores (schema in §6)
  justification jsonb not null,    -- strengths[], gaps[], red_flags[] — Arabic text
  interview_questions jsonb not null, -- questions[] — Arabic text
  created_at timestamptz not null default now(),
  unique (application_id)          -- latest eval only; re-run replaces via upsert
);

create table status_history (
  id bigint generated always as identity primary key,
  application_id uuid not null references applications(id) on delete cascade,
  from_status app_status,
  to_status app_status not null,
  changed_by uuid references profiles(id),   -- null = system
  note text,
  created_at timestamptz not null default now()
);

create index on jobs(status) where deleted_at is null;
create index on applications(job_id, status);
create index on applications(analysis_status) where analysis_status in ('pending','failed');

-- The single settings row exists from day one.
insert into settings (id) values (1);

-- ============================================================
-- Role helper (security definer avoids RLS recursion on profiles)
-- ============================================================

create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid()
$$;

revoke execute on function public.current_user_role() from public;
grant execute on function public.current_user_role() to anon, authenticated;

-- Any profiles row (admin or hr) = staff. Public sign-up is disabled, so
-- authenticated users without a profile have no staff access.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_role() is not null
$$;

revoke execute on function public.is_staff() from public;
grant execute on function public.is_staff() to anon, authenticated;

-- ============================================================
-- Status history trigger (defense in depth, §4.1)
-- Every status change is recorded, including the initial 'new' on insert
-- (from_status null = submission). The M6 RPC will pass its note through
-- the 'srp.status_change_note' setting.
-- ============================================================

create or replace function public.log_application_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into status_history (application_id, from_status, to_status, changed_by, note)
    values (new.id, null, new.status, auth.uid(), null);
  elsif new.status is distinct from old.status then
    insert into status_history (application_id, from_status, to_status, changed_by, note)
    values (
      new.id,
      old.status,
      new.status,
      auth.uid(),
      nullif(current_setting('srp.status_change_note', true), '')
    );
  end if;
  return new;
end;
$$;

create trigger applications_status_history
after insert or update of status on applications
for each row execute function public.log_application_status_change();

-- ============================================================
-- Public tracking access (§4.1: anon reads own history via ref_code)
-- Implemented as a security definer RPC so anon has NO direct read access
-- to applications/status_history. Returns statuses + timestamps only —
-- no PII, no AI output (FR-08).
-- ============================================================

create or replace function public.track_application(p_ref_code text)
returns table (to_status app_status, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select h.to_status, h.created_at
  from status_history h
  join applications a on a.id = h.application_id
  where a.ref_code = p_ref_code
  order by h.created_at asc, h.id asc
$$;

revoke execute on function public.track_application(text) from public;
grant execute on function public.track_application(text) to anon, authenticated;

-- ============================================================
-- Row Level Security (§4.1 — enabled on every table)
-- The service role (Edge Functions, retention job) bypasses RLS.
-- ============================================================

alter table profiles enable row level security;
alter table settings enable row level security;
alter table jobs enable row level security;
alter table applications enable row level security;
alter table ai_evaluations enable row level security;
alter table status_history enable row level security;

-- ---------- profiles: hr = select self · admin = full ----------

create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_admin_select on profiles
  for select to authenticated
  using (public.current_user_role() = 'admin');

create policy profiles_admin_insert on profiles
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

create policy profiles_admin_update on profiles
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy profiles_admin_delete on profiles
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ---------- settings: hr = select · admin = full ----------

create policy settings_staff_select on settings
  for select to authenticated
  using (public.is_staff());

create policy settings_admin_insert on settings
  for insert to authenticated
  with check (public.current_user_role() = 'admin');

create policy settings_admin_update on settings
  for update to authenticated
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy settings_admin_delete on settings
  for delete to authenticated
  using (public.current_user_role() = 'admin');

-- ---------- jobs: anon = published only · staff = CRUD (soft delete) ----------
-- No DELETE policy at all: hard deletes are forbidden outside the retention
-- job (D9), which runs with the service role. Soft delete = update deleted_at.

create policy jobs_public_select on jobs
  for select to anon, authenticated
  using (status = 'published' and deleted_at is null);

create policy jobs_staff_select on jobs
  for select to authenticated
  using (public.is_staff());

create policy jobs_staff_insert on jobs
  for insert to authenticated
  with check (public.is_staff());

create policy jobs_staff_update on jobs
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

revoke delete on jobs from anon, authenticated;

-- ---------- applications: anon = insert only · staff = select + update status ----------

-- Insert allowed only against an open published job, with clean initial state.
create policy applications_public_insert on applications
  for insert to anon
  with check (
    status = 'new'
    and analysis_status = 'pending'
    and analysis_attempts = 0
    and exists (
      select 1 from jobs j
      where j.id = job_id
        and j.status = 'published'
        and j.deleted_at is null
        and (j.closes_at is null or j.closes_at >= current_date)
    )
  );

create policy applications_staff_select on applications
  for select to authenticated
  using (public.is_staff());

create policy applications_staff_update on applications
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- "update status only" (§4.1) is enforced at the column level: RLS cannot
-- restrict columns, so revoke the default UPDATE grant and re-grant only
-- the status column. Analysis fields are written by the service role.
revoke update on applications from authenticated;
grant update (status) on applications to authenticated;

-- Applications are never hard-deleted except by the retention job (D9):
-- no DELETE policy, and no DELETE grant for client roles.
revoke delete on applications from anon, authenticated;

-- ---------- ai_evaluations: staff = select only ----------
-- Inserted/updated exclusively by the analyze-application Edge Function
-- (service role). Originals are never edited by HR (§10.6): hard-revoke
-- writes so intent is explicit even beyond missing policies.

create policy ai_evaluations_staff_select on ai_evaluations
  for select to authenticated
  using (public.is_staff());

revoke insert, update, delete on ai_evaluations from anon, authenticated;

-- ---------- status_history: staff = select + insert ----------
-- anon reads its own history only through track_application() above.

create policy status_history_staff_select on status_history
  for select to authenticated
  using (public.is_staff());

create policy status_history_staff_insert on status_history
  for insert to authenticated
  with check (public.is_staff());

-- History is immutable.
revoke update, delete on status_history from anon, authenticated;

-- ============================================================
-- Storage: private 'cvs' bucket (D8)
-- Size limit and mime whitelist enforced at the bucket level.
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cvs',
  'cvs',
  false,
  5242880, -- 5 MB
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

-- Applicants (anon) may only upload, and only files named {uuid}.pdf|docx
-- (§4.2: cvs/{application_id}.{ext}). No update/delete: files are immutable
-- for clients; the retention job (service role) deletes them.
create policy cvs_public_insert on storage.objects
  for insert to anon
  with check (
    bucket_id = 'cvs'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|docx)$'
  );

-- Staff read CVs via short-lived signed URLs; creating a signed URL
-- requires SELECT on the object.
create policy cvs_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'cvs' and public.is_staff());
