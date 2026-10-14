
create or replace function public.refresh_match_score(p_match_id uuid)
returns public.candidate_matches
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.refresh_match_score(uuid) from public;
grant execute on function public.refresh_match_score(uuid) to authenticated;
