-- 0016_blind_screening_and_saudization.sql
--
-- The two differentiating features from the competitive analysis. They are in
-- one migration because they share a constraint: neither may touch the fit
-- score.

-- ============================================================
-- 1. Blind screening (per organisation, off by default)
--
-- The model currently receives the CV as a PDF, so it sees the name, the
-- photo, the nationality and everything else on the page. The only protection
-- is fairness rule 4 in the system prompt telling it to ignore them — an
-- instruction, not a guarantee. Independent audits put detectable bias in
-- most screening tools, with name-based effects the largest single component.
--
-- Off by default because it costs a second model call. Making it a setting
-- rather than a default keeps the bill where the customer chose to put it,
-- and turns the safeguard into something sellable.
-- ============================================================
alter table organizations
  add column if not exists blind_screening boolean not null default false;

comment on column organizations.blind_screening is
  'When true, analyze-application anonymises the CV before evaluating it, so identity never reaches the scoring stage. Costs one extra model call.';

-- Recorded per evaluation, not read from the org, because the setting can be
-- changed later and a score has to stay explainable as of when it was made.
alter table ai_evaluations
  add column if not exists blind boolean not null default false;

comment on column ai_evaluations.blind is
  'Whether identity was stripped before this evaluation. Surfaced in the transparency report as evidence of how the score was produced.';

-- ============================================================
-- 2. Saudization (Nitaqat) indicator
--
-- An employer's Nitaqat band governs visa issuance, work-permit renewal and
-- access to government services, so "does this hire help or hurt my band?" is
-- an operational question asked at every offer. No competitor answers it.
--
-- THE CONSTRAINT THAT MATTERS: nationality is never inferred from a CV and
-- never reaches the model. Fairness rule 4 requires the score to ignore it,
-- and a system that quietly extracted it to compute this would be violating
-- its own published promise. So a human records it, once, at offer stage —
-- it is a compliance fact about a hire, not an input to an evaluation.
-- ============================================================
create type nitaqat_band as enum
  ('platinum', 'green_high', 'green_mid', 'green_low', 'yellow', 'red');

alter table organizations
  add column if not exists nitaqat_band nitaqat_band,
  add column if not exists saudization_target numeric(5,2)
    check (saudization_target is null or saudization_target between 0 and 100);

-- Null means "not recorded". Deliberately tri-state: an unanswered question
-- must not read as "no".
alter table applications
  add column if not exists counts_toward_saudization boolean;

comment on column applications.counts_toward_saudization is
  'Recorded by a human at offer stage for Nitaqat reporting. NEVER inferred from the CV and never an input to fit_score — the score ignores nationality by rule.';

-- ============================================================
-- org_saudization — what the settings screen shows.
-- ============================================================
create or replace function public.org_saudization(p_org uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if p_org not in (select unnest(public.current_org_ids())) then
    raise exception 'not a member of this organization' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'band', o.nitaqat_band,
    'target', o.saudization_target,
    'accepted_total', (
      select count(*) from applications
      where org_id = p_org and status = 'accepted'
    ),
    'accepted_counting', (
      select count(*) from applications
      where org_id = p_org and status = 'accepted'
        and counts_toward_saudization is true
    ),
    'accepted_unrecorded', (
      select count(*) from applications
      where org_id = p_org and status = 'accepted'
        and counts_toward_saudization is null
    )
  ) into v_result
  from organizations o where o.id = p_org;

  return v_result;
end;
$$;

revoke execute on function public.org_saudization(uuid) from public, anon;
grant execute on function public.org_saudization(uuid) to authenticated;
