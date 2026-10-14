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
  select distinct left(name,120) as name, category from (
      select btrim(name) as name, 'Software'::text as category
        from jsonb_array_elements_text(coalesce(p_profile->'software_skills','[]'::jsonb)) as name
      union select btrim(name), 'Customer Service'
        from jsonb_array_elements_text(coalesce(p_profile->'core_competencies','[]'::jsonb)) as name
      union select btrim(name), 'Customer Service'
        from jsonb_array_elements_text(coalesce(p_profile->'transferable_skills','[]'::jsonb)) as name
  ) s
  where coalesce(name,'') <> ''
  on conflict (name, category) do nothing;

  insert into public.candidate_skills (candidate_id, skill_id, proficiency_level, years_experience)
  select p_candidate_id, sk.id, 'intermediate', null
  from public.skills sk
  join (
      select distinct left(name,120) as name, category from (
        select btrim(name) as name, 'Software'::text as category
          from jsonb_array_elements_text(coalesce(p_profile->'software_skills','[]'::jsonb)) as name
        union select btrim(name), 'Customer Service'
          from jsonb_array_elements_text(coalesce(p_profile->'core_competencies','[]'::jsonb)) as name
        union select btrim(name), 'Customer Service'
          from jsonb_array_elements_text(coalesce(p_profile->'transferable_skills','[]'::jsonb)) as name
      ) x where coalesce(name,'') <> ''
  ) f on f.name = sk.name and f.category = sk.category
  on conflict (candidate_id, skill_id) do nothing;

  -- Languages now always re-sync on every reprocess (delete+reinsert), same as
  -- Software/Customer Service above, instead of only running on a candidate's
  -- first-ever resume pass. This means a corrected/updated resume with different
  -- languages will actually update what's tagged, instead of being silently skipped.
  delete from public.candidate_skills cs
  using public.skills s
  where cs.skill_id = s.id
    and cs.candidate_id = p_candidate_id
    and s.category = 'Languages';

  insert into public.skills (name, category)
  select distinct left(btrim(name),120), 'Languages'
  from jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb)) as name
  where coalesce(btrim(name),'') <> ''
  on conflict (name, category) do nothing;

  insert into public.candidate_skills (candidate_id, skill_id, proficiency_level, years_experience)
  select p_candidate_id, sk.id, 'intermediate', null
  from public.skills sk
  where sk.category = 'Languages'
    and sk.name in (
      select distinct left(btrim(name),120)
      from jsonb_array_elements_text(coalesce(p_profile->'languages','[]'::jsonb)) as name
      where coalesce(btrim(name),'') <> ''
    )
  on conflict (candidate_id, skill_id) do nothing;
end $function$;
