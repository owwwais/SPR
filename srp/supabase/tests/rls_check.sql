-- rls_check.sql — RLS verification per role (CLAUDE.md §4.1, DoD §11)
-- Run against a database with 0001_init.sql applied AND seed.sql loaded:
--   psql "$DATABASE_URL" -f supabase/tests/rls_check.sql
-- or paste into the Supabase SQL editor. Everything rolls back at the end.
--
-- Every output row must have pass = t. Expected-failure checks raise
-- NOTICE lines starting with PASS/FAIL — check the messages panel.

begin;

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

select 'anon: settings hidden' as test,
       (select count(*) from settings) = 0 as pass;

select 'anon: applications hidden' as test,
       (select count(*) from applications) = 0 as pass;

select 'anon: ai_evaluations hidden' as test,
       (select count(*) from ai_evaluations) = 0 as pass;

select 'anon: status_history hidden' as test,
       (select count(*) from status_history) = 0 as pass;

-- anon CAN apply to a published job (trigger writes the initial history row)
insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'TRK-TEST-001',
  'مقدم طلب تجريبي',
  'applicant@test.dev',
  '+966500000000',
  'cvs/00000000-0000-0000-0000-00000000cafe.pdf',
  'application/pdf'
);

select 'anon: track_application returns the submission event' as test,
       (select count(*) from track_application('TRK-TEST-001')) = 1 as pass;

select 'anon: track_application with wrong ref returns nothing' as test,
       (select count(*) from track_application('TRK-NOPE')) = 0 as pass;

-- anon CANNOT call the status-change RPC (0003)
do $$
begin
  perform public.change_application_status(
    (select application_id from status_history limit 1), 'accepted', null);
  raise notice 'FAIL: anon called change_application_status';
exception when sqlstate '42501' then
  raise notice 'PASS: anon cannot call change_application_status';
end $$;

-- anon CANNOT apply to a draft job
do $$
begin
  insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime)
  values ('aaaaaaaa-0000-0000-0000-000000000003', 'TRK-TEST-002', 'x', 'x@test.dev',
          '+966', 'cvs/00000000-0000-0000-0000-00000000beef.pdf', 'application/pdf');
  raise notice 'FAIL: anon applied to a DRAFT job';
exception when sqlstate '42501' then
  raise notice 'PASS: anon cannot apply to a draft job';
end $$;

-- anon CANNOT submit with a non-clean initial state
do $$
begin
  insert into applications (job_id, ref_code, full_name, email, phone, cv_path, cv_mime, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001', 'TRK-TEST-003', 'x', 'x2@test.dev',
          '+966', 'cvs/00000000-0000-0000-0000-00000000f00d.pdf', 'application/pdf', 'accepted');
  raise notice 'FAIL: anon inserted a pre-accepted application';
exception when sqlstate '42501' then
  raise notice 'PASS: anon cannot preset application status';
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

select 'hr: sees own profile only' as test,
       (select count(*) from profiles) = 1
       and exists (select 1 from profiles
                   where id = '22222222-2222-2222-2222-222222222222') as pass;

select 'hr: reads settings' as test,
       (select count(*) from settings) = 1 as pass;

-- hr CANNOT update status directly anymore (0003: RPC only)
do $$
begin
  update applications set status = 'under_review' where ref_code = 'TRK-TEST-001';
  raise notice 'FAIL: hr updated status directly (should be RPC-only)';
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update status directly (RPC-only)';
end $$;

-- hr changes status through the RPC — trigger logs it with the note
select public.change_application_status(
  (select id from applications where ref_code = 'TRK-TEST-001'),
  'under_review',
  'ملاحظة اختبارية'
);

select 'hr: RPC status change logged with changed_by + note' as test,
       exists (
         select 1 from status_history h
         join applications a on a.id = h.application_id
         where a.ref_code = 'TRK-TEST-001'
           and h.from_status = 'new' and h.to_status = 'under_review'
           and h.changed_by = '22222222-2222-2222-2222-222222222222'
           and h.note = 'ملاحظة اختبارية'
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
  raise notice 'PASS: hr can only update application status';
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

-- hr CANNOT write settings
do $$
begin
  update settings set retention_months = 1 where id = 1;
  if not found then
    raise notice 'PASS: hr cannot update settings (no row visible for update)';
  else
    raise notice 'FAIL: hr updated settings';
  end if;
exception when sqlstate '42501' then
  raise notice 'PASS: hr cannot update settings';
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
select id, 'gemini-2.5-flash', '1.0', '{}', 70, '{}', '{}', '[]'
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
-- admin (seeded: admin@example.com)
-- ============================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select 'admin: sees all profiles' as test,
       (select count(*) from profiles) = 2 as pass;

update settings set retention_months = 24 where id = 1;
select 'admin: updated settings' as test,
       (select retention_months from settings where id = 1) = 24 as pass;

-- ============================================================
-- storage policies (metadata-level check)
-- ============================================================
reset role;

select 'storage: cvs bucket is private with 5MB limit + mime whitelist' as test,
       exists (
         select 1 from storage.buckets
         where id = 'cvs' and not public
           and file_size_limit = 5242880
           and allowed_mime_types @> array['application/pdf']
       ) as pass;

rollback;
