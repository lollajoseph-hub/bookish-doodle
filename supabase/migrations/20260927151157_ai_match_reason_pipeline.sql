-- "Why this candidate" (#6): replace the hardcoded candidate_matches.match_reason string with
-- a real per-match LLM explanation, generated async via pg_net the same way resume profiles
-- are generated (AFTER INSERT trigger -> edge function -> GROQ -> write-back RPC).

create or replace function public.apply_match_reason(p_match_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not (auth.role() = 'service_role' or public.is_staff()) then
    raise exception 'not authorized';
  end if;

  update public.candidate_matches
     set match_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_match_id
     and nullif(btrim(coalesce(p_reason, '')), '') is not null;
end;
$function$;

create or replace function public.tg_generate_match_reason()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'resume_hook_secret' limit 1;

  begin
    perform net.http_post(
      url     := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/generate-match-reason',
      headers := jsonb_build_object('Content-Type','application/json','x-resume-hook-secret', coalesce(v_secret,'')),
      body    := jsonb_build_object('match_id', new.id),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'generate-match-reason hook failed: %', sqlerrm;
  end;

  return new;
end;
$function$;

drop trigger if exists trg_generate_match_reason on public.candidate_matches;
create trigger trg_generate_match_reason
  after insert on public.candidate_matches
  for each row execute function public.tg_generate_match_reason();
