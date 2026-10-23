-- 0029_services.sql — the "الخدمات" hub (owner request 2026-10-23; CLAUDE.md
-- D34, and the D3 exception naming the hr-services Edge Function).
--
-- Six advisory services, each one model call inside hr-services:
--   job_need       job-needs analysis (O*NET content model, KSAOs, competencies)
--   pay_grade      job evaluation by the point-factor method → a grade
--   team           team formation: goal → roles and skills
--   ad_audit       job-ad audit: exclusionary wording, inflation, missing info
--   interview_kit  structured interview guide with anchored rating scales
--   onboarding     30/60/90-day onboarding plan
--
-- service_runs keeps every run, its input and the model's original output
-- (never edited, §10.6). Only the Edge Function writes it, with the service
-- role; members read their own organization's runs.
--
-- pay_grades is the company's own salary structure. It is the ONLY source of
-- a pay range in the product: the model never produces a salary figure, and
-- there is no licensed occupation-level market data to show instead
-- (docs/PRODUCT-READINESS-PROPOSAL.md §3.3, §3.5).
--
-- Explicit grants throughout: Supabase stops auto-exposing new objects on
-- 2026-10-30, and supabase/tests/run.sh applies this file under that default.

-- ============================================================
-- service_runs
-- ============================================================
create table service_runs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  kind          text not null check (kind in
                  ('job_need', 'pay_grade', 'team', 'ad_audit', 'interview_kit', 'onboarding')),
  -- The job a run was about, when it was about one. Deleting the job keeps
  -- the run (it is the record of advice given), so set null.
  job_id        uuid references jobs(id) on delete set null,
  title         text not null check (length(title) between 1 and 200),
  input         jsonb not null default '{}',
  status        analysis_status not null default 'processing',
  output        jsonb,
  -- A short machine-readable reason (quota_exceeded, invalid_output, …),
  -- never model output or input text (D8).
  error         text check (error is null or length(error) <= 200),
  model         text,
  prompt_version text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index service_runs_org_kind_idx on service_runs (org_id, kind, created_at desc);
create index service_runs_org_created_idx on service_runs (org_id, created_at desc);

-- A run about a job belongs to that job's organization, whatever the caller
-- sent (the same guard applications have, 0006).
create or replace function public.service_runs_check_job_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.job_id is not null
     and not exists (select 1 from jobs where id = new.job_id and org_id = new.org_id) then
    raise exception 'job does not belong to this organization' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger service_runs_job_org
before insert or update of job_id, org_id on service_runs
for each row execute function public.service_runs_check_job_org();

alter table service_runs enable row level security;

create policy service_runs_member_select on service_runs
  for select to authenticated
  using (org_id in (select unnest(public.current_org_ids())));

create policy service_runs_platform_select on service_runs
  for select to authenticated
  using ((select public.is_platform_admin()));

revoke all on service_runs from anon, authenticated;
grant select on service_runs to authenticated;
grant all on service_runs to service_role;

-- ============================================================
-- pay_grades — the company's salary structure (monthly, SAR)
-- ============================================================
create table pay_grades (
  org_id       uuid not null references organizations(id) on delete cascade,
  grade        smallint not null check (grade between 1 and 12),
  min_monthly  int not null check (min_monthly > 0 and min_monthly <= 10000000),
  max_monthly  int not null check (max_monthly <= 10000000),
  updated_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (org_id, grade),
  check (max_monthly >= min_monthly)
);

alter table pay_grades enable row level security;

-- Pay is sensitive inside the company too: viewers do not see it.
create policy pay_grades_staff_select on pay_grades
  for select to authenticated
  using (public.is_org_member(org_id, array['owner','admin','hr']::member_role[]));

create policy pay_grades_admin_insert on pay_grades
  for insert to authenticated
  with check (public.is_org_member(org_id, array['owner','admin']::member_role[]));

create policy pay_grades_admin_update on pay_grades
  for update to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[]))
  with check (public.is_org_member(org_id, array['owner','admin']::member_role[]));

create policy pay_grades_admin_delete on pay_grades
  for delete to authenticated
  using (public.is_org_member(org_id, array['owner','admin']::member_role[]));

revoke all on pay_grades from anon, authenticated;
grant select, insert, update, delete on pay_grades to authenticated;
grant all on pay_grades to service_role;

-- ============================================================
-- Functions: EXECUTE stays with what calls them
-- ============================================================
revoke execute on function public.service_runs_check_job_org() from public, anon, authenticated;
