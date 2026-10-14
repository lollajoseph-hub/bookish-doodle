create or replace function public.tg_process_resume_on_role_change()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_secret text;
  v_candidate uuid;
  v_file record;
begin
  v_candidate := coalesce(new.candidate_id, old.candidate_id);

  select id, bucket_id, storage_path into v_file
    from public.candidate_files
    where candidate_id = v_candidate and file_type = 'resume'
    order by created_at desc
    limit 1;

  -- No resume on file yet: nothing to regenerate. process-resume will already
  -- run role-aware once a resume is eventually uploaded (it reads roles live).
  if v_file.id is null then
    return coalesce(new, old);
  end if;

  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'resume_hook_secret' limit 1;

  begin
    perform net.http_post(
      url     := 'https://kjpozzjeddvctcabtnzg.supabase.co/functions/v1/process-resume',
      headers := jsonb_build_object('Content-Type','application/json','x-resume-hook-secret', coalesce(v_secret,'')),
      body    := jsonb_build_object('candidate_id', v_candidate, 'file_id', v_file.id,
                                    'bucket_id', v_file.bucket_id, 'storage_path', v_file.storage_path),
      timeout_milliseconds := 30000
    );
  exception when others then
    raise warning 'process-resume re-run on role change failed: %', sqlerrm;
  end;

  return coalesce(new, old);
end;
$function$;

drop trigger if exists trg_process_resume_on_role_change on public.candidate_roles;
create trigger trg_process_resume_on_role_change
after insert or delete or update of is_primary on public.candidate_roles
for each row execute function public.tg_process_resume_on_role_change();
