
create or replace function public.send_thread_message_ensuring_thread(
  p_client_request_id uuid default null,
  p_candidate_match_id uuid default null,
  p_client_id uuid default null,
  p_body text default null,
  p_structured_type text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_thread public.threads;
  v_message public.thread_messages;
begin
  -- Same transaction as the message insert below: if send_thread_message raises,
  -- the thread row created here rolls back too, so a failed send can never
  -- leave an orphaned empty thread behind.
  v_thread := public.get_or_create_thread(p_client_request_id, p_candidate_match_id, p_client_id);
  v_message := public.send_thread_message(v_thread.id, p_body, p_structured_type);

  return jsonb_build_object(
    'thread', to_jsonb(v_thread),
    'message', to_jsonb(v_message)
  );
end;
$$;

grant execute on function public.send_thread_message_ensuring_thread(uuid, uuid, uuid, text, text) to authenticated;
