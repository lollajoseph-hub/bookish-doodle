# Candidate Review Dashboard

Build "VetFlow Candidate Pool" — an INTERNAL OPERATIONS web app for staff (admin + recruiter), SEPARATE from the candidate learning platform but sharing the SAME existing Supabase backend. This is Phase 2C (foundation). Production quality, responsive, accessible.

CRITICAL BACKEND RULES:
- Do NOT use Lovable Cloud / a new database. Connect to the EXISTING EXTERNAL Supabase project:
  URL: https://vsvbnmswknkajantafma.supabase.co
  Publishable (anon) key: sb_publishable_oCyVkp6FC9KtuoSpDN68fA_hLQ-g3EW
- Create ONE Supabase client (@supabase/supabase-js) configured with persistSession, autoRefreshToken, detectSessionInUrl, localStorage. Read URL/key from env (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY) with those values as fallback. Never expose a service-role key.
- Do NOT modify the database, schema, tables, RLS, triggers, RPCs, or Edge Functions. Only READ via the existing API, call existing RPCs, call existing Edge Functions, and write only what existing RLS already permits for staff.
- Stack: TanStack Router (file-based) + React Query + Tailwind + shadcn/ui. Keep a clean services/query layer.

ROLE-AWARE (do NOT hardcode roles): roles live in public.profiles.role with values 'admin' | 'recruiter' | 'client' | 'candidate'. Staff = admin or recruiter. This app is for STAFF. After login, load the user's profile (select id, role, full_name, email, avatar_url from profiles where id = auth user id). If role is NOT admin/recruiter, show an "access restricted" screen and a sign-out button (client + candidate roles get their own apps later). Build the shell so a future 'client' role can be added without rework.

AUTH (reuse Supabase Auth; no signup): 
- /login: email + password via supabase.auth.signInWithPassword, then route to /dashboard. 
- /forgot-password: supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }) and a /reset-password page that calls supabase.auth.updateUser({ password }) when a recovery session is present. 
- An auth guard redirects unauthenticated users to /login.

APP SHELL (clearly an internal ops tool, VetFlow teal design language — primary teal ~#0d9488, slate neutrals, rounded-2xl cards, shadcn): persistent sidebar (Dashboard, Candidate Pool, + a disabled/"coming soon" hint for future areas), top header with page title, a notifications bell icon (badge from the signed-in user's OWN unread notifications: count from public.notifications where recipient_id = auth uid and read=false — staff can read their own), a user menu (avatar/initials, name, role badge, Logout via supabase.auth.signOut). Fully responsive with a mobile drawer.

DASHBOARD (/dashboard) — operational metrics, all from backend reads (no invented business logic; these are status counts + backend RPC aggregates). Cards:
- Total Candidates = count of public.candidates.
- Invited = candidates.status = 'invited'.
- Active = candidates.status in ('invited','training_in_progress').
- In Training = candidates.status = 'training_in_progress'.
- Graduated = candidates.status = 'training_completed' (the backend sets this at graduation).
- Ready For Placement = candidates.status = 'qualified'.
- Awaiting Review = count of distinct candidates having a roleplay_sessions row with score IS NULL AND completed_at IS NULL (submitted, not yet graded).
- Average Training Progress = average of the course_progress RPC percent across enrolled candidates (see RPC below).
- Recent Activity: a time-ordered feed merged from staff-readable timestamps across all candidates — new candidates (candidates.created_at), enrollments (candidate_courses.enrolled_at), completed lessons (lesson_progress.completed_at), submitted assessments (candidate_assessment_attempts.submitted_at), roleplay submissions (roleplay_sessions.created_at/completed_at). Sort desc, cap ~15. (Note: candidate notifications are NOT staff-readable by RLS, so do not use them for activity.)
Show skeletons, empty states, and a retry on error.

CANDIDATE DIRECTORY (/candidates) — list EVERY candidate the backend returns (do not artificially filter). For each candidate show: profile photo, full name, email, candidate status (badge), assigned recruiter, assigned course, overall progress, course status, created date, last activity. Provide search + filter + sort + pagination by: name, email, status, assigned course, assigned recruiter, progress, date created. Toggle table/card view is optional.
Data sources:
- candidates: id, profile_id, recruiter_id, status, country, timezone, created_at.
- profiles (candidate): join via candidates.profile_id → full_name, email, phone, avatar_url.
- recruiter: candidates.recruiter_id → recruiters.id → recruiters.profile_id → profiles.full_name (the recruiter's name); show "Unassigned" if null.
- assigned course + course status + enrolled date: candidate_courses (candidate_id, course_id, status, enrolled_at) → courses.title. A candidate may have 0 or 1 active enrollment; show the most recent.
- overall progress: call RPC course_progress(p_candidate := candidates.id, p_course := candidate_courses.course_id) → use the returned percent (staff are authorized to call it). Cache per candidate; render a small ring/bar. If no enrollment, show "Not enrolled".
- profile photo: prefer profiles.avatar_url; else a candidate_files row where candidate_id = id and file_type = 'profile_photo' (bucket 'candidate-photos') resolved to a signed URL; else initials avatar.
- last activity: the most recent of that candidate's lesson_progress.completed_at / candidate_assessment_attempts.submitted_at / roleplay_sessions.updated_at / candidate_courses.enrolled_at (staff-readable); fallback created_at.

CREATE CANDIDATE (a dialog/wizard launched from the directory) — reuse the existing onboarding Edge Functions; do NOT recreate onboarding logic. Fields: First name, Last name, Email, Phone, Country, Timezone, Experience Level, Previous Customer Service Experience (years), Professional Summary/Notes; Assign VetFlow Course (select from public.courses where is_published); Uploads: Passport Photograph, Government-issued Photo ID, Original Resume/CV, Introduction Video, Additional Supporting Documents.
EXACT WORKFLOW (note: files require the candidate id, so create FIRST, then upload):
1) On submit, POST to the create-candidate Edge Function at `${SUPABASE_URL}/functions/v1/create-candidate` with the signed-in user's access token as `Authorization: Bearer <token>` and JSON body: { mode: 'invite', email, first_name, last_name, phone, country, timezone, experience_level, veterinary_experience: null, notes, candidate_status: 'invited', course_id }. (The function creates the auth user, sends the Supabase invitation email, creates the candidate, enrolls in course_id, and returns { ok, candidate, user_id, invited }.)
2) If "Previous Customer Service Experience" was provided, then UPDATE public.candidates SET years_customer_service_experience = <n> WHERE id = candidate.id (staff RLS permits this; the Edge Function doesn't set this field).
3) Upload each selected file to Supabase Storage (private buckets) at a path that STARTS WITH the candidate id `${candidateId}/<type>-${Date.now()}.<ext>`, then insert a public.candidate_files row { candidate_id, file_type, bucket_id, storage_path, file_name, mime_type, size_bytes }. Bucket + file_type mapping (use ONLY these existing buckets — staff have write access): Passport Photograph → bucket 'candidate-photos', file_type 'profile_photo'; Government Photo ID → bucket 'candidate-resumes', file_type 'id_document'; Original Resume/CV → bucket 'candidate-resumes', file_type 'original_resume'; Introduction Video → bucket 'intro-videos', file_type 'intro_video'; Additional Supporting Documents → bucket 'candidate-resumes', file_type 'other'.
4) Show clear success or per-step failure (creation must succeed first; uploads are best-effort and individually reported). Offer a "Resend Invitation" action that POSTs to the resend-invitation Edge Function `${SUPABASE_URL}/functions/v1/resend-invitation` with Bearer token and body { candidate_id }.
IMPORTANT: The Original Resume/CV is INTERNAL ONLY and is NOT the "VetPod Resume" (a separate client-facing profile generated later — do NOT build it).

FILE PREVIEW: allow staff to preview a candidate's uploaded files (Resume, Photo ID, Passport Photo, Introduction Video, Supporting Documents) by listing candidate_files for that candidate and opening a signed URL (supabase.storage.from(bucket_id).createSignedUrl(storage_path, 3600)); render images/video inline and documents via a link/iframe. (A lightweight preview surface is fine; do NOT build a full candidate detail page.)

PERMISSIONS NOTE: at this phase all staff see all candidates (matches backend RLS). Architect the candidate query so a future recruiter-only filter (by recruiter_id) can be added in one place when backend support exists — but do not filter now.

DO NOT BUILD (later phases): candidate detail page, progress timeline, assessment review, roleplay review, AI analysis, VetPod Resume, placement pipeline, client dashboard, analytics.

Deliver a clean, production-quality foundation. Ensure it compiles and runs against the external Supabase above.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://vetflow-staff-compass.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/dd812475-230d-4a19-86cd-d07299ce3d94).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
