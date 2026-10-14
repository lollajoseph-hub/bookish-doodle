-- pg_get_functiondef() output for every non-extension function in schema public (70 functions).
-- Captured 2026-10-14 from project kjpozzjeddvctcabtnzg. No other app schemas (e.g. private) exist.
-- Function EXECUTE grants are at the end of this file.

CREATE OR REPLACE FUNCTION public._compute_match_score(p_candidate_id uuid, p_request_id uuid)
 RETURNS numeric
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
    + (
        select coalesce(count(*), 0) * 5
        from public.candidate_skills cs
        join public.client_request_skills rs on rs.skill_id = cs.skill_id
        where cs.candidate_id = p_candidate_id
          and rs.request_id = p_request_id
          and rs.is_required
      )
    + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
    + coalesce(ap.rank_score, 0)
  from public.client_requests req
  join public.candidates cand on cand.id = p_candidate_id
  left join public.candidate_roles cr_role on cr_role.candidate_id = p_candidate_id and cr_role.role_id = req.role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = p_candidate_id
  where req.id = p_request_id;
$function$
;

CREATE OR REPLACE FUNCTION public.add_or_get_skill_for_role(p_role_id uuid, p_skill_name text, p_category text DEFAULT 'Other'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_skill_id uuid;
  v_name text := btrim(coalesce(p_skill_name, ''));
begin
  if v_name = '' then
    raise exception 'skill name required';
  end if;
  if p_role_id is null then
    raise exception 'role_id required';
  end if;

  select id into v_skill_id from public.skills where lower(name) = lower(v_name) limit 1;
  if v_skill_id is null then
    insert into public.skills (name, category) values (v_name, coalesce(p_category, 'Other'))
    returning id into v_skill_id;
  end if;

  insert into public.role_skills (role_id, skill_id) values (p_role_id, v_skill_id)
  on conflict do nothing;

  return v_skill_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.add_thread_note(p_thread_id uuid, p_body text)
 RETURNS thread_notes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result public.thread_notes;
  v_kind text;
  v_client_id uuid;
begin
  select kind, client_id into v_kind, v_client_id from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;
  if v_kind <> 'candidate' then
    raise exception 'Interview Prep Notes are only available on candidate threads';
  end if;
  if trim(coalesce(p_body, '')) = '' then
    raise exception 'Note cannot be empty';
  end if;
  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_notes (thread_id, author_id, body)
  values (p_thread_id, auth.uid(), p_body)
  returning * into v_result;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_merge_skills(p_source_ids uuid[], p_target_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Admin-only, matching the admin-only Skills page (was is_staff()).
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  if p_target_id is null or p_source_ids is null or array_length(p_source_ids, 1) is null then
    raise exception 'Both source skills and a target skill are required';
  end if;

  -- never merge the target into itself
  p_source_ids := array(select distinct s from unnest(p_source_ids) s where s <> p_target_id);
  if array_length(p_source_ids, 1) is null then
    return;
  end if;

  if not exists (select 1 from public.skills where id = p_target_id) then
    raise exception 'Target skill does not exist';
  end if;

  -- candidate_skills: drop links that would collide with an existing target link
  delete from public.candidate_skills cs
  where cs.skill_id = any(p_source_ids)
    and exists (
      select 1 from public.candidate_skills t
      where t.candidate_id = cs.candidate_id and t.skill_id = p_target_id
    );

  update public.candidate_skills
     set skill_id = p_target_id
   where skill_id = any(p_source_ids);

  -- client_request_skills: same collision guard
  delete from public.client_request_skills crs
  where crs.skill_id = any(p_source_ids)
    and exists (
      select 1 from public.client_request_skills t
      where t.request_id = crs.request_id and t.skill_id = p_target_id
    );

  update public.client_request_skills
     set skill_id = p_target_id
   where skill_id = any(p_source_ids);

  -- role_skills: same collision guard (a role may already have the target skill tagged) -
  -- repoint rather than let the final `delete from skills` cascade-wipe these silently.
  delete from public.role_skills rsk
  where rsk.skill_id = any(p_source_ids)
    and exists (
      select 1 from public.role_skills t
      where t.role_id = rsk.role_id and t.skill_id = p_target_id
    );

  update public.role_skills
     set skill_id = p_target_id
   where skill_id = any(p_source_ids);

  delete from public.skills where id = any(p_source_ids);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_propose_interview_time(p_match_id uuid, p_proposed_at timestamp with time zone, p_notes text DEFAULT NULL::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_candidate_name text;
  v_tz text;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;
  if p_proposed_at is null then
    raise exception 'please propose a date and time for the interview';
  end if;
  if p_proposed_at <= now() then
    raise exception 'proposed interview time must be in the future';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_requested' then
    raise exception 'can only propose a new time for an interview that has been requested (current status: %)', v_status;
  end if;

  select client_id, timezone_requirement into v_client_id, v_tz from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set interview_proposed_at = p_proposed_at, interview_proposed_by = 'staff', interview_notes = coalesce(p_notes, interview_notes)
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'New interview time proposed',
         'ScaleSource proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           public.format_interview_time(p_proposed_at, v_tz) || '. Please confirm.', 'interview_time_proposed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_staff_signin_status()
 RETURNS TABLE(user_id uuid, confirmed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  ) then
    raise exception 'Forbidden: admin only';
  end if;

  return query
    select p.id as user_id, (u.email_confirmed_at is not null) as confirmed
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role in ('admin', 'recruiter');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_calendar_event(p_match uuid, p_client_event_id text, p_candidate_event_id text, p_meet_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.candidate_matches
     set client_event_id = p_client_event_id,
         candidate_event_id = p_candidate_event_id,
         meet_url = coalesce(p_meet_url, meet_url),
         gcal_synced_at = now()
   where id = p_match;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_match_reason(p_match_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  update public.candidate_matches
     set match_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_match_id
     and nullif(btrim(coalesce(p_reason, '')), '') is not null;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_meeting_capture(p_match uuid, p_notes_doc_url text, p_notes_text text, p_recording_url text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.candidate_matches
     set meeting_notes_doc_url = coalesce(p_notes_doc_url, meeting_notes_doc_url),
         meeting_notes_text = coalesce(p_notes_text, meeting_notes_text),
         meeting_notes_captured_at = case when p_notes_doc_url is not null then now() else meeting_notes_captured_at end,
         recording_url = coalesce(p_recording_url, recording_url),
         recording_captured_at = case when p_recording_url is not null then now() else recording_captured_at end
   where id = p_match;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_resume_profile(p_candidate_id uuid, p_profile jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.candidates
     set headline = coalesce(nullif(btrim(coalesce(p_profile->>'headline','')), ''), headline)
   where id = p_candidate_id;

  insert into public.candidate_ai_profiles
    (candidate_id, recruiter_summary, approved_summary, skills, highlights, ai_metadata, model_version, generated_at, updated_at, rank_score, rank_score_breakdown)
  values (
    p_candidate_id,
    nullif(btrim(coalesce(p_profile->>'recruiter_summary', p_profile->>'professional_summary', '')), ''),
    nullif(btrim(coalesce(p_profile->>'client_summary',    p_profile->>'professional_summary', '')), ''),
    coalesce(p_profile->'core_competencies', '[]'::jsonb),
    coalesce(p_profile->'key_strengths',     '[]'::jsonb),
    p_profile,
    coalesce(nullif(p_profile->>'model_version',''), 'groq/openai/gpt-oss-120b'),
    now(),
    now(),
    least(15, greatest(0, coalesce(nullif(p_profile->>'rank_score','')::numeric, 0))),
    jsonb_build_object(
      'experience_pts', least(5, greatest(0, coalesce(nullif(p_profile->>'rank_score_experience_pts','')::numeric, 0))),
      'skills_pts', least(5, greatest(0, coalesce(nullif(p_profile->>'rank_score_skills_pts','')::numeric, 0))),
      'certifications_pts', least(3, greatest(0, coalesce(nullif(p_profile->>'rank_score_certifications_pts','')::numeric, 0))),
      'completeness_pts', least(2, greatest(0, coalesce(nullif(p_profile->>'rank_score_completeness_pts','')::numeric, 0)))
    )
  )
  on conflict (candidate_id) do update set
    recruiter_summary = excluded.recruiter_summary,
    approved_summary  = excluded.approved_summary,
    skills            = excluded.skills,
    highlights        = excluded.highlights,
    ai_metadata       = excluded.ai_metadata,
    model_version     = excluded.model_version,
    generated_at      = excluded.generated_at,
    updated_at        = excluded.updated_at,
    rank_score        = excluded.rank_score,
    rank_score_breakdown = excluded.rank_score_breakdown;

  delete from public.candidate_work_history where candidate_id = p_candidate_id;
  insert into public.candidate_work_history (candidate_id, company, title, start_date, end_date, description)
  select p_candidate_id,
         nullif(btrim(coalesce(w->>'organization','')), ''),
         left(btrim(coalesce(w->>'job_title','')), 250),
         nullif(btrim(coalesce(w->>'start_date','')), ''),
         case when coalesce((w->>'is_current')::boolean,false) then 'Present'
              else nullif(btrim(coalesce(w->>'end_date','')), '') end,
         nullif(btrim(coalesce(w->>'description','')), '')
  from jsonb_array_elements(coalesce(p_profile->'work_history','[]'::jsonb)) as w
  where coalesce(nullif(btrim(coalesce(w->>'job_title','')), ''), '') <> '';

  delete from public.candidate_education where candidate_id = p_candidate_id;
  insert into public.candidate_education (candidate_id, institution, degree, field, start_date, end_date)
  select p_candidate_id,
         left(btrim(coalesce(e->>'institution','')), 250),
         nullif(btrim(coalesce(e->>'qualification','')), ''),
         nullif(btrim(coalesce(e->>'field_of_study','')), ''),
         coalesce(
           nullif(btrim(coalesce(e->>'start_date','')), ''),
           nullif(btrim(coalesce(e->>'start_year','')), '')
         ),
         coalesce(
           nullif(btrim(coalesce(e->>'end_date','')), ''),
           nullif(btrim(coalesce(e->>'end_year','')), '')
         )
  from jsonb_array_elements(coalesce(p_profile->'education','[]'::jsonb)) as e
  where coalesce(nullif(btrim(coalesce(e->>'institution','')), ''), '') <> '';

  delete from public.candidate_skills cs
  using public.skills s
  where cs.skill_id = s.id
    and cs.candidate_id = p_candidate_id
    and s.category in ('Software','Customer Service');

  insert into public.skills (name, category)
  select distinct left(nm,120) as name, category from (
      select btrim(nm) as nm, 'Software'::text as category
        from jsonb_array_elements_text(coalesce(p_profile->'software_skills','[]'::jsonb)) as nm
      union select btrim(nm), 'Customer Service'
        from jsonb_array_elements_text(coalesce(p_profile->'core_competencies','[]'::jsonb)) as nm
      union select btrim(nm), 'Customer Service'
        from jsonb_array_elements_text(coalesce(p_profile->'transferable_skills','[]'::jsonb)) as nm
  ) s
  where coalesce(nm,'') <> ''
  on conflict (name, category) do nothing;

  insert into public.candidate_skills (candidate_id, skill_id, proficiency_level, years_experience)
  select p_candidate_id, sk.id, 'intermediate', null
  from public.skills sk
  join (
      select distinct left(nm,120) as fname, category from (
        select btrim(nm) as nm, 'Software'::text as category
          from jsonb_array_elements_text(coalesce(p_profile->'software_skills','[]'::jsonb)) as nm
        union select btrim(nm), 'Customer Service'
          from jsonb_array_elements_text(coalesce(p_profile->'core_competencies','[]'::jsonb)) as nm
        union select btrim(nm), 'Customer Service'
          from jsonb_array_elements_text(coalesce(p_profile->'transferable_skills','[]'::jsonb)) as nm
      ) x where coalesce(nm,'') <> ''
  ) f on f.fname = sk.name and f.category = sk.category
  on conflict (candidate_id, skill_id) do nothing;

  delete from public.candidate_skills cs
  using public.skills s
  where cs.skill_id = s.id
    and cs.candidate_id = p_candidate_id
    and s.category = 'Languages';

  insert into public.skills (name, category)
  select distinct left(btrim(nm),120), 'Languages'
  from jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb)) as nm
  where coalesce(btrim(nm),'') <> ''
  on conflict (name, category) do nothing;

  insert into public.candidate_skills (candidate_id, skill_id, proficiency_level, years_experience)
  select p_candidate_id, sk.id, 'intermediate', null
  from public.skills sk
  join (
      select distinct left(btrim(nm),120) as fname
      from jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb)) as nm
      where coalesce(btrim(nm),'') <> ''
  ) f on f.fname = sk.name
  where sk.category = 'Languages'
  on conflict (candidate_id, skill_id) do nothing;
end
$function$
;

CREATE OR REPLACE FUNCTION public.audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_entity_id uuid;
begin
  begin
    v_entity_id := coalesce((new).id, (old).id);
  exception when others then
    v_entity_id := null;
  end;

  insert into public.audit_logs (user_id, entity_type, entity_id, action, old_values, new_values)
  values (
    auth.uid(),
    tg_table_name,
    v_entity_id,
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('UPDATE','INSERT') then to_jsonb(new) else null end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.candidate_primary_role(p_candidate_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select r.name from public.candidate_roles cr
  join public.job_roles r on r.id = cr.role_id
  where cr.candidate_id = p_candidate_id and cr.is_primary
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.client_book_interview_slot(p_match_id uuid, p_slot_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_candidate_id uuid;
  v_status public.match_status;
  v_slot public.candidate_interview_slots;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  select client_request_id, candidate_id, status into v_request_id, v_candidate_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;
  if not exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if v_status not in ('recommended', 'shortlisted', 'interview_requested') then
    raise exception 'cannot book an interview from this state (current status: %)', v_status;
  end if;

  select * into v_slot from public.candidate_interview_slots
    where id = p_slot_id and candidate_id = v_candidate_id
    for update;
  if v_slot.id is null then
    raise exception 'that time is no longer available';
  end if;
  if v_slot.starts_at <= now() then
    raise exception 'that time has already passed';
  end if;
  if public.slot_is_taken(v_slot) then
    raise exception 'that time was just booked by someone else, please pick another';
  end if;

  update public.candidate_interview_slots
    set booked_match_id = p_match_id, booked_at = now()
    where id = p_slot_id;

  update public.candidate_matches
    set status = 'interview_confirmed',
        interview_proposed_at = v_slot.starts_at,
        interview_proposed_by = 'client',
        interview_scheduled_at = v_slot.starts_at,
        interview_duration_minutes = v_slot.duration_minutes
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview booked',
         coalesce(v_client_name, 'A client') || ' booked an interview with ' || coalesce(v_candidate_name, 'a candidate') || ': ' ||
           to_char(v_slot.starts_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_confirmed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_can_view_candidate(p_candidate_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.candidate_matches cm
    join public.client_requests cr on cr.id = cm.client_request_id
    join public.client_members cme on cme.client_id = cr.client_id
    where cm.candidate_id = p_candidate_id and cme.profile_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.client_confirm_interview_time(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_proposed timestamptz;
  v_proposed_by text;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  select client_request_id, status, interview_proposed_at, interview_proposed_by
    into v_request_id, v_status, v_proposed, v_proposed_by
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'interview_requested' then
    raise exception 'can only confirm an interview that has been requested (current status: %)', v_status;
  end if;
  if v_proposed is null then
    raise exception 'no proposed time to confirm';
  end if;
  if v_proposed_by <> 'staff' then
    raise exception 'waiting on ScaleSource to confirm your proposed time';
  end if;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = v_proposed
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview time confirmed',
         coalesce(v_client_name, 'The client') || ' confirmed the interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(v_proposed at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_confirmed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_ids_for_profile(p_profile_id uuid)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select client_id from public.client_members where profile_id = p_profile_id;
$function$
;

CREATE OR REPLACE FUNCTION public.client_owns_request(p_request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.client_requests cr
    join public.client_members cme on cme.client_id = cr.client_id
    where cr.id = p_request_id and cme.profile_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.client_propose_interview_time(p_match_id uuid, p_proposed_at timestamp with time zone)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  if p_proposed_at is null then
    raise exception 'please propose a date and time for the interview';
  end if;
  if p_proposed_at <= now() then
    raise exception 'proposed interview time must be in the future';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  if v_status <> 'interview_requested' then
    raise exception 'can only propose a new time for an interview that has been requested (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set interview_proposed_at = p_proposed_at, interview_proposed_by = 'client'
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'New interview time proposed',
         coalesce(v_client_name, 'The client') || ' proposed a new interview time for ' || coalesce(v_candidate_name, 'the candidate') || ': ' ||
           to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC. Please confirm.', 'interview_time_proposed'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_rate_candidate(p_match_id uuid, p_rating smallint, p_note text DEFAULT NULL::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_interview_done timestamptz;
  v_result public.candidate_matches;
  v_candidate_name text;
  v_recruiter_id uuid;
  v_client_name text;
begin
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'rating must be between 1 and 5';
  end if;

  select client_request_id, interview_completed_at into v_request_id, v_interview_done
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  if v_interview_done is null then
    raise exception 'candidate has not been interviewed yet -- rating is only available after the interview is completed';
  end if;

  update public.candidate_matches
    set client_rating = p_rating, client_rating_note = nullif(btrim(coalesce(p_note, '')), ''), client_rated_at = now()
    where id = p_match_id
    returning * into v_result;

  select cd.full_name, cd.recruiter_id into v_candidate_name, v_recruiter_id
    from public.candidates cd where cd.id = v_result.candidate_id;
  select c.name into v_client_name from public.clients c where c.id = v_client_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
    'Client rated a candidate',
    coalesce(v_client_name, 'A client') || ' rated ' || coalesce(v_candidate_name, 'a candidate') ||
      ' ' || p_rating || '/5 after their interview' ||
      case when p_note is not null and btrim(p_note) <> '' then ': "' || btrim(p_note) || '"' else '' end,
    'candidate_rated'
  from public.profiles p
  where p.is_active and (p.role = 'admin' or p.id = v_recruiter_id);

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_request_hire(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.client_request_interview(p_match_id uuid, p_proposed_at timestamp with time zone)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
  v_client_name text;
  v_candidate_name text;
begin
  if p_proposed_at is null then
    raise exception 'please propose a date and time for the interview';
  end if;
  if p_proposed_at <= now() then
    raise exception 'proposed interview time must be in the future';
  end if;

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

  if v_status not in ('recommended', 'shortlisted') then
    raise exception 'cannot request an interview from this state (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set status = 'interview_requested', interview_proposed_at = p_proposed_at, interview_proposed_by = 'client'
    where id = p_match_id
    returning * into v_result;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id, 'Interview requested',
         coalesce(v_client_name, 'A client') || ' requested an interview with ' || coalesce(v_candidate_name, 'a candidate') ||
           ' and proposed ' || to_char(p_proposed_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC.', 'interview_requested'
  from public.profiles p where p.role = 'admin' and p.is_active;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.client_shortlist_candidate(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_result public.candidate_matches;
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

  if v_status not in ('recommended', 'shortlisted') then
    raise exception 'cannot change shortlist status once a match has moved past review (current status: %)', v_status;
  end if;

  update public.candidate_matches
    set status = (case when v_status = 'shortlisted' then 'recommended' else 'shortlisted' end)::public.match_status,
        shortlisted_at = case when v_status = 'shortlisted' then null else now() end,
        shortlist_reminder_sent_at = null
    where id = p_match_id
    returning * into v_result;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.complete_interview(p_match_id uuid, p_notes text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if coalesce(btrim(p_notes), '') = '' then
    raise exception 'interview notes are required so the client has a basis to decide';
  end if;

  select client_request_id, status into v_request_id, v_status
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_confirmed' then
    raise exception 'can only complete an interview that was confirmed (current status: %)', v_status;
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_completed', interview_notes = p_notes, interview_completed_at = now()
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview completed - notes ready',
         'Interview notes for ' || coalesce(v_candidate_name, 'the candidate') || ' are ready for you to review. You can now request to hire.', 'interview_completed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.confirm_interview(p_match_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_status public.match_status;
  v_proposed timestamptz;
  v_result public.candidate_matches;
  v_candidate_name text;
  v_tz text;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select client_request_id, status, interview_proposed_at into v_request_id, v_status, v_proposed
    from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if v_status <> 'interview_requested' then
    raise exception 'can only confirm an interview that has been requested (current status: %)', v_status;
  end if;
  if v_proposed is null then
    raise exception 'no proposed time to confirm';
  end if;

  select client_id, timezone_requirement into v_client_id, v_tz from public.client_requests where id = v_request_id;

  update public.candidate_matches
    set status = 'interview_confirmed', interview_scheduled_at = v_proposed, interview_notes = p_notes
    where id = p_match_id
    returning * into v_result;

  select split_part(cd.full_name, ' ', 1) into v_candidate_name from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select cm.profile_id, 'Interview confirmed',
         'Your interview with ' || coalesce(v_candidate_name, 'the candidate') || ' was confirmed for ' || public.format_interview_time(v_proposed, v_tz), 'interview_confirmed'
  from public.client_members cm where cm.client_id = v_client_id;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_placement_and_mark_hired(p_match_id uuid, p_seat_title text DEFAULT NULL::text, p_billing_start_date date DEFAULT NULL::date, p_monthly_rate numeric DEFAULT NULL::numeric, p_guarantee_window_expires date DEFAULT NULL::date, p_notes text DEFAULT NULL::text)
 RETURNS placements
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_candidate_recruiter()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    -- Non-admins can only ever create candidates assigned to themselves.
    if not is_admin() then
      new.recruiter_id := auth.uid();
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.recruiter_id is distinct from old.recruiter_id and not is_admin() then
      raise exception 'Only admin can reassign a candidate''s recruiter';
    end if;
    return new;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_one_primary_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.is_primary then
    update public.candidate_roles
      set is_primary = false
      where candidate_id = new.candidate_id and role_id <> new.role_id and is_primary;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.format_interview_time(p_at timestamp with time zone, p_tz text)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select case
    when p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz)
      then to_char(p_at at time zone p_tz, 'Mon DD, YYYY HH12:MI AM') || ' (' || p_tz || ')'
    else to_char(p_at at time zone 'UTC', 'Mon DD, YYYY HH12:MI AM') || ' UTC'
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_interview_calendar_payload(p_match uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'match_id', m.id,
    'status', m.status::text,
    'start', m.interview_scheduled_at,
    'duration_minutes', m.interview_duration_minutes,
    'timezone', coalesce(ca.timezone, 'UTC'),
    'client_timezone', case
      when exists (select 1 from pg_timezone_names where name = cr.timezone_requirement) then cr.timezone_requirement
      else null
    end,
    'mode', 'video',
    'client_event_id', m.client_event_id,
    'candidate_event_id', m.candidate_event_id,
    'candidate_name', ca.full_name,
    'candidate_email', ca.email,
    'client_name', cl.name,
    'client_email', (
      select p.email from public.client_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.client_id = cl.id and cm.is_primary
      limit 1
    ),
    'recruiter_email', pr.email,
    'role_title', coalesce(cr.title, jr.name)
  )
  from public.candidate_matches m
  join public.candidates ca on ca.id = m.candidate_id
  left join public.client_requests cr on cr.id = m.client_request_id
  left join public.clients cl on cl.id = cr.client_id
  left join public.job_roles jr on jr.id = cr.role_id
  left join public.profiles pr on pr.id = ca.recruiter_id
  where m.id = p_match;
$function$
;

CREATE OR REPLACE FUNCTION public.get_match_interview_slots(p_match_id uuid)
 RETURNS TABLE(id uuid, starts_at timestamp with time zone, duration_minutes integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_candidate_id uuid;
begin
  select client_request_id, candidate_id into v_request_id, v_candidate_id
    from public.candidate_matches where candidate_matches.id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;
  if not (public.is_staff() or public.client_owns_request(v_request_id)) then
    raise exception 'not authorized';
  end if;

  return query
    select s.id, s.starts_at, s.duration_minutes
    from public.candidate_interview_slots s
    where s.candidate_id = v_candidate_id
      and s.starts_at > now()
      and not public.slot_is_taken(s)
    order by s.starts_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_match_score_breakdown(p_match_id uuid)
 RETURNS TABLE(match_id uuid, match_created_at timestamp with time zone, role_name text, is_primary_role boolean, role_fit_points integer, matched_required_skills text[], missing_required_skills text[], skills_points integer, candidate_years_experience numeric, required_years_experience_min numeric, experience_points integer, ai_rank_score numeric, ai_rank_score_breakdown jsonb, computed_total numeric, stored_match_score numeric, is_stale boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  return query
  select
    cm.id as match_id,
    cm.created_at as match_created_at,
    jr.name as role_name,
    cr_role.is_primary as is_primary_role,
    (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)::int as role_fit_points,
    coalesce(matched.names, array[]::text[]) as matched_required_skills,
    coalesce(missing.names, array[]::text[]) as missing_required_skills,
    (coalesce(matched.cnt, 0) * 5)::int as skills_points,
    cand.years_experience as candidate_years_experience,
    req.years_experience_min as required_years_experience_min,
    (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)::int as experience_points,
    coalesce(ap.rank_score, 0) as ai_rank_score,
    ap.rank_score_breakdown as ai_rank_score_breakdown,
    (
      (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
      + (coalesce(matched.cnt, 0) * 5)
      + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
    )::numeric as computed_total,
    cm.match_score as stored_match_score,
    (
      (
        (case when coalesce(cr_role.is_primary, false) then 50 else 20 end)
        + (coalesce(matched.cnt, 0) * 5)
        + (case when coalesce(cand.years_experience, 0) >= coalesce(req.years_experience_min, 0) then 10 else 0 end)
        + coalesce(ap.rank_score, 0)
      )::numeric <> cm.match_score
    ) as is_stale
  from public.candidate_matches cm
  join public.client_requests req on req.id = cm.client_request_id
  join public.candidates cand on cand.id = cm.candidate_id
  left join public.candidate_roles cr_role on cr_role.candidate_id = cand.id and cr_role.role_id = req.role_id
  left join public.job_roles jr on jr.id = req.role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = cand.id
  left join lateral (
    select count(*) as cnt, array_agg(s.name) as names
    from public.candidate_skills cs
    join public.client_request_skills rs on rs.skill_id = cs.skill_id
    join public.skills s on s.id = cs.skill_id
    where cs.candidate_id = cand.id
      and rs.request_id = req.id
      and rs.is_required
  ) matched on true
  left join lateral (
    select array_agg(s.name) as names
    from public.client_request_skills rs
    join public.skills s on s.id = rs.skill_id
    where rs.request_id = req.id
      and rs.is_required
      and not exists (
        select 1 from public.candidate_skills cs
        where cs.candidate_id = cand.id and cs.skill_id = rs.skill_id
      )
  ) missing on true
  where cm.id = p_match_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_or_create_thread(p_client_request_id uuid DEFAULT NULL::uuid, p_candidate_match_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid)
 RETURNS threads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  v_client_request_id uuid := p_client_request_id;
  v_client_id uuid := p_client_id;
  v_result public.threads;
begin
  if p_candidate_match_id is not null then
    v_kind := 'candidate';
    select client_request_id into v_client_request_id from public.candidate_matches where id = p_candidate_match_id;
    if v_client_request_id is null then raise exception 'match not found'; end if;
    select client_id into v_client_id from public.client_requests where id = v_client_request_id;
  elsif p_client_request_id is not null then
    v_kind := 'request';
    select client_id into v_client_id from public.client_requests where id = p_client_request_id;
    if v_client_id is null then raise exception 'request not found'; end if;
  else
    v_kind := 'general';
    v_client_request_id := null;
    if v_client_id is null then raise exception 'client_id required for a general thread'; end if;
  end if;

  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  if v_kind = 'general' then
    select * into v_result from public.threads where client_id = v_client_id and kind = 'general';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, kind) values (v_client_id, 'general') returning * into v_result;
  elsif v_kind = 'request' then
    select * into v_result from public.threads where client_request_id = v_client_request_id and kind = 'request';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, client_request_id, kind) values (v_client_id, v_client_request_id, 'request')
      returning * into v_result;
  else
    select * into v_result from public.threads where candidate_match_id = p_candidate_match_id and kind = 'candidate';
    if v_result.id is not null then return v_result; end if;
    insert into public.threads (client_id, client_request_id, candidate_match_id, kind)
      values (v_client_id, v_client_request_id, p_candidate_match_id, 'candidate')
      returning * into v_result;
  end if;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pending_meeting_captures(p_since interval DEFAULT '4 days'::interval)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'match_id', m.id,
    'interview_scheduled_at', m.interview_scheduled_at,
    'candidate_name', ca.full_name,
    'client_name', cl.name,
    'client_email', (
      select p.email from public.client_members cm
      join public.profiles p on p.id = cm.profile_id
      where cm.client_id = cl.id and cm.is_primary
      limit 1
    )
  )), '[]'::jsonb)
  from public.candidate_matches m
  join public.candidates ca on ca.id = m.candidate_id
  left join public.client_requests cr on cr.id = m.client_request_id
  left join public.clients cl on cl.id = cr.client_id
  where m.interview_scheduled_at is not null
    and m.interview_scheduled_at < now()
    and m.interview_scheduled_at > now() - p_since
    and (m.meeting_notes_captured_at is null or m.recording_captured_at is null);
$function$
;

CREATE OR REPLACE FUNCTION public.get_role_skills(p_role_id uuid)
 RETURNS TABLE(skill_id uuid, name text, category text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id as skill_id, s.name, s.category
  from public.role_skills rsk
  join public.skills s on s.id = rsk.skill_id
  where rsk.role_id = p_role_id
  order by s.name;
$function$
;

CREATE OR REPLACE FUNCTION public.get_thread_note_authors(p_thread_id uuid)
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name, p.role
  from profiles p
  where p.id in (
    select distinct tn.author_id from thread_notes tn where tn.thread_id = p_thread_id
  )
  and (
    is_staff()
    or exists (
      select 1 from threads t
      where t.id = p_thread_id
        and t.client_id in (select client_ids_for_profile(auth.uid()))
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.get_thread_sender_profiles(p_thread_id uuid)
 RETURNS TABLE(id uuid, full_name text, role text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name, p.role
  from profiles p
  where p.id in (
    select distinct tm.sender_id
    from thread_messages tm
    where tm.thread_id = p_thread_id
      and tm.sender_role = 'staff'
      and tm.sender_id is not null
  )
  and (
    is_staff()
    or exists (
      select 1
      from threads t
      join client_members cm on cm.client_id = t.client_id
      where t.id = p_thread_id
        and cm.profile_id = auth.uid()
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.handle_candidate_role_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_count int;
begin
  select count(*) into v_role_count from public.candidate_roles where candidate_id = new.candidate_id;
  if v_role_count = 1 then
    perform public.reverse_match_new_candidate(new.candidate_id);
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.user_role, 'client'),
    new.raw_user_meta_data->>'full_name',
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_client()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'client' and is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_recruiter()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'recruiter' and is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION public.is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin','recruiter') and is_active
  );
$function$
;

CREATE OR REPLACE FUNCTION public.log_match_view(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
begin
  select client_request_id into v_request_id
  from public.candidate_matches where id = p_match_id;

  if v_request_id is null then
    raise exception 'match not found';
  end if;

  -- Only an actual client user viewing their own request's candidate counts as a "view".
  -- Staff browsing the same profile in the Dashboard app should not inflate this metric.
  if not public.client_owns_request(v_request_id) then
    raise exception 'not authorized';
  end if;

  insert into public.match_views (match_id, viewed_by)
  values (p_match_id, auth.uid());
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_thread_read(p_thread_id uuid, p_read_at timestamp with time zone)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  insert into public.thread_reads (user_id, thread_id, last_read_at)
  values (auth.uid(), p_thread_id, p_read_at)
  on conflict (user_id, thread_id) do update
    set last_read_at = greatest(public.thread_reads.last_read_at, excluded.last_read_at),
        updated_at = now();
$function$
;

CREATE OR REPLACE FUNCTION public.notify_email_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_secret text;
begin
  if not new.send_email then
    return new;
  end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notification_hook_secret' limit 1;

  perform net.http_post(
    url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/send-notification-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', coalesce(v_secret, '')
    ),
    body := jsonb_build_object('notification_id', new.id)
  );

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rank_and_match(p_request_id uuid, p_limit integer DEFAULT 4)
 RETURNS SETOF candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role_id uuid;
  v_years_min numeric;
  v_source public.client_request_source;
begin
  if not (auth.role() = 'service_role' or public.is_staff() or public.client_owns_request(p_request_id)) then
    raise exception 'not authorized';
  end if;

  select role_id, years_experience_min, source into v_role_id, v_years_min, v_source
  from public.client_requests where id = p_request_id;

  if v_role_id is null then
    raise exception 'request not found';
  end if;

  if v_source = 'staff_curated' then
    raise exception 'this request is staff-curated; candidates are hand-picked, not algorithmically matched';
  end if;

  return query
  insert into public.candidate_matches (client_request_id, candidate_id, match_score, match_reason, status)
  select
    p_request_id,
    c.id,
    (
      (case when cr.is_primary then 50 else 20 end)
      + coalesce((
          select count(*) * 5 from public.candidate_skills cs
          join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
          where cs.candidate_id = c.id and rs.request_id = p_request_id
        ), 0)
      + (case when c.years_experience >= coalesce(v_years_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
    )::numeric as match_score,
    'Structured match: role fit, required skills, years of experience, AI rank score' as match_reason,
    'recommended'::public.match_status
  from public.candidates c
  join public.candidate_roles cr on cr.candidate_id = c.id and cr.role_id = v_role_id
  left join public.candidate_ai_profiles ap on ap.candidate_id = c.id
  where c.status = 'available'
    and not exists (
      select 1 from public.candidate_matches existing
      where existing.client_request_id = p_request_id and existing.candidate_id = c.id
    )
  order by (
      (case when cr.is_primary then 50 else 20 end)
      + coalesce((
          select count(*) * 5 from public.candidate_skills cs
          join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
          where cs.candidate_id = c.id and rs.request_id = p_request_id
        ), 0)
      + (case when c.years_experience >= coalesce(v_years_min, 0) then 10 else 0 end)
      + coalesce(ap.rank_score, 0)
  ) desc
  limit p_limit
  returning *;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.refresh_match_score(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_new_score numeric;
  v_row public.candidate_matches;
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  select b.computed_total into v_new_score
  from public.get_match_score_breakdown(p_match_id) b;

  if v_new_score is null then
    raise exception 'match not found';
  end if;

  update public.candidate_matches
     set match_score = v_new_score
   where id = p_match_id
  returning * into v_row;

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reject_candidate_match(p_match_id uuid, p_reason rejection_reason, p_note text DEFAULT NULL::text, p_rejected_by text DEFAULT 'client'::text)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
  v_client_id uuid;
  v_client_name text;
  v_candidate_name text;
  v_recruiter_id uuid;
  v_new_count int;
  v_by text;
  v_result public.candidate_matches;
begin
  select client_request_id into v_request_id from public.candidate_matches where id = p_match_id;
  if v_request_id is null then
    raise exception 'match not found';
  end if;

  select client_id into v_client_id from public.client_requests where id = v_request_id;

  if not (public.is_staff() or exists (
    select 1 from public.client_members where client_id = v_client_id and profile_id = auth.uid()
  )) then
    raise exception 'not authorized';
  end if;

  -- only staff can actually record a staff rejection; anyone else (i.e. a client) is
  -- forced to 'client' regardless of what they pass, so this can't be spoofed.
  v_by := case when p_rejected_by = 'staff' and public.is_staff() then 'staff' else 'client' end;

  update public.candidate_matches
    set status = 'rejected', rejection_reason = p_reason, rejection_reason_note = p_note, rejected_at = now(), rejected_by = v_by
    where id = p_match_id
    returning * into v_result;

  update public.client_requests
    set rejection_count = rejection_count + 1
    where id = v_request_id
    returning rejection_count into v_new_count;

  select c.name into v_client_name from public.clients c where c.id = v_client_id;
  select cd.full_name, cd.recruiter_id into v_candidate_name, v_recruiter_id
    from public.candidates cd where cd.id = v_result.candidate_id;

  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
         'Candidate rejected',
         coalesce(v_client_name, 'A client') || ' rejected ' || coalesce(v_candidate_name, 'a candidate') ||
           ' -- ' || coalesce(replace(p_reason::text, '_', ' '), 'no reason given') ||
           case when p_note is not null and p_note <> '' then ': ' || p_note else '' end,
         'candidate_rejected'
  from public.profiles p
  where p.is_active and (p.role = 'admin' or p.id = v_recruiter_id);

  if v_new_count >= 4 then
    insert into public.notifications (recipient_id, title, message, type)
    select p.id, 'Request needs a rematch',
           coalesce(v_client_name, 'A client') || ' has rejected all 4 presented candidates for this request. Reshuffle it from Admin Tools.',
           'request_needs_rematch'
    from public.profiles p where p.role = 'admin' and p.is_active;
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reshuffle_request(p_request_id uuid, p_limit integer DEFAULT 4)
 RETURNS SETOF candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff() then
    raise exception 'not authorized';
  end if;

  update public.client_requests set rejection_count = 0, status = 'open' where id = p_request_id;

  return query select * from public.rank_and_match(p_request_id, p_limit);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolve_or_create_skills(p_names text[])
 RETURNS uuid[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_name text;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_cleaned text[];
begin
  select array_agg(distinct trim(n)) into v_cleaned
  from unnest(p_names) as n
  where trim(n) <> '';

  if v_cleaned is null then
    return v_ids;
  end if;

  foreach v_name in array v_cleaned loop
    -- Reuse an existing skill regardless of category (so a client typing "QuickBooks"
    -- reconnects to the same skill candidates already have tagged from resume
    -- extraction, instead of forking a duplicate under a new category).
    select id into v_id from public.skills where lower(name) = lower(v_name) limit 1;
    if v_id is null then
      insert into public.skills (name, category) values (v_name, 'Other') returning id into v_id;
    end if;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return v_ids;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reverse_match_new_candidate(p_candidate_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_years_experience numeric;
  v_min_score numeric := 40;
  v_limit int := 5;
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  select years_experience into v_years_experience
  from public.candidates where id = p_candidate_id;

  if v_years_experience is null then
    return;
  end if;

  with scored as (
    select
      cr2.id as request_id,
      cr2.title,
      (
        (case when cand_role.is_primary then 50 else 20 end)
        + coalesce((
            select count(*) * 5 from public.candidate_skills cs
            join public.client_request_skills rs on rs.skill_id = cs.skill_id and rs.is_required
            where cs.candidate_id = p_candidate_id and rs.request_id = cr2.id
          ), 0)
        + (case when v_years_experience >= coalesce(cr2.years_experience_min, 0) then 10 else 0 end)
        + coalesce(ap.rank_score, 0)
      )::numeric as score
    from public.client_requests cr2
    join public.candidate_roles cand_role
      on cand_role.role_id = cr2.role_id and cand_role.candidate_id = p_candidate_id
    left join public.candidate_ai_profiles ap on ap.candidate_id = p_candidate_id
    where cr2.status in ('open', 'needs_attention')
      and cr2.source <> 'staff_curated'
      and not exists (
        select 1 from public.candidate_matches m
        where m.client_request_id = cr2.id and m.candidate_id = p_candidate_id
      )
  ),
  top_requests as (
    select * from scored
    where score >= v_min_score
    order by score desc
    limit v_limit
  )
  insert into public.notifications (recipient_id, title, message, type)
  select p.id,
    'New candidate could fill an open request',
    coalesce((select full_name from public.candidates where id = p_candidate_id), 'A new candidate')
      || ' looks like a fit for "' || coalesce(t.title, 'an open request') || '" (match score ' || t.score::int || ') -- review and add them if it''s a fit.',
    'reverse_match'
  from top_requests t
  join public.profiles p on p.role in ('admin', 'recruiter') and p.is_active;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_stale_shortlist_reminders(p_stale_after interval DEFAULT '7 days'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_count int := 0;
  m record;
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  for m in
    select cm.id as match_id, cm.client_request_id, c.full_name as candidate_name,
           cr.title as request_title, cr.client_id
    from public.candidate_matches cm
    join public.candidates c on c.id = cm.candidate_id
    join public.client_requests cr on cr.id = cm.client_request_id
    where cm.status = 'shortlisted'
      and cm.shortlisted_at is not null
      and cm.shortlisted_at <= now() - p_stale_after
      and cm.shortlist_reminder_sent_at is null
  loop
    insert into public.notifications (recipient_id, title, message, type, send_email)
    select cmem.profile_id,
      'A shortlisted candidate is waiting on you',
      coalesce(m.candidate_name, 'A candidate') || ' has been shortlisted for '
        || coalesce(m.request_title, 'your request') || ' for over a week -- take a look and let us know your decision.',
      'stale_shortlist_reminder',
      true
    from public.client_members cmem
    where cmem.client_id = m.client_id;

    update public.candidate_matches set shortlist_reminder_sent_at = now() where id = m.match_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_thread_message(p_thread_id uuid, p_body text, p_structured_type text DEFAULT NULL::text)
 RETURNS thread_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_is_staff boolean := public.is_staff();
  v_result public.thread_messages;
  v_kind text;
  v_client_id uuid;
  v_client_request_id uuid;
  v_candidate_match_id uuid;
  v_candidate_id uuid;
  v_recruiter_id uuid;
  v_created_by uuid;
  v_created_by_is_staff boolean := false;
  v_title text;
  v_role_name text;
  v_role_label text;
  v_candidate_name text;
  v_client_name text;
  v_staff_message text;
  v_client_message text;
begin
  if btrim(coalesce(p_body,'')) = '' then
    raise exception 'message body cannot be empty';
  end if;

  select kind, client_id, client_request_id, candidate_match_id
    into v_kind, v_client_id, v_client_request_id, v_candidate_match_id
    from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;

  if not (
    v_is_staff
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_messages (thread_id, sender_id, sender_role, body, structured_type)
    values (p_thread_id, auth.uid(), case when v_is_staff then 'staff' else 'client' end, p_body, p_structured_type)
    returning * into v_result;

  select name into v_client_name from public.clients where id = v_client_id;
  v_client_name := coalesce(v_client_name, 'A client');

  if v_client_request_id is not null then
    select cr.title, cr.created_by, jr.name
      into v_title, v_created_by, v_role_name
      from public.client_requests cr
      left join public.job_roles jr on jr.id = cr.role_id
      where cr.id = v_client_request_id;
  end if;
  v_role_label := coalesce(v_title, v_role_name, 'their request');

  if v_candidate_match_id is not null then
    select candidate_id into v_candidate_id from public.candidate_matches where id = v_candidate_match_id;
    select recruiter_id into v_recruiter_id from public.candidates where id = v_candidate_id;
    select full_name into v_candidate_name from public.candidates where id = v_candidate_id;
  end if;

  -- created_by on client_requests can be the client's own profile (self-submitted
  -- requests), so it's only a valid notification target when it's actually staff.
  if v_created_by is not null then
    select true into v_created_by_is_staff
    from public.profiles
    where id = v_created_by and role in ('admin','recruiter') and is_active;
    v_created_by_is_staff := coalesce(v_created_by_is_staff, false);
  end if;

  v_staff_message := case v_kind
    when 'request' then 'ScaleSource sent a message about your ' || v_role_label || ' request'
    when 'candidate' then 'ScaleSource sent a message about ' || coalesce(v_candidate_name, 'a candidate')
    else 'ScaleSource sent a message'
  end;

  v_client_message := case v_kind
    when 'request' then v_client_name || ' has sent a message about their ' || v_role_label || ' role'
    when 'candidate' then v_client_name || ' has sent a message about ' || coalesce(v_candidate_name, 'a candidate')
    else v_client_name || ' has sent a message'
  end;

  if v_is_staff then
    insert into public.notifications (recipient_id, title, message, type)
    select cm.profile_id, 'New message', v_staff_message, 'thread_message'
    from public.client_members cm where cm.client_id = v_client_id;
  else
    if v_kind = 'general' then
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', v_client_message, 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    elsif v_recruiter_id is not null then
      insert into public.notifications (recipient_id, title, message, type)
      values (v_recruiter_id, 'New message', v_client_message, 'thread_message');
    elsif v_created_by_is_staff then
      insert into public.notifications (recipient_id, title, message, type)
      values (v_created_by, 'New message', v_client_message, 'thread_message');
    else
      -- No assigned recruiter and no staff creator on record (e.g. a client-submitted
      -- request with nobody assigned yet): notify all active staff instead of no one.
      insert into public.notifications (recipient_id, title, message, type)
      select p.id, 'New message', v_client_message, 'thread_message'
      from public.profiles p where p.role in ('admin','recruiter') and p.is_active;
    end if;
  end if;

  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.send_thread_message_ensuring_thread(p_client_request_id uuid DEFAULT NULL::uuid, p_candidate_match_id uuid DEFAULT NULL::uuid, p_client_id uuid DEFAULT NULL::uuid, p_body text DEFAULT NULL::text, p_structured_type text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_thread public.threads;
  v_message public.thread_messages;
begin
  -- Same transaction as the message insert below: if send_thread_message raises,
  -- the thread row created here rolls back too, so a failed send can never
  -- leave an orphaned empty thread behind.
  v_thread := public.get_or_create_thread(p_client_request_id, p_candidate_match_id, p_client_id);
  v_message := public.send_thread_message(v_thread.id, p_body, p_structured_type);

  return jsonb_build_object(
    'thread', to_jsonb(v_thread),
    'message', to_jsonb(v_message)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.slot_is_taken(p_slot candidate_interview_slots)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p_slot.booked_match_id is not null and exists (
    select 1 from public.candidate_matches m
    where m.id = p_slot.booked_match_id
      and m.status in ('interview_confirmed', 'interview_completed')
      and m.interview_scheduled_at = p_slot.starts_at
  );
$function$
;

CREATE OR REPLACE FUNCTION public.staff_extend_offer(p_match_id uuid)
 RETURNS candidate_matches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

-- NOTE: the live tg_calendar_sync differs from the last migration that defined it
-- (20260918202225_calendar_sync_port): it now checks client_event_id/candidate_event_id
-- instead of google_event_id. It was changed outside the migration history (stored with CRLF
-- line endings; normalised to LF here).
CREATE OR REPLACE FUNCTION public.tg_calendar_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'net'
AS $function$
declare
  v_action text;
  v_secret text;
  v_has_events boolean := NEW.client_event_id is not null or NEW.candidate_event_id is not null;
begin
  if NEW.status = 'interview_confirmed' then
    if not v_has_events then
      v_action := 'create';
    elsif NEW.interview_scheduled_at is distinct from OLD.interview_scheduled_at then
      v_action := 'patch';
    end if;
  elsif NEW.status = 'rejected' and v_has_events then
    v_action := 'cancel';
  end if;

  if v_action is null then return NEW; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'calendar_hook_secret' limit 1;
  begin
    perform net.http_post(
      url := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/calendar-sync',
      headers := jsonb_build_object('Content-Type','application/json','x-calendar-hook-secret', coalesce(v_secret,'')),
      body := jsonb_build_object('match_id', NEW.id, 'action', v_action),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'calendar-sync hook failed: %', sqlerrm;
  end;
  return NEW;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_generate_match_reason()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'resume_hook_secret' limit 1;

  begin
    perform net.http_post(
      url     := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/generate-match-reason',
      headers := jsonb_build_object('Content-Type','application/json','x-resume-hook-secret', coalesce(v_secret,'')),
      body    := jsonb_build_object('match_id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'generate-match-reason hook failed: %', sqlerrm;
  end;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_notify_admins_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.tg_process_resume_on_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare
  v_secret text;
  v_candidate uuid;
  v_file record;
begin
  v_candidate := coalesce(new.candidate_id, old.candidate_id);

  select id, bucket_id, storage_path into v_file
    from public.candidate_files
    where candidate_id = v_candidate and file_type = 'resume'
    order by created_at desc
    limit 1;

  -- No resume on file yet: nothing to regenerate. process-resume will already
  -- run role-aware once a resume is eventually uploaded (it reads roles live).
  if v_file.id is null then
    return coalesce(new, old);
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'resume_hook_secret' limit 1;

  begin
    perform net.http_post(
      url     := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/process-resume',
      headers := jsonb_build_object('Content-Type','application/json','x-resume-hook-secret', coalesce(v_secret,'')),
      body    := jsonb_build_object('candidate_id', v_candidate, 'file_id', v_file.id,
                                    'bucket_id', v_file.bucket_id, 'storage_path', v_file.storage_path),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'process-resume re-run on role change failed: %', sqlerrm;
  end;

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_process_resume_on_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
declare v_secret text;
begin
  if new.file_type::text = 'resume' then
    select decrypted_secret into v_secret
      from vault.decrypted_secrets where name = 'resume_hook_secret' limit 1;
    begin
      perform net.http_post(
        url     := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/process-resume',
        headers := jsonb_build_object('Content-Type','application/json','x-resume-hook-secret', coalesce(v_secret,'')),
        body    := jsonb_build_object('candidate_id', new.candidate_id, 'file_id', new.id,
                                      'bucket_id', new.bucket_id, 'storage_path', new.storage_path),
        timeout_milliseconds := 30000
      );
    exception when others then
      raise warning 'process-resume hook failed: %', sqlerrm;
    end;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_recompute_matches_for_candidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_candidate_id uuid;
begin
  v_candidate_id := coalesce(new.candidate_id, old.candidate_id);
  if v_candidate_id is null then
    return coalesce(new, old);
  end if;

  update public.candidate_matches cm
     set match_score = public._compute_match_score(v_candidate_id, cm.client_request_id)
   where cm.candidate_id = v_candidate_id;

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_recompute_matches_for_candidate_self()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_candidate_id uuid;
begin
  v_candidate_id := coalesce(new.id, old.id);
  if v_candidate_id is null then
    return coalesce(new, old);
  end if;

  update public.candidate_matches cm
     set match_score = public._compute_match_score(v_candidate_id, cm.client_request_id)
   where cm.candidate_id = v_candidate_id;

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_recompute_matches_for_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_request_id uuid;
begin
  v_request_id := coalesce(new.request_id, old.request_id, new.id, old.id);
  if v_request_id is null then
    return coalesce(new, old);
  end if;

  update public.candidate_matches cm
     set match_score = public._compute_match_score(cm.candidate_id, v_request_id)
   where cm.client_request_id = v_request_id;

  return coalesce(new, old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.tg_set_status_changed_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.update_thread_scratchpad(p_thread_id uuid, p_content text)
 RETURNS thread_scratchpad
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_result public.thread_scratchpad;
  v_kind text;
  v_client_id uuid;
begin
  select kind, client_id into v_kind, v_client_id from public.threads where id = p_thread_id;
  if v_client_id is null then
    raise exception 'thread not found';
  end if;
  if v_kind <> 'candidate' then
    raise exception 'Interview Prep Notes are only available on candidate threads';
  end if;
  if not (
    public.is_staff()
    or v_client_id in (select public.client_ids_for_profile(auth.uid()))
  ) then
    raise exception 'not authorized';
  end if;

  insert into public.thread_scratchpad (thread_id, content, updated_by, updated_at)
    values (p_thread_id, p_content, auth.uid(), now())
  on conflict (thread_id) do update
    set content = excluded.content, updated_by = excluded.updated_by, updated_at = now()
  returning * into v_result;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verify_calendar_hook(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'calendar_hook_secret' and decrypted_secret = p_token and coalesce(p_token,'') <> '');
$function$
;

CREATE OR REPLACE FUNCTION public.verify_meeting_capture_hook(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select exists (select 1 from vault.decrypted_secrets
                 where name = 'meeting_capture_hook_secret' and decrypted_secret = p_token and coalesce(p_token,'') <> '');
$function$
;

CREATE OR REPLACE FUNCTION public.verify_resume_hook(p_token text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault'
AS $function$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'resume_hook_secret'
      and decrypted_secret = p_token
      and coalesce(p_token, '') <> ''
  );
$function$
;

-- ============================================================================
-- Function EXECUTE grants (reconstructed from pg_proc.proacl). Function names are
-- unqualified as printed by regprocedure; run with search_path = public.
-- "to public" means the PUBLIC pseudo-role (any role, including anon).
-- ============================================================================
set search_path = public;
revoke all on function _compute_match_score(uuid,uuid) from public, anon, authenticated;
grant execute on function _compute_match_score(uuid,uuid) to anon;
grant execute on function _compute_match_score(uuid,uuid) to authenticated;
grant execute on function _compute_match_score(uuid,uuid) to service_role;
grant execute on function _compute_match_score(uuid,uuid) to public;
revoke all on function add_or_get_skill_for_role(uuid,text,text) from public, anon, authenticated;
grant execute on function add_or_get_skill_for_role(uuid,text,text) to authenticated;
grant execute on function add_or_get_skill_for_role(uuid,text,text) to service_role;
revoke all on function add_thread_note(uuid,text) from public, anon, authenticated;
grant execute on function add_thread_note(uuid,text) to anon;
grant execute on function add_thread_note(uuid,text) to service_role;
grant execute on function add_thread_note(uuid,text) to public;
grant execute on function add_thread_note(uuid,text) to authenticated;
revoke all on function admin_merge_skills(uuid[],uuid) from public, anon, authenticated;
grant execute on function admin_merge_skills(uuid[],uuid) to service_role;
grant execute on function admin_merge_skills(uuid[],uuid) to authenticated;
revoke all on function admin_propose_interview_time(uuid,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function admin_propose_interview_time(uuid,timestamp with time zone,text) to service_role;
grant execute on function admin_propose_interview_time(uuid,timestamp with time zone,text) to anon;
grant execute on function admin_propose_interview_time(uuid,timestamp with time zone,text) to public;
grant execute on function admin_propose_interview_time(uuid,timestamp with time zone,text) to authenticated;
revoke all on function admin_staff_signin_status() from public, anon, authenticated;
grant execute on function admin_staff_signin_status() to service_role;
grant execute on function admin_staff_signin_status() to anon;
grant execute on function admin_staff_signin_status() to authenticated;
revoke all on function apply_calendar_event(uuid,text,text,text) from public, anon, authenticated;
grant execute on function apply_calendar_event(uuid,text,text,text) to anon;
grant execute on function apply_calendar_event(uuid,text,text,text) to public;
grant execute on function apply_calendar_event(uuid,text,text,text) to authenticated;
grant execute on function apply_calendar_event(uuid,text,text,text) to service_role;
revoke all on function apply_match_reason(uuid,text) from public, anon, authenticated;
grant execute on function apply_match_reason(uuid,text) to anon;
grant execute on function apply_match_reason(uuid,text) to authenticated;
grant execute on function apply_match_reason(uuid,text) to service_role;
grant execute on function apply_match_reason(uuid,text) to public;
revoke all on function apply_meeting_capture(uuid,text,text,text) from public, anon, authenticated;
grant execute on function apply_meeting_capture(uuid,text,text,text) to anon;
grant execute on function apply_meeting_capture(uuid,text,text,text) to service_role;
grant execute on function apply_meeting_capture(uuid,text,text,text) to authenticated;
grant execute on function apply_meeting_capture(uuid,text,text,text) to public;
revoke all on function apply_resume_profile(uuid,jsonb) from public, anon, authenticated;
grant execute on function apply_resume_profile(uuid,jsonb) to service_role;
revoke all on function audit_trigger() from public, anon, authenticated;
grant execute on function audit_trigger() to service_role;
revoke all on function candidate_primary_role(uuid) from public, anon, authenticated;
grant execute on function candidate_primary_role(uuid) to authenticated;
grant execute on function candidate_primary_role(uuid) to service_role;
revoke all on function client_book_interview_slot(uuid,uuid) from public, anon, authenticated;
grant execute on function client_book_interview_slot(uuid,uuid) to service_role;
grant execute on function client_book_interview_slot(uuid,uuid) to authenticated;
revoke all on function client_can_view_candidate(uuid) from public, anon, authenticated;
grant execute on function client_can_view_candidate(uuid) to authenticated;
grant execute on function client_can_view_candidate(uuid) to service_role;
revoke all on function client_confirm_interview_time(uuid) from public, anon, authenticated;
grant execute on function client_confirm_interview_time(uuid) to public;
grant execute on function client_confirm_interview_time(uuid) to authenticated;
grant execute on function client_confirm_interview_time(uuid) to service_role;
grant execute on function client_confirm_interview_time(uuid) to anon;
revoke all on function client_ids_for_profile(uuid) from public, anon, authenticated;
grant execute on function client_ids_for_profile(uuid) to service_role;
grant execute on function client_ids_for_profile(uuid) to authenticated;
revoke all on function client_owns_request(uuid) from public, anon, authenticated;
grant execute on function client_owns_request(uuid) to service_role;
grant execute on function client_owns_request(uuid) to authenticated;
revoke all on function client_propose_interview_time(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function client_propose_interview_time(uuid,timestamp with time zone) to anon;
grant execute on function client_propose_interview_time(uuid,timestamp with time zone) to service_role;
grant execute on function client_propose_interview_time(uuid,timestamp with time zone) to public;
grant execute on function client_propose_interview_time(uuid,timestamp with time zone) to authenticated;
revoke all on function client_rate_candidate(uuid,smallint,text) from public, anon, authenticated;
grant execute on function client_rate_candidate(uuid,smallint,text) to authenticated;
grant execute on function client_rate_candidate(uuid,smallint,text) to service_role;
grant execute on function client_rate_candidate(uuid,smallint,text) to public;
grant execute on function client_rate_candidate(uuid,smallint,text) to anon;
revoke all on function client_request_hire(uuid) from public, anon, authenticated;
grant execute on function client_request_hire(uuid) to public;
grant execute on function client_request_hire(uuid) to anon;
grant execute on function client_request_hire(uuid) to authenticated;
grant execute on function client_request_hire(uuid) to service_role;
revoke all on function client_request_interview(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function client_request_interview(uuid,timestamp with time zone) to service_role;
grant execute on function client_request_interview(uuid,timestamp with time zone) to anon;
grant execute on function client_request_interview(uuid,timestamp with time zone) to public;
grant execute on function client_request_interview(uuid,timestamp with time zone) to authenticated;
revoke all on function client_shortlist_candidate(uuid) from public, anon, authenticated;
grant execute on function client_shortlist_candidate(uuid) to public;
grant execute on function client_shortlist_candidate(uuid) to service_role;
grant execute on function client_shortlist_candidate(uuid) to authenticated;
grant execute on function client_shortlist_candidate(uuid) to anon;
revoke all on function complete_interview(uuid,text) from public, anon, authenticated;
grant execute on function complete_interview(uuid,text) to authenticated;
grant execute on function complete_interview(uuid,text) to service_role;
grant execute on function complete_interview(uuid,text) to anon;
grant execute on function complete_interview(uuid,text) to public;
revoke all on function confirm_interview(uuid,text) from public, anon, authenticated;
grant execute on function confirm_interview(uuid,text) to service_role;
grant execute on function confirm_interview(uuid,text) to public;
grant execute on function confirm_interview(uuid,text) to anon;
grant execute on function confirm_interview(uuid,text) to authenticated;
revoke all on function create_placement_and_mark_hired(uuid,text,date,numeric,date,text) from public, anon, authenticated;
grant execute on function create_placement_and_mark_hired(uuid,text,date,numeric,date,text) to authenticated;
grant execute on function create_placement_and_mark_hired(uuid,text,date,numeric,date,text) to public;
grant execute on function create_placement_and_mark_hired(uuid,text,date,numeric,date,text) to anon;
grant execute on function create_placement_and_mark_hired(uuid,text,date,numeric,date,text) to service_role;
revoke all on function enforce_candidate_recruiter() from public, anon, authenticated;
grant execute on function enforce_candidate_recruiter() to service_role;
revoke all on function enforce_one_primary_role() from public, anon, authenticated;
grant execute on function enforce_one_primary_role() to service_role;
grant execute on function enforce_one_primary_role() to anon;
grant execute on function enforce_one_primary_role() to authenticated;
revoke all on function format_interview_time(timestamp with time zone,text) from public, anon, authenticated;
grant execute on function format_interview_time(timestamp with time zone,text) to authenticated;
grant execute on function format_interview_time(timestamp with time zone,text) to service_role;
revoke all on function get_interview_calendar_payload(uuid) from public, anon, authenticated;
grant execute on function get_interview_calendar_payload(uuid) to service_role;
revoke all on function get_match_interview_slots(uuid) from public, anon, authenticated;
grant execute on function get_match_interview_slots(uuid) to service_role;
grant execute on function get_match_interview_slots(uuid) to authenticated;
revoke all on function get_match_score_breakdown(uuid) from public, anon, authenticated;
grant execute on function get_match_score_breakdown(uuid) to anon;
grant execute on function get_match_score_breakdown(uuid) to service_role;
grant execute on function get_match_score_breakdown(uuid) to authenticated;
revoke all on function get_or_create_thread(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function get_or_create_thread(uuid,uuid,uuid) to public;
grant execute on function get_or_create_thread(uuid,uuid,uuid) to anon;
grant execute on function get_or_create_thread(uuid,uuid,uuid) to authenticated;
grant execute on function get_or_create_thread(uuid,uuid,uuid) to service_role;
revoke all on function get_pending_meeting_captures(interval) from public, anon, authenticated;
grant execute on function get_pending_meeting_captures(interval) to public;
grant execute on function get_pending_meeting_captures(interval) to anon;
grant execute on function get_pending_meeting_captures(interval) to authenticated;
grant execute on function get_pending_meeting_captures(interval) to service_role;
revoke all on function get_role_skills(uuid) from public, anon, authenticated;
grant execute on function get_role_skills(uuid) to service_role;
grant execute on function get_role_skills(uuid) to authenticated;
grant execute on function get_role_skills(uuid) to anon;
revoke all on function get_thread_note_authors(uuid) from public, anon, authenticated;
grant execute on function get_thread_note_authors(uuid) to service_role;
grant execute on function get_thread_note_authors(uuid) to anon;
grant execute on function get_thread_note_authors(uuid) to authenticated;
grant execute on function get_thread_note_authors(uuid) to public;
revoke all on function get_thread_sender_profiles(uuid) from public, anon, authenticated;
grant execute on function get_thread_sender_profiles(uuid) to public;
grant execute on function get_thread_sender_profiles(uuid) to service_role;
grant execute on function get_thread_sender_profiles(uuid) to anon;
grant execute on function get_thread_sender_profiles(uuid) to authenticated;
revoke all on function handle_candidate_role_insert() from public, anon, authenticated;
grant execute on function handle_candidate_role_insert() to public;
grant execute on function handle_candidate_role_insert() to anon;
grant execute on function handle_candidate_role_insert() to authenticated;
grant execute on function handle_candidate_role_insert() to service_role;
revoke all on function handle_new_user() from public, anon, authenticated;
grant execute on function handle_new_user() to service_role;
revoke all on function is_admin() from public, anon, authenticated;
grant execute on function is_admin() to authenticated;
grant execute on function is_admin() to service_role;
revoke all on function is_client() from public, anon, authenticated;
grant execute on function is_client() to authenticated;
grant execute on function is_client() to service_role;
revoke all on function is_recruiter() from public, anon, authenticated;
grant execute on function is_recruiter() to authenticated;
grant execute on function is_recruiter() to service_role;
revoke all on function is_staff() from public, anon, authenticated;
grant execute on function is_staff() to service_role;
grant execute on function is_staff() to authenticated;
grant execute on function is_staff() to anon;
revoke all on function log_match_view(uuid) from public, anon, authenticated;
grant execute on function log_match_view(uuid) to anon;
grant execute on function log_match_view(uuid) to service_role;
grant execute on function log_match_view(uuid) to authenticated;
grant execute on function log_match_view(uuid) to public;
revoke all on function mark_thread_read(uuid,timestamp with time zone) from public, anon, authenticated;
grant execute on function mark_thread_read(uuid,timestamp with time zone) to service_role;
grant execute on function mark_thread_read(uuid,timestamp with time zone) to authenticated;
revoke all on function notify_email_on_notification() from public, anon, authenticated;
grant execute on function notify_email_on_notification() to service_role;
revoke all on function rank_and_match(uuid,integer) from public, anon, authenticated;
grant execute on function rank_and_match(uuid,integer) to authenticated;
grant execute on function rank_and_match(uuid,integer) to service_role;
revoke all on function refresh_match_score(uuid) from public, anon, authenticated;
grant execute on function refresh_match_score(uuid) to service_role;
grant execute on function refresh_match_score(uuid) to anon;
grant execute on function refresh_match_score(uuid) to authenticated;
revoke all on function reject_candidate_match(uuid,rejection_reason,text,text) from public, anon, authenticated;
grant execute on function reject_candidate_match(uuid,rejection_reason,text,text) to service_role;
grant execute on function reject_candidate_match(uuid,rejection_reason,text,text) to public;
grant execute on function reject_candidate_match(uuid,rejection_reason,text,text) to anon;
grant execute on function reject_candidate_match(uuid,rejection_reason,text,text) to authenticated;
revoke all on function reshuffle_request(uuid,integer) from public, anon, authenticated;
grant execute on function reshuffle_request(uuid,integer) to service_role;
grant execute on function reshuffle_request(uuid,integer) to authenticated;
revoke all on function resolve_or_create_skills(text[]) from public, anon, authenticated;
grant execute on function resolve_or_create_skills(text[]) to service_role;
grant execute on function resolve_or_create_skills(text[]) to authenticated;
revoke all on function reverse_match_new_candidate(uuid) from public, anon, authenticated;
grant execute on function reverse_match_new_candidate(uuid) to public;
grant execute on function reverse_match_new_candidate(uuid) to anon;
grant execute on function reverse_match_new_candidate(uuid) to authenticated;
grant execute on function reverse_match_new_candidate(uuid) to service_role;
revoke all on function send_stale_shortlist_reminders(interval) from public, anon, authenticated;
grant execute on function send_stale_shortlist_reminders(interval) to authenticated;
grant execute on function send_stale_shortlist_reminders(interval) to public;
grant execute on function send_stale_shortlist_reminders(interval) to anon;
grant execute on function send_stale_shortlist_reminders(interval) to service_role;
revoke all on function send_thread_message_ensuring_thread(uuid,uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function send_thread_message_ensuring_thread(uuid,uuid,uuid,text,text) to service_role;
grant execute on function send_thread_message_ensuring_thread(uuid,uuid,uuid,text,text) to anon;
grant execute on function send_thread_message_ensuring_thread(uuid,uuid,uuid,text,text) to authenticated;
grant execute on function send_thread_message_ensuring_thread(uuid,uuid,uuid,text,text) to public;
revoke all on function send_thread_message(uuid,text,text) from public, anon, authenticated;
grant execute on function send_thread_message(uuid,text,text) to authenticated;
grant execute on function send_thread_message(uuid,text,text) to anon;
grant execute on function send_thread_message(uuid,text,text) to public;
grant execute on function send_thread_message(uuid,text,text) to service_role;
revoke all on function set_updated_at() from public, anon, authenticated;
grant execute on function set_updated_at() to authenticated;
grant execute on function set_updated_at() to anon;
grant execute on function set_updated_at() to service_role;
revoke all on function slot_is_taken(candidate_interview_slots) from public, anon, authenticated;
grant execute on function slot_is_taken(candidate_interview_slots) to service_role;
revoke all on function staff_extend_offer(uuid) from public, anon, authenticated;
grant execute on function staff_extend_offer(uuid) to authenticated;
grant execute on function staff_extend_offer(uuid) to service_role;
grant execute on function staff_extend_offer(uuid) to public;
grant execute on function staff_extend_offer(uuid) to anon;
revoke all on function tg_calendar_sync() from public, anon, authenticated;
grant execute on function tg_calendar_sync() to service_role;
grant execute on function tg_calendar_sync() to authenticated;
grant execute on function tg_calendar_sync() to anon;
grant execute on function tg_calendar_sync() to public;
revoke all on function tg_generate_match_reason() from public, anon, authenticated;
grant execute on function tg_generate_match_reason() to anon;
grant execute on function tg_generate_match_reason() to authenticated;
grant execute on function tg_generate_match_reason() to service_role;
grant execute on function tg_generate_match_reason() to public;
revoke all on function tg_notify_admins_new_request() from public, anon, authenticated;
grant execute on function tg_notify_admins_new_request() to anon;
grant execute on function tg_notify_admins_new_request() to authenticated;
grant execute on function tg_notify_admins_new_request() to service_role;
grant execute on function tg_notify_admins_new_request() to public;
revoke all on function tg_process_resume_on_role_change() from public, anon, authenticated;
grant execute on function tg_process_resume_on_role_change() to anon;
grant execute on function tg_process_resume_on_role_change() to public;
grant execute on function tg_process_resume_on_role_change() to service_role;
grant execute on function tg_process_resume_on_role_change() to authenticated;
revoke all on function tg_process_resume_on_upload() from public, anon, authenticated;
grant execute on function tg_process_resume_on_upload() to service_role;
grant execute on function tg_process_resume_on_upload() to authenticated;
grant execute on function tg_process_resume_on_upload() to anon;
grant execute on function tg_process_resume_on_upload() to public;
revoke all on function tg_recompute_matches_for_candidate_self() from public, anon, authenticated;
grant execute on function tg_recompute_matches_for_candidate_self() to authenticated;
grant execute on function tg_recompute_matches_for_candidate_self() to service_role;
grant execute on function tg_recompute_matches_for_candidate_self() to public;
grant execute on function tg_recompute_matches_for_candidate_self() to anon;
revoke all on function tg_recompute_matches_for_candidate() from public, anon, authenticated;
grant execute on function tg_recompute_matches_for_candidate() to public;
grant execute on function tg_recompute_matches_for_candidate() to anon;
grant execute on function tg_recompute_matches_for_candidate() to service_role;
grant execute on function tg_recompute_matches_for_candidate() to authenticated;
revoke all on function tg_recompute_matches_for_request() from public, anon, authenticated;
grant execute on function tg_recompute_matches_for_request() to authenticated;
grant execute on function tg_recompute_matches_for_request() to service_role;
grant execute on function tg_recompute_matches_for_request() to public;
grant execute on function tg_recompute_matches_for_request() to anon;
revoke all on function tg_set_status_changed_at() from public, anon, authenticated;
grant execute on function tg_set_status_changed_at() to authenticated;
grant execute on function tg_set_status_changed_at() to public;
grant execute on function tg_set_status_changed_at() to anon;
grant execute on function tg_set_status_changed_at() to service_role;
revoke all on function update_thread_scratchpad(uuid,text) from public, anon, authenticated;
grant execute on function update_thread_scratchpad(uuid,text) to authenticated;
grant execute on function update_thread_scratchpad(uuid,text) to public;
grant execute on function update_thread_scratchpad(uuid,text) to anon;
grant execute on function update_thread_scratchpad(uuid,text) to service_role;
revoke all on function verify_calendar_hook(text) from public, anon, authenticated;
grant execute on function verify_calendar_hook(text) to service_role;
grant execute on function verify_calendar_hook(text) to authenticated;
grant execute on function verify_calendar_hook(text) to anon;
grant execute on function verify_calendar_hook(text) to public;
revoke all on function verify_meeting_capture_hook(text) from public, anon, authenticated;
grant execute on function verify_meeting_capture_hook(text) to public;
grant execute on function verify_meeting_capture_hook(text) to anon;
grant execute on function verify_meeting_capture_hook(text) to authenticated;
grant execute on function verify_meeting_capture_hook(text) to service_role;
revoke all on function verify_resume_hook(text) from public, anon, authenticated;
grant execute on function verify_resume_hook(text) to service_role;
grant execute on function verify_resume_hook(text) to anon;
grant execute on function verify_resume_hook(text) to public;
grant execute on function verify_resume_hook(text) to authenticated;
