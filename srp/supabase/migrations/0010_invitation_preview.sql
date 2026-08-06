-- 0010_invitation_preview.sql — S2: let an invitee see what they are being
-- asked to join, before they join it.
--
-- The invitee is not a member yet, so the invitations RLS policies (0009)
-- hide the row from them entirely. Without this they would have to accept
-- blind — click a link and find out afterwards which company they joined.
--
-- The preview deliberately returns the minimum: the organization's name
-- (already public, it has a careers page) and the offered role. It does NOT
-- return the invited email, the inviter, or the org id, so a stolen link
-- reveals nothing an attacker could not read from /companies.

create or replace function public.invitation_preview(p_token text)
returns table (org_name text, role member_role, expires_at timestamptz)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select o.name, i.role, i.expires_at
  from invitations i
  join organizations o on o.id = i.org_id
  where i.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and i.status = 'pending'
    and i.expires_at > now()
$$;

revoke execute on function public.invitation_preview(text) from public;
-- anon too: the invitee may follow the link before signing in, and the page
-- should be able to name the company on that first render.
grant execute on function public.invitation_preview(text) to anon, authenticated;
