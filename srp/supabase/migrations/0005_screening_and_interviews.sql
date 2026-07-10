-- 0005_screening_and_interviews.sql — engineer-requested extensions
-- (2026-07-10):
--   1) Per-job screening questions answered in the public apply form and
--      fed into the AI evaluation (prompt v1.1).
--   2) Interview scheduling (calendar page) + recorded interview Q&A that
--      can be re-analyzed on demand.
-- jsonb columns — no new tables. Shapes are validated with zod in
-- lib/validations/screening.ts before every write.

-- Questions defined by HR on the job:
-- [{ id, label, type: text|yes_no|single_choice|multiple_choice,
--    required, options[] }]
alter table jobs
  add column screening_questions jsonb not null default '[]';

-- Applicant answers captured at submission (denormalized with label+type so
-- they stay readable even if the job's questions change later):
-- [{ question_id, label, type, answer: string | string[] }]
alter table applications
  add column screening_answers jsonb not null default '[]';

-- Interview scheduling + the running interview record:
-- [{ question, answer, source: 'ai' | 'hr' }]
alter table applications
  add column interview_at timestamptz;
alter table applications
  add column interview_qa jsonb not null default '[]';

create index on applications(interview_at) where interview_at is not null;

-- Staff manage the interview fields; everything else on applications stays
-- locked down (status changes remain RPC-only per 0003).
grant update (interview_at, interview_qa) on applications to authenticated;
