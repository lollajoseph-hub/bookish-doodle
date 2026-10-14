
create or replace function public.apply_resume_profile(p_candidate_id uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;
