-- New hire pipeline: interview_completed -> (client requests hire) -> hire_requested
-- -> (staff sends contract) -> offer_extended -> (staff creates placement) -> hired.
-- Replaces the old request_to_hire RPC, which jumped straight from interview_completed to
-- hired and auto-created a bare placement with no contract step or staff review at all --
-- confirmed via frontend audit that this was the client app's actual live behavior.

-- 1. Client requests hire (client_member of the request, or staff) at interview_completed.
create or replace function public.client_request_hire(p_match_id uuid)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
  v_recruiter_id uuid;
begin
  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'interview_completed' then
    raise exception 'can only request to hire after the interview is complete (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set status = 'hire_requested', hire_requested_at = now()
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name, cd.recruiter_id into v_candidate_name, v_recruiter_id
    from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Hire requested',
         coalesce(v_client_name, 'A client') || ' wants to hire ' || coalesce(v_candidate_name, 'a candidate') || ' -- send the contract to move forward.',
         'hire_requested'
  from public.profiles p
  where p.is_active and (p.role = 'admin' or p.id = v_recruiter_id);

  return v_result;
end;
$function$;

-- 2. Staff sends the contract: hire_requested -> offer_extended.
create or replace function public.staff_extend_offer(p_match_id uuid)
 returns public.candidate_matches
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_candidate_name text;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'hire_requested' then
    raise exception 'can only extend an offer after a hire has been requested (current status: %)', v_status;
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'offer_extended'
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Contract sent',
         'The contract for ' || coalesce(v_candidate_name, 'the candidate') || ' has been sent. We will let you know once the placement is confirmed.',
         'offer_extended'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$;

-- 3. Staff creates the placement with real commercial terms; this single action is what
-- finally marks the match hired (per product decision: no separate "mark hired" click).
create or replace function public.create_placement_and_mark_hired(
  p_match_id uuid,
  p_seat_title text default null,
  p_billing_start_date date default null,
  p_monthly_rate numeric default null,
  p_guarantee_window_expires date default null,
  p_notes text default null
)
 returns public.placements
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
  v_status public.match_status;
  v_candidate_id uuid;
  v_client_id uuid;
  v_role_id uuid;
  v_request_title text;
  v_role_name text;
  v_seat_title text;
  v_candidate_name text;
  v_client_name text;
  v_placement public.placements;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select client_request_id, status, candidate_id into v_request_id, v_status, v_candidate_id
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'offer_extended' then
    raise exception 'can only create a placement once an offer has been extended (current status: %)', v_status;
  end if;

  select client_id, role_id, title into v_client_id, v_role_id, v_request_title
    from public.client_requests where id = v_request_id;

  if p_seat_title is not null and btrim(p_seat_title) <> '' then
    v_seat_title := p_seat_title;
  else
    v_seat_title := v_request_title;
    if v_seat_title is null and v_role_id is not null then
      select name into v_role_name from public.job_roles where id = v_role_id;
      v_seat_title := v_role_name;
    end if;
  end if;

  insert into public.placements
    (candidate_id, client_id, client_request_id, role_id, seat_title, billing_start_date, monthly_rate, guarantee_window_expires, notes)
  values
    (v_candidate_id, v_client_id, v_request_id, v_role_id, v_seat_title, p_billing_start_date, p_monthly_rate, p_guarantee_window_expires, nullif(btrim(coalesce(p_notes, '')), ''))
  returning * into v_placement;

  update public.candidate_matches set status = 'hired' where id = p_match_id;
  update public.candidates set status = 'placed' where id = v_candidate_id;

  select full_name into v_candidate_name from public.candidates where id = v_candidate_id;
  select name into v_client_name from public.clients where id = v_client_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Candidate hired',
         coalesce(v_candidate_name, 'A candidate') || ' has been hired by ' || coalesce(v_client_name, 'a client') || ' -- placement created and billing setup begins now.',
         'hire_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_placement;
end;
$function$;

-- Drop the old RPC entirely so the bypass it caused can't recur (nothing should call it anymore
-- once the frontends are rewired).
drop function if exists public.request_to_hire(uuid);
