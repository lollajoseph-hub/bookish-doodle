-- Per-user "last read" marker for message threads, used by both the staff
-- dashboard and the client Candidate Pool (replaces per-browser localStorage).
-- Applied to the live database on 2026-10-03 as migration thread_reads_per_user.

create table public.thread_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

alter table public.thread_reads enable row level security;

create policy thread_reads_select on public.thread_reads
  for select using (user_id = auth.uid());

create policy thread_reads_insert on public.thread_reads
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.threads t where t.id = thread_reads.thread_id)
  );

create policy thread_reads_update on public.thread_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Only ever moves the marker forward.
create or replace function public.mark_thread_read(p_thread_id uuid, p_read_at timestamptz)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.thread_reads (user_id, thread_id, last_read_at)
  values (auth.uid(), p_thread_id, p_read_at)
  on conflict (user_id, thread_id) do update
    set last_read_at = greatest(public.thread_reads.last_read_at, excluded.last_read_at),
        updated_at = now();
$$;

revoke execute on function public.mark_thread_read(uuid, timestamptz) from public, anon;
grant execute on function public.mark_thread_read(uuid, timestamptz) to authenticated;
grant select, insert, update on public.thread_reads to authenticated;
