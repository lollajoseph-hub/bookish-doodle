
-- 1. Shared secret used to authenticate the DB -> edge function hook call.
select vault.create_secret(
  replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  'resume_hook_secret',
  'Shared secret for process-resume edge function hook auth'
) where not exists (
  select 1 from vault.decrypted_secrets where name = 'resume_hook_secret'
);

-- 2. Verifies the hook secret sent by the DB trigger to the edge function.
create or replace function public.verify_resume_hook(p_token text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'resume_hook_secret'
      and decrypted_secret = p_token
      and coalesce(p_token, '') <> ''
  );
$$;

-- 3. Applies the AI-extracted resume profile to our schema's actual column names.
create or replace function public.apply_resume_profile(p_candidate_id uuid, p_profile jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
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
         nullif(btrim(coalesce(e->>'start_year','')), ''),
         nullif(btrim(coalesce(e->>'end_year','')), '')
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

  if not exists (
    select 1 from public.candidate_skills cs
    join public.skills s on s.id = cs.skill_id
    where cs.candidate_id = p_candidate_id and s.category = 'Languages'
  ) then
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
  end if;
end $$;

-- 4. Fires the edge function asynchronously whenever a resume file is uploaded.
create or replace function public.tg_process_resume_on_upload()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault'
as $$
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
end $$;

drop trigger if exists trg_process_resume_on_upload on public.candidate_files;
create trigger trg_process_resume_on_upload
  after insert on public.candidate_files
  for each row execute function public.tg_process_resume_on_upload();
