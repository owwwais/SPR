-- 0003_status_rpc.sql — FR-08 / §4.1: status changes by HR go through
-- change_application_status ONLY. It updates the status; the M1 trigger
-- records history (defense in depth) and picks up the note through the
-- transaction-local 'srp.status_change_note' setting.

create or replace function public.change_application_status(
  p_application_id uuid,
  p_new_status app_status,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current app_status;
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_current
  from applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'application not found';
  end if;
  if v_current = p_new_status then
    return; -- no-op; nothing recorded
  end if;

  perform set_config('srp.status_change_note', coalesce(p_note, ''), true);
  update applications set status = p_new_status where id = p_application_id;
  perform set_config('srp.status_change_note', '', true);
end;
$$;

revoke execute on function public.change_application_status(uuid, app_status, text) from public;
grant execute on function public.change_application_status(uuid, app_status, text) to authenticated;

-- The M1 column grant allowed direct status updates until the RPC existed;
-- from now on the RPC is the only path (§4.1).
revoke update (status) on applications from authenticated;
