create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text,
  type text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.audit_trigger() returns trigger
language plpgsql security definer as $$
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
$$;

create trigger audit_candidates after insert or update or delete on public.candidates for each row execute function public.audit_trigger();
create trigger audit_client_requests after insert or update or delete on public.client_requests for each row execute function public.audit_trigger();
create trigger audit_candidate_matches after insert or update or delete on public.candidate_matches for each row execute function public.audit_trigger();
create trigger audit_placements after insert or update or delete on public.placements for each row execute function public.audit_trigger();
create trigger audit_clients after insert or update or delete on public.clients for each row execute function public.audit_trigger();
create trigger audit_job_roles after insert or update or delete on public.job_roles for each row execute function public.audit_trigger();
create trigger audit_skills after insert or update or delete on public.skills for each row execute function public.audit_trigger();
