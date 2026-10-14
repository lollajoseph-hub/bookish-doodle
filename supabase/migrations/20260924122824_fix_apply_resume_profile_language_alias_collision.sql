create or replace function public.apply_resume_profile(p_candidate_id uuid, p_profile jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update public.candidates
     set headline = coalesce(nullif(btrim(coalesce(p_profile->>'headline','')), ''), headline)
   where id = p_candidate_id;

  insert into public.candidate_ai_profiles
    (candidate_id, recruiter_summary, approved_summary, skills, highlights, ai_metadata, model_version, generated_at, updated_at)
  values (
    p_candidate_id,
    nullif(btrim(coalesce(p_profile->>'recruiter_summary', p_profile->>'professional_summary', '')), ''),
    nullif(btrim(coalesce(p_profile->>'client_summary',    p_profile->>'professional_summary', '')), ''),
    coalesce(p_profile->'core_competencies', '[]'::jsonb),
    coalesce(p_profile->'key_strengths',     '[]'::jsonb),
    p_profile,
    coalesce(nullif(p_profile->>'model_version',''), 'groq/openai/gpt-oss-120b'),
    now(),
    now()
  )
  on conflict (candidate_id) do update set
    recruiter_summary = excluded.recruiter_summary,
    approved_summary  = excluded.approved_summary,
    skills            = excluded.skills,
    highlights        = excluded.highlights,
    ai_metadata       = excluded.ai_metadata,
    model_version     = excluded.model_version,
    generated_at      = excluded.generated_at,
    updated_at        = excluded.updated_at;

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

  -- Languages always re-sync on every reprocess (delete+reinsert).
  --
  -- FIXED 2026-09-24: the previous version wrote "... jsonb_array_elements_text(...) as name"
  -- and then filtered the outer query with "sk.name in (select ... from ... as name)". Because
  -- the derived table function's output column was aliased to the SAME name ("name") as the
  -- outer skills.name column, Postgres resolved the unqualified "name" references inside that
  -- correlated subquery against the outer sk.name instead of the local per-row resume value,
  -- so the "in (...)" subquery silently evaluated once per outer row and always matched -
  -- every single language in the catalogue got attached to every candidate, no matter what the
  -- resume actually said. Fixed by giving the table function's column a distinct alias (nm) so
  -- there is no naming collision with skills.name, exactly like the Software/Customer Service
  -- block above already did correctly (hence why that block was never affected).
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
end $function$;
