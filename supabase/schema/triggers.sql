-- Non-internal triggers (pg_get_triggerdef), captured 2026-10-14.
-- 32 triggers on public tables + 1 app trigger on auth.users = 33 total.
-- Function names are unqualified (they live in public); run with search_path = public.

-- ---------------------------------------------------------------------------
-- public schema
-- ---------------------------------------------------------------------------
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.candidate_ai_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_recompute_on_ai_profile AFTER INSERT OR UPDATE OF rank_score ON public.candidate_ai_profiles FOR EACH ROW EXECUTE FUNCTION tg_recompute_matches_for_candidate();
CREATE TRIGGER trg_process_resume_on_upload AFTER INSERT ON public.candidate_files FOR EACH ROW EXECUTE FUNCTION tg_process_resume_on_upload();
CREATE TRIGGER audit_candidate_matches AFTER INSERT OR DELETE OR UPDATE ON public.candidate_matches FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.candidate_matches FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_calendar_sync AFTER UPDATE OF status, interview_scheduled_at ON public.candidate_matches FOR EACH ROW EXECUTE FUNCTION tg_calendar_sync();
CREATE TRIGGER trg_generate_match_reason AFTER INSERT ON public.candidate_matches FOR EACH ROW EXECUTE FUNCTION tg_generate_match_reason();
CREATE TRIGGER trg_set_status_changed_at BEFORE UPDATE ON public.candidate_matches FOR EACH ROW EXECUTE FUNCTION tg_set_status_changed_at();
CREATE TRIGGER trg_enforce_one_primary_role BEFORE INSERT OR UPDATE ON public.candidate_roles FOR EACH ROW WHEN (new.is_primary) EXECUTE FUNCTION enforce_one_primary_role();
CREATE TRIGGER trg_process_resume_on_role_change AFTER INSERT OR DELETE OR UPDATE OF is_primary ON public.candidate_roles FOR EACH ROW EXECUTE FUNCTION tg_process_resume_on_role_change();
CREATE TRIGGER trg_recompute_on_candidate_roles AFTER INSERT OR DELETE OR UPDATE ON public.candidate_roles FOR EACH ROW EXECUTE FUNCTION tg_recompute_matches_for_candidate();
CREATE TRIGGER trg_reverse_match_new_candidate AFTER INSERT ON public.candidate_roles FOR EACH ROW EXECUTE FUNCTION handle_candidate_role_insert();
CREATE TRIGGER trg_recompute_on_candidate_skills AFTER INSERT OR DELETE OR UPDATE ON public.candidate_skills FOR EACH ROW EXECUTE FUNCTION tg_recompute_matches_for_candidate();
CREATE TRIGGER audit_candidates AFTER INSERT OR DELETE OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_enforce_candidate_recruiter BEFORE INSERT OR UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION enforce_candidate_recruiter();
CREATE TRIGGER trg_recompute_on_candidate_years AFTER UPDATE OF years_experience ON public.candidates FOR EACH ROW WHEN ((old.years_experience IS DISTINCT FROM new.years_experience)) EXECUTE FUNCTION tg_recompute_matches_for_candidate_self();
CREATE TRIGGER trg_recompute_on_request_skills AFTER INSERT OR DELETE OR UPDATE ON public.client_request_skills FOR EACH ROW EXECUTE FUNCTION tg_recompute_matches_for_request();
CREATE TRIGGER audit_client_requests AFTER INSERT OR DELETE OR UPDATE ON public.client_requests FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.client_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_admins_new_request AFTER INSERT ON public.client_requests FOR EACH ROW EXECUTE FUNCTION tg_notify_admins_new_request();
CREATE TRIGGER trg_recompute_on_request_years AFTER UPDATE OF years_experience_min ON public.client_requests FOR EACH ROW WHEN ((old.years_experience_min IS DISTINCT FROM new.years_experience_min)) EXECUTE FUNCTION tg_recompute_matches_for_request();
CREATE TRIGGER audit_clients AFTER INSERT OR DELETE OR UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_job_roles AFTER INSERT OR DELETE OR UPDATE ON public.job_roles FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.job_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_email_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION notify_email_on_notification();
CREATE TRIGGER audit_placements AFTER INSERT OR DELETE OR UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.placements FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.recruiter_notes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_skills AFTER INSERT OR DELETE OR UPDATE ON public.skills FOR EACH ROW EXECUTE FUNCTION audit_trigger();

-- ---------------------------------------------------------------------------
-- auth schema (app-owned trigger calling a public function)
-- ---------------------------------------------------------------------------
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
