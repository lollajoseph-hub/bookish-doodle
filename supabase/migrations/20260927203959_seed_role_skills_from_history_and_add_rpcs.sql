
-- Backfill: every skill ever attached to a request for a role becomes part of that role's
-- curated dropdown list going forward.
insert into public.role_skills (role_id, skill_id)
select distinct req.role_id, rs.skill_id
from public.client_request_skills rs
join public.client_requests req on req.id = rs.request_id
where req.role_id is not null
on conflict do nothing;

-- Public read: role-scoped skill catalog is not sensitive, and the unauthenticated
-- get-started wizard needs to read it too, so expose via a SECURITY DEFINER RPC rather than
-- widening the role_skills SELECT policy (which intentionally stays staff-only for direct
-- table access).
create or replace function public.get_role_skills(p_role_id uuid)
returns table (skill_id uuid, name text, category text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id as skill_id, s.name, s.category
  from public.role_skills rsk
  join public.skills s on s.id = rsk.skill_id
  where rsk.role_id = p_role_id
  order by s.name;
$$;

revoke all on function public.get_role_skills(uuid) from public;
grant execute on function public.get_role_skills(uuid) to anon, authenticated;

-- Escape hatch: resolve-or-create a skill by free-typed name AND tag it onto the given role's
-- curated list in one step, so it's immediately usable on this request and shows up in the
-- dropdown for everyone else next time. Callable by clients (their own request's role) and
-- staff alike; security definer since normal clients have no direct write access to
-- role_skills or skills.
create or replace function public.add_or_get_skill_for_role(p_role_id uuid, p_skill_name text, p_category text default 'Other')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.add_or_get_skill_for_role(uuid, text, text) from public;
grant execute on function public.add_or_get_skill_for_role(uuid, text, text) to anon, authenticated;
