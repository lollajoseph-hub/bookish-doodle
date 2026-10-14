
create or replace function public.tg_recompute_matches_for_candidate_self()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

drop trigger if exists trg_recompute_on_candidate_years on public.candidates;
create trigger trg_recompute_on_candidate_years
  after update of years_experience on public.candidates
  for each row
  when (old.years_experience is distinct from new.years_experience)
  execute function public.tg_recompute_matches_for_candidate_self();
