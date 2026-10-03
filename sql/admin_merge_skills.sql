-- Atomic skill merge for the "Manage Skills" page. Admin-only: the live
-- function requires is_admin().
-- Re-points candidate_skills, client_request_skills and role_skills from the
-- duplicate skills onto the canonical skill, dropping rows that would violate
-- the unique (parent, skill_id) constraints, then deletes the now-orphaned
-- skill rows.
-- NOTE: the function body below may lag the live definition (is_admin() check,
-- role_skills handling). Treat the live database function as the source of truth.

create or replace function public.admin_merge_skills(
  p_source_ids uuid[],
  p_target_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_staff() then
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

  delete from public.skills where id = any(p_source_ids);
end;
$$;

revoke all on function public.admin_merge_skills(uuid[], uuid) from public, anon;
grant execute on function public.admin_merge_skills(uuid[], uuid) to authenticated;
