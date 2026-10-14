
alter table public.candidate_ai_profiles
  add column if not exists rank_score_breakdown jsonb;

comment on column public.candidate_ai_profiles.rank_score_breakdown is
  'The 4 sub-components GROQ computed that sum to rank_score: {experience_pts (0-5), skills_pts (0-5), certifications_pts (0-3), completeness_pts (0-2)}. Stored so staff can see the full AI-score rationale, not just the total.';
