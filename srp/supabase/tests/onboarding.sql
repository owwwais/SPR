-- onboarding.sql — S2 acceptance: the two security-definer doors.
--
-- create_organization() and accept_invitation() are the ONLY ways a client
-- can write into organizations or memberships (0006 gives `authenticated` no
-- INSERT on either). That makes their bodies the authorization boundary, so
-- they get the same treatment as RLS: assert what they refuse, not just what
-- they allow.
--
--   psql "$DATABASE_URL" -f supabase/tests/onboarding.sql
--
-- Self-contained and rolls back. Exits non-zero if any check fails.

\set ON_ERROR_STOP on
\set QUIET on

begin;

create temp table t_results (
  id serial primary key,
  label text,
  pass boolean
);
grant all on t_results to anon, authenticated;
grant all on sequence t_results_id_seq to anon, authenticated;

create function pg_temp.chk(p_label text, p_pass boolean)
returns void language sql as $$
  insert into t_results (label, pass) values (p_label, p_pass);
$$;

create function pg_temp.chk_denied(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  execute p_sql;
  insert into t_results (label, pass) values (p_label, false);
exception when others then
  insert into t_results (label, pass) values (p_label, true);
end $$;

create function pg_temp.as_user(p_uid uuid)
returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  execute format(
    'set local request.jwt.claims to %L',
    json_build_object('sub', p_uid, 'role', 'authenticated')::text
  );
end $$;

\o /dev/null

-- ============================================================
-- Fixture: three unaffiliated accounts
-- ============================================================

insert into auth.users (instance_id, id, aud, role, email, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000','0e000000-0000-4000-8000-000000000001','authenticated','authenticated','founder@new.test',  now(), now()),
  ('00000000-0000-0000-0000-000000000000','0e000000-0000-4000-8000-000000000002','authenticated','authenticated','invitee@new.test',  now(), now()),
  ('00000000-0000-0000-0000-000000000000','0e000000-0000-4000-8000-000000000003','authenticated','authenticated','stranger@new.test', now(), now());

-- ============================================================
-- create_organization
-- ============================================================

select pg_temp.as_user('0e000000-0000-4000-8000-000000000001');

select pg_temp.chk('signup: creates the organization and returns its id',
  public.create_organization('شركة جديدة', 'brand-new-co', 'مؤسس الشركة') is not null);

select pg_temp.chk('signup: caller becomes the owner',
  (select role from memberships
   where user_id = '0e000000-0000-4000-8000-000000000001') = 'owner');

select pg_temp.chk('signup: organization starts on trial',
  (select status from organizations where slug = 'brand-new-co') = 'trial');

select pg_temp.chk('signup: the profile is created with the given name',
  (select full_name from profiles
   where id = '0e000000-0000-4000-8000-000000000001') = 'مؤسس الشركة');

-- One organization per account: otherwise a single signup can mint orgs in a
-- loop, and every one of them starts a fresh trial.
select pg_temp.chk_denied('signup: CANNOT create a second organization',
  $$select public.create_organization('أخرى', 'second-co', 'مؤسس')$$);

select pg_temp.as_user('0e000000-0000-4000-8000-000000000003');
select pg_temp.chk_denied('signup: CANNOT take a slug already in use',
  $$select public.create_organization('منافس', 'brand-new-co', 'شخص')$$);
select pg_temp.chk_denied('signup: CANNOT take a reserved slug',
  $$select public.create_organization('منصة', 'platform', 'شخص')$$);
select pg_temp.chk_denied('signup: CANNOT use an invalid slug',
  $$select public.create_organization('شركة', 'Bad Slug!', 'شخص')$$);

-- Still no membership after those refusals.
select pg_temp.chk('signup: a refused attempt leaves no membership behind',
  not exists (select 1 from memberships
              where user_id = '0e000000-0000-4000-8000-000000000003'));

reset role;
select pg_temp.chk_denied('signup: anon cannot call create_organization',
  $$set local role anon;
    select public.create_organization('مجهول', 'anon-co', 'مجهول')$$);

-- Direct INSERT stays closed even for a legitimate member.
reset role;
select pg_temp.as_user('0e000000-0000-4000-8000-000000000001');
select pg_temp.chk_denied('signup: direct INSERT into organizations is refused',
  $$insert into organizations (slug, name) values ('sneaky-co','تسلل')$$);

-- ============================================================
-- accept_invitation
-- ============================================================

reset role;

-- Owner invites invitee@new.test as hr. Tokens: only the hash is stored.
insert into invitations (id, org_id, email, role, token_hash, invited_by)
select
  '0e000000-0000-4000-8000-0000000000a1',
  o.id,
  'invitee@new.test',
  'hr',
  encode(digest('good-token-0123456789', 'sha256'), 'hex'),
  '0e000000-0000-4000-8000-000000000001'
from organizations o where o.slug = 'brand-new-co';

-- The preview reveals the company and role, and nothing else.
set local role anon;
set local request.jwt.claims to '';
select pg_temp.chk('invite: preview names the organization for an anon visitor',
  (select org_name from public.invitation_preview('good-token-0123456789'))
    = 'شركة جديدة');
select pg_temp.chk('invite: preview of a bad token returns nothing',
  not exists (select 1 from public.invitation_preview('nope')));

-- Wrong account: an invitation is addressed to a person, not to whoever
-- holds the link.
select pg_temp.as_user('0e000000-0000-4000-8000-000000000003');
select pg_temp.chk_denied('invite: CANNOT be accepted by a different account',
  $$select public.accept_invitation('good-token-0123456789', 'متطفل')$$);
select pg_temp.chk('invite: the wrong account gained no membership',
  not exists (select 1 from memberships
              where user_id = '0e000000-0000-4000-8000-000000000003'));

-- A guessed token is just a refusal.
select pg_temp.as_user('0e000000-0000-4000-8000-000000000002');
select pg_temp.chk_denied('invite: CANNOT be accepted with a wrong token',
  $$select public.accept_invitation('wrong-token-9876543210', 'مدعوّ')$$);

-- The intended recipient succeeds, once.
select pg_temp.chk('invite: the addressed account joins with the offered role',
  public.accept_invitation('good-token-0123456789', 'الموظف المدعوّ') is not null);
select pg_temp.chk('invite: membership created with the invited role',
  (select role from memberships
   where user_id = '0e000000-0000-4000-8000-000000000002') = 'hr');
select pg_temp.chk('invite: profile name recorded on acceptance',
  (select full_name from profiles
   where id = '0e000000-0000-4000-8000-000000000002') = 'الموظف المدعوّ');
select pg_temp.chk_denied('invite: CANNOT be redeemed twice',
  $$select public.accept_invitation('good-token-0123456789', 'مرة أخرى')$$);

-- Expiry is enforced, not merely displayed.
reset role;
insert into invitations (org_id, email, role, token_hash, expires_at)
select o.id, 'stranger@new.test', 'viewer',
       encode(digest('stale-token-0123456789', 'sha256'), 'hex'),
       now() - interval '1 day'
from organizations o where o.slug = 'brand-new-co';

select pg_temp.as_user('0e000000-0000-4000-8000-000000000003');
select pg_temp.chk_denied('invite: an expired invitation is refused',
  $$select public.accept_invitation('stale-token-0123456789', 'متأخر')$$);

-- A revoked invitation is dead even with the right token and account.
reset role;
insert into invitations (org_id, email, role, token_hash, status)
select o.id, 'stranger@new.test', 'viewer',
       encode(digest('revoked-token-0123456789', 'sha256'), 'hex'),
       'revoked'
from organizations o where o.slug = 'brand-new-co';

select pg_temp.as_user('0e000000-0000-4000-8000-000000000003');
select pg_temp.chk_denied('invite: a revoked invitation is refused',
  $$select public.accept_invitation('revoked-token-0123456789', 'ملغى')$$);

-- The invitee can see their new org, and only that one.
select pg_temp.as_user('0e000000-0000-4000-8000-000000000002');
select pg_temp.chk('invite: the new member sees exactly one organization',
  (select cardinality(public.current_org_ids())) = 1);

-- ============================================================
-- Report
-- ============================================================

\o
\set QUIET off
select id, label, pass from t_results order by id;

select count(*) filter (where pass) as passed,
       count(*) filter (where not pass) as failed,
       count(*) as total
from t_results;

do $$
declare
  v_failed int;
  v_labels text;
begin
  select count(*), string_agg(label, E'\n  - ')
    into v_failed, v_labels
  from t_results where not pass;

  if v_failed > 0 then
    raise exception E'ONBOARDING CHECKS FAILED (%):\n  - %', v_failed, v_labels;
  end if;
  raise notice 'onboarding: all checks passed';
end $$;

rollback;
