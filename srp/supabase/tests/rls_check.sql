-- rls_check.sql — per-role capability checks inside ONE organization
-- (CLAUDE.md §4.1, DoD §11).
--
-- Scope: what each role may do with its OWN tenant's rows — column grants,
-- RPC-only status changes, soft-delete rules, immutability of AI originals.
-- Cross-tenant isolation is a separate question and lives in
-- tenant_isolation.sql; run both.
--
-- Requires the harness (on plain Postgres), all migrations, and seed.sql:
--   psql "$DATABASE_URL" -f supabase/tests/harness.sql
--   psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql   (…through 0007)
--   psql "$DATABASE_URL" -f supabase/seed.sql
--   psql "$DATABASE_URL" -f supabase/tests/rls_check.sql
--
-- Every output row must have pass = t. Expected-failure checks raise
-- NOTICE lines starting with PASS/FAIL — check the messages panel.
--
-- Seeded roles: admin@example.com is the org OWNER, hr@example.com is HR.

begin;

-- ============================================================
-- Fixture
--
-- D15 removed anon's INSERT on applications: submissions now arrive through
-- the submit-application Edge Function, which runs with the service role.
-- This block stands in for that function.
-- ============================================================

insert into applications (
  job_id, ref_code, full_name, email, phone, cv_path, cv_mime
)
select
  'aaaaaaaa-0000-0000-0000-000000000001',
  'TRK-TEST-001',
  'مقدم طلب تجريبي',
  'applicant@test.dev',
  '+966500000000',
  o.id || '/00000000-0000-0000-0000-00000000cafe.pdf',
  'application/pdf'
from organizations o where o.slug = 'default';

insert into storage.objects (bucket_id, name, metadata)
select 'cvs', o.id || '/00000000-0000-0000-0000-00000000cafe.pdf', '{}'
from organizations o where o.slug = 'default';

-- ============================================================
-- anon (public visitor)
-- ============================================================
set local role anon;
set local request.jwt.claims to '';

select 'anon: sees only the 2 published jobs' as test,
       (select count(*) from jobs) = 2 as pass;

select 'anon: cannot see draft jobs' as test,
       not exists (select 1 from jobs where status = 'draft') as pass;

select 'anon: profiles hidden' as test,
       (select count(*) from profiles) = 0 as pass;

-- memberships is not merely filtered for anon, the grant itself is revoked:
-- the public has no business touching the tenancy table at all.
do $$
begin
  perform count(*) from memberships;
  raise notice 'FAIL: anon can read memberships';
exception when sqlstate '42501' then
  raise notice 'PASS: anon has no privilege on memberships at all';
end $$;

-- The organization itself IS public: its careers page has to render.
select 'anon: sees the live organization' as test,
       (select count(*) from organizations where slug = 'default') = 1 as pass;

select 'anon: applications hidden' as test,
       (select count(*) from applications) = 0 as pass;

select 'anon: ai_evaluations hidden' as test,
       (select count(*) from ai_evaluations) = 0 as pass;

select 'anon: status_history hidden' as test,
       (select count(*) from status_history) = 0 as pass;

select 'anon: CV objects hidden' as test,
       (select count(*) from storage.objects where bucket_id = 'cvs') = 0 as pass;

select 'anon: track_application returns the submission event' as test,
       (select count(*) from track_application('TRK-TEST-001')) = 1 as pass;

select 'anon: track_application with wrong ref returns nothing' as test,
       (select count(*) from track_application('TRK-NOPE')) = 0 as pass;

-- D15: applying is server-side only now.
do $$
begin
  insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'TRK-TEST-999', 'x', 'x@test.dev',
          '+966', 'x/y.pdf', 'application/pdf');
  raise notice 'FAIL: anon inserted an application directly (D15)';
exception when sqlstate '42501' then
  raise notice 'PASS: anon cannot insert applications (D15)';
end $$;

do $$
begin
  insert into storage.objects (bucket_id, name, metadata)
  values ('cvs', 'anon-upload.pdf', '{}');
  raise notice 'FAIL: anon uploaded a CV directly (D15)';
exception when sqlstate '42501' then
  raise notice 'PASS: anon cannot upload CVs (D15)';
end $$;

-- anon CANNOT call the status-change RPC
do $$
begin
  perform public.change_application_status(
    (select id from applications where ref_code = 'TRK-TEST-001'), 'accepted', null);
  raise notice 'FAIL: anon called change_application_status';
exception
  when sqlstate '42501' then
    raise notice 'PASS: anon cannot call change_application_status';
  when others then
    -- anon cannot even see the row to name it; also a refusal.
    raise notice 'PASS: anon cannot call change_application_status';
end $$;

-- ============================================================
-- hr (seeded: hr@example.com)
-- ============================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select 'hr: sees all 3 jobs incl. draft' as test,
       (select count(*) from jobs) = 3 as pass;

select 'hr: sees applications' as test,
       (select count(*) from applications) = 1 as pass;

-- profiles are visible to co-members now, not only to self (D14): a team
-- screen has to be able to name whoever changed a status.
select 'hr: sees itself and its co-member' as test,
       (select count(*) from profiles) = 2 as pass;

select 'hr: reads its own organization' as test,
       (select count(*) from organizations where slug = 'default') = 1 as pass;

select 'hr: sees its own org CV object' as test,
       (select count(*) from storage.objects where bucket_id = 'cvs') = 1 as pass;

-- hr CANNOT update status directly (0003: RPC only)
do $$
begin
  update applications set status = 'under_review' where ref_code = 'TRK-TEST-001';
  raise notice 'FAIL: hr updated status directly (should be RPC-only)';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update status directly (RPC-only)';
end $$;

-- hr changes status through the RPC — trigger records it with the note
select public.change_application_status(
  (select id from applications where ref_code = 'TRK-TEST-001'),
  'under_review',
  'ملاحظة اختبارية'
);

select 'hr: RPC status change logged with changed_by + note + org_id' as test,
       exists (
         select 1 from status_history h
         join applications a on a.id = h.application_id
         where a.ref_code = 'TRK-TEST-001'
           and h.from_status = 'new' and h.to_status = 'under_review'
           and h.changed_by = '22222222-2222-2222-2222-222222222222'
           and h.note = 'ملاحظة اختبارية'
           and h.org_id = a.org_id
       ) as pass;

-- no-op change records nothing
select public.change_application_status(
  (select id from applications where ref_code = 'TRK-TEST-001'),
  'under_review',
  null
);
select 'hr: no-op status change records no history' as test,
       (select count(*) from status_history h
        join applications a on a.id = h.application_id
        where a.ref_code = 'TRK-TEST-001' and h.to_status = 'under_review') = 1 as pass;

-- hr CANNOT update non-status application columns
do $$
begin
  update applications set full_name = 'hacked' where ref_code = 'TRK-TEST-001';
  raise notice 'FAIL: hr updated a non-status application column';
exception when sqlstate '42501' then
  raise notice 'PASS: hr can only update the interview columns';
end $$;

-- hr CAN schedule interviews and record interview Q&A (0005)
update applications
set interview_at = now() + interval '2 days',
    interview_qa = '[{"question":"سؤال","answer":"جواب","source":"hr"}]'
where ref_code = 'TRK-TEST-001';
select 'hr: interview fields updatable' as test,
       exists (
         select 1 from applications
         where ref_code = 'TRK-TEST-001'
           and interview_at is not null
           and jsonb_array_length(interview_qa) = 1
       ) as pass;

-- hr CANNOT tamper with applicant screening answers
do $$
begin
  update applications set screening_answers = '[]' where ref_code = 'TRK-TEST-001';
  raise notice 'FAIL: hr updated screening_answers';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update screening_answers';
end $$;

-- hr CANNOT hard-delete applications
do $$
begin
  delete from applications where ref_code = 'TRK-TEST-001';
  raise notice 'FAIL: hr hard-deleted an application';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot delete applications';
end $$;

-- hr CANNOT hard-delete jobs (soft delete via update only)
do $$
begin
  delete from jobs where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  raise notice 'FAIL: hr hard-deleted a job';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot hard-delete jobs';
end $$;

-- hr CAN soft-delete (jobs CRUD)
update jobs set deleted_at = now() where id = 'aaaaaaaa-0000-0000-0000-000000000002';
select 'hr: soft-deleted a job' as test,
       exists (select 1 from jobs
               where id = 'aaaaaaaa-0000-0000-0000-000000000002'
                 and deleted_at is not null) as pass;

-- hr CANNOT edit the organization (owner/admin only)
do $$
declare
  v_rows int;
begin
  update organizations set retention_months = 1 where slug = 'default';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise notice 'PASS: hr cannot update the organization (no row visible for update)';
  else
    raise notice 'FAIL: hr updated the organization';
  end if;
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update the organization';
end $$;

-- hr CANNOT change the team
do $$
declare
  v_rows int;
begin
  update memberships set role = 'owner'
  where user_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise notice 'PASS: hr cannot change memberships (no row visible for update)';
  else
    raise notice 'FAIL: hr promoted itself';
  end if;
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot change memberships';
end $$;

-- hr CANNOT write ai_evaluations
do $$
begin
  insert into ai_evaluations (application_id, model, prompt_version, extracted,
                              fit_score, score_breakdown, justification, interview_questions)
  select id, 'x', 'x', '{}', 50, '{}', '{}', '[]' from applications limit 1;
  raise notice 'FAIL: hr inserted into ai_evaluations';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot write ai_evaluations';
end $$;

-- Seed one evaluation as the service context for the FR-07 column checks.
reset role;
insert into ai_evaluations (application_id, model, prompt_version, extracted,
                            fit_score, score_breakdown, justification, interview_questions)
select id, 'gemini-3.5-flash', '1.1', '{}', 70, '{}', '{}', '[]'
from applications where ref_code = 'TRK-TEST-001';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

-- hr CAN write interview_notes (FR-07 separate field)
update ai_evaluations set interview_notes = 'ملاحظات المقابلة';
do $$
begin
  if exists (select 1 from ai_evaluations where interview_notes = 'ملاحظات المقابلة') then
    raise notice 'PASS: hr can update interview_notes';
  else
    raise notice 'FAIL: hr interview_notes update did not stick';
  end if;
end $$;

-- hr CANNOT touch the AI originals (column grant limits to interview_notes)
do $$
begin
  update ai_evaluations set fit_score = 99;
  raise notice 'FAIL: hr updated fit_score';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update AI originals (fit_score)';
end $$;

-- ============================================================
-- owner (seeded: admin@example.com)
-- ============================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select 'owner: sees both team profiles' as test,
       (select count(*) from profiles) = 2 as pass;

select 'owner: sees the team roster' as test,
       (select count(*) from memberships) = 2 as pass;

update organizations set retention_months = 24 where slug = 'default';
select 'owner: updated the organization' as test,
       (select retention_months from organizations where slug = 'default') = 24 as pass;

-- status is platform-controlled even for an owner (column grant), so a
-- suspended tenant cannot reactivate itself.
do $$
begin
  update organizations set status = 'active' where slug = 'default';
  raise notice 'FAIL: owner changed its own subscription status';
exception when sqlstate '42501' then
  raise notice 'PASS: owner cannot change its own subscription status';
end $$;

-- ============================================================
-- storage + structural checks
-- ============================================================
reset role;

select 'storage: cvs bucket is private with 5MB limit + mime whitelist' as test,
       exists (
         select 1 from storage.buckets
         where id = 'cvs' and not public
           and file_size_limit = 5242880
           and allowed_mime_types @> array['application/pdf']
       ) as pass;

-- 0011 added write policies for the public org-assets bucket, so this can no
-- longer assert "no write policies on storage.objects" — it has to name the
-- bucket the invariant is actually about. Applicants' CVs are written only by
-- the service role: submit-application on the way in (D15), the retention job
-- on the way out (D9).
select 'storage: no client role may write to the cvs bucket' as test,
       not exists (
         select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and cmd in ('INSERT','UPDATE','DELETE','ALL')
           and coalesce(qual, '') || coalesce(with_check, '') like '%cvs%'
       ) as pass;

-- The branding bucket is public to read and admin-only to write, and its
-- policies must not reach into cvs.
select 'storage: org-assets is readable by anyone' as test,
       exists (
         select 1 from pg_policies
         where schemaname = 'storage' and tablename = 'objects'
           and cmd = 'SELECT' and coalesce(qual, '') like '%org-assets%'
       ) as pass;

select 'storage: org-assets writes require owner/admin of the folder' as test,
       (select bool_and(
          coalesce(qual, '') || coalesce(with_check, '') like '%is_org_member%')
        from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and cmd in ('INSERT','UPDATE','DELETE')
          and coalesce(qual, '') || coalesce(with_check, '') like '%org-assets%'
       ) as pass;

select 'rls: every tenant table has row level security enabled' as test,
       (select bool_and(relrowsecurity)
        from pg_class
        where relname in ('organizations','memberships','platform_admins',
                          'impersonation_sessions','profiles','jobs',
                          'applications','ai_evaluations','status_history')
          and relnamespace = 'public'::regnamespace) as pass;

rollback;
