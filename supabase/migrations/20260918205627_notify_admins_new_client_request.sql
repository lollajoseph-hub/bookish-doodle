
-- Gap confirmed 17-18 Sept ("notification trigger yet to do", point 7 of Lola's 8-point list):
-- new client_requests were never notifying admins. Fires for ANY insert into
-- client_requests, whether from the new public self-serve intake or the existing
-- authenticated-client direct-insert new-request form. Mirrors the exact
-- notify-admins pattern already used in reject_candidate_match / request_to_hire.
create or replace function public.tg_notify_admins_new_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_client_name text;
  v_role_name text;
begin
  select name into v_client_name from public.clients where id = new.client_id;
  select name into v_role_name from public.job_roles where id = new.role_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'New client request',
         coalesce(v_client_name, 'A client') || ' submitted a new hiring request' ||
         case when v_role_name is not null then ' for ' || v_role_name else '' end || '.',
         'new_client_request'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return new;
end;
$function$;

drop trigger if exists trg_notify_admins_new_request on public.client_requests;
create trigger trg_notify_admins_new_request
  after insert on public.client_requests
  for each row execute function public.tg_notify_admins_new_request();
