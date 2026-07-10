-- 0002_interview_notes.sql — FR-07: HR edits to interview questions live in
-- a separate notes field on the evaluation; the AI originals are immutable
-- (§10.6). Column-level grant means staff can write ONLY this field.

alter table ai_evaluations add column interview_notes text;

create policy ai_evaluations_staff_update on ai_evaluations
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- M1 revoked all writes; re-grant exactly one column.
grant update (interview_notes) on ai_evaluations to authenticated;
