-- Candidate ownership: which recruiter is assigned to a candidate.
-- Rules (confirmed 17 Sept):
--   - Admin and recruiters can all SEE every candidate, including who recruited them (unchanged, existing candidates_select policy already covers this via is_staff()).
--   - Only admin can set or change a candidate's recruiter_id.
--   - A recruiter can only EDIT candidates assigned to them; they can still create new candidates, but any candidate they create is automatically assigned to themselves (they cannot assign a candidate to someone else at creation either, closing that loophole).

alter table public.candidates
  add column recruiter_id uuid references public.profiles(id);

create index if not exists idx_candidates_recruiter_id on public.candidates(recruiter_id);

comment on column public.candidates.recruiter_id is 'Recruiter who owns this candidate. Only admin can set/change this (enforced by trg_enforce_candidate_recruiter). Recruiters can edit a candidate only when recruiter_id = their own profile id.';

create or replace function public.enforce_candidate_recruiter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke execute on function public.enforce_candidate_recruiter() from public, anon, authenticated;

drop trigger if exists trg_enforce_candidate_recruiter on public.candidates;
create trigger trg_enforce_candidate_recruiter
  before insert or update on public.candidates
  for each row execute function public.enforce_candidate_recruiter();

-- Tighten UPDATE RLS: admin can update any candidate; recruiters only their own assigned candidates.
drop policy if exists candidates_staff_update on public.candidates;
create policy candidates_staff_update
on public.candidates
for update
to public
using (is_admin() or (is_recruiter() and recruiter_id = (select auth.uid())))
with check (is_admin() or (is_recruiter() and recruiter_id = (select auth.uid())));
