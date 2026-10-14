-- Enum types in schema public (values in pg_enum sort order), captured 2026-10-14.
-- No domain types and no standalone composite types exist in public.

create type public.availability_status as enum ('available_now', 'open_to_offers', 'off_market', 'available_from', 'interviewing', 'closing_next_week', 'exploring');
create type public.candidate_file_type as enum ('resume', 'profile_photo', 'intro_video', 'id_document', 'reference', 'other');
create type public.candidate_status as enum ('available', 'placed', 'inactive', 'new', 'screening', 'shortlisted', 'archived', 'rejected', 'interviewed', 'hired');
create type public.client_request_source as enum ('standard', 'staff_curated');
create type public.client_request_status as enum ('open', 'needs_attention', 'fulfilled', 'closed');
create type public.engagement_type as enum ('full_time', 'part_time', 'project');
create type public.match_status as enum ('recommended', 'shortlisted', 'interview_requested', 'interview_confirmed', 'interview_completed', 'hire_requested', 'offer_extended', 'hired', 'rejected');
create type public.placement_status as enum ('active', 'completed', 'terminated');
create type public.rejection_reason as enum ('skill_mismatch', 'availability_conflict', 'culture_fit', 'other');
create type public.user_role as enum ('admin', 'recruiter', 'client');
