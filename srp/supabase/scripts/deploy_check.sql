-- Which migrations does this database actually have?
--
-- READ-ONLY. Paste into the Supabase dashboard's SQL Editor and run it; it
-- changes nothing. Each row checks one object that only its migration
-- creates, because the migrations were applied by hand (SQL Editor / psql)
-- and supabase_migrations.schema_migrations cannot be trusted to know.
--
-- Apply every MISSING file in order, oldest first, then run this again.
-- 0004 is left out on purpose: it only schedules the housekeeping cron when
-- app.housekeeping_url is set, and creates nothing to check otherwise.

with fn as (
  select p.proname as name, p.prosrc as src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
col as (
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
),
checks (migration, applied) as (values
  ('0001_init',
    to_regclass('public.applications') is not null),
  ('0002_interview_notes',
    exists (select 1 from col where table_name = 'ai_evaluations' and column_name = 'interview_notes')),
  ('0003_status_rpc',
    exists (select 1 from fn where name = 'change_application_status')),
  ('0005_screening_and_interviews',
    exists (select 1 from col where table_name = 'jobs' and column_name = 'screening_questions')),
  ('0006_multitenancy',
    to_regclass('public.memberships') is not null),
  ('0007_storage_isolation',
    exists (select 1 from fn where name = 'storage_org_id')),
  ('0008_submission_throttle',
    to_regclass('public.submission_attempts') is not null),
  ('0009_onboarding',
    to_regclass('public.invitations') is not null),
  ('0010_invitation_preview',
    exists (select 1 from fn where name = 'invitation_preview')),
  ('0011_org_branding',
    exists (select 1 from pg_policies where policyname = 'org_assets_public_select')),
  ('0012_security_hardening',
    exists (select 1 from fn where name = 'claim_application_for_analysis')),
  ('0013_stats_and_fit_score',
    exists (select 1 from col where table_name = 'applications' and column_name = 'fit_score')),
  ('0014_analysis_quota',
    to_regclass('public.analysis_usage') is not null),
  ('0015_transparency_report',
    exists (select 1 from fn where name = 'application_transparency_report')),
  ('0016_blind_screening_and_saudization',
    exists (select 1 from fn where name = 'org_saudization')),
  ('0017_talent_platform',
    to_regclass('talent.profiles') is not null
    and exists (select 1 from storage.buckets where id = 'talent-cvs')),
  ('0018_talent_review_error',
    exists (select 1 from fn where name = 'talent_review_profile' and src like '%analysis_error%')),
  ('0019_interviews',
    to_regclass('public.interview_assignments') is not null),
  ('0020_seeker_accounts',
    to_regclass('talent.cv_versions') is not null
    and exists (select 1 from fn where name = 'my_hats')),
  ('0021_interview_banks',
    to_regclass('public.interview_job_banks') is not null),
  ('0022_revoke_stray_client_grants',
    not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and (has_table_privilege('anon', c.oid, 'INSERT')
          or has_table_privilege('anon', c.oid, 'UPDATE')
          or has_table_privilege('anon', c.oid, 'DELETE'))
    )),
  ('0023_rejection_reason_and_sourcing',
    exists (select 1 from col where table_name = 'status_history' and column_name = 'public_reason')
    and to_regclass('public.ai_evaluation_history') is not null),
  ('0024_candidate_search',
    exists (select 1 from fn where name = 'search_candidates')),
  ('0025_billing',
    to_regclass('public.plans') is not null
    and exists (select 1 from fn where name = 'platform_confirm_request')),
  ('0026_workspace_today',
    exists (select 1 from fn where name = 'workspace_today'))
)
select
  migration,
  case when applied then 'applied' else 'MISSING - run this file' end as status
from checks
order by migration;
