# Candidate Pool

Build "VetPod Clinic Workstation" — a clinic-facing hiring app, completely separate from any other app. Connect to our EXISTING Supabase backend. Do NOT create tables or migrations; only call what I specify.

SUPABASE_URL = https://vsvbnmswknkajantafma.supabase.co
SUPABASE_ANON_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzdmJubXN3a25rYWphbnRhZm1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDEyMjksImV4cCI6MjA5Nzk3NzIyOX0.NKIPnkpN0zg4ofvbVAenduTSBNg-rswv2QhdCJODP8U

AUTH: Supabase email/password. Only profile role='client' uses this app. Provide logout.

PAGE 1 — "New Hiring Request" (two sections in one form):
 SECTION A Clinic Information: First Name, Last Name, Email, Phone, Position (dropdown: Practice Owner, Practice Manager, Hospital Administrator, Head Veterinarian, Office Manager, HR, Other), Clinic Name, Clinic Address.
 SECTION B Hiring Requirements: Position Required, Employment Type, Weekly Hours, Shift (day/evening/overnight/flexible), Timezone, Country, Salary Range (min+max), Experience (min years), Software Experience, Required Skills, Veterinary Specialty, Language, Start Date, Additional Notes, Number of Candidates Required.
 On submit call: supabase.rpc('submit_clinic_request', { p_clinic:{name,address,contact_email,contact_phone,position}, p_request:{title,role_needed,specialization,location,employment_type,weekly_hours,shift,timezone,country,budget_min,budget_max,min_experience_years,software_experience,required_skills,languages,start_date,headcount,description}, p_clinic_id: <existing clinic id or null> }). Returns the new request uuid. Map Position Required→role_needed+title, Veterinary Specialty→specialization, Salary Range→budget_min/budget_max, Number of Candidates→headcount, Additional Notes→description. Pass values as strings. Navigate to the request detail on success (matching runs automatically).

PAGE 2 — "My Requests": list from table client_requests (RLS returns only this clinic's): title, role_needed, status, headcount, created_at. Click → detail.

PAGE 3 — Request Detail (candidate cards): supabase.rpc('get_clinic_presented_candidates', { p_request }). Each card (KEEP MINIMAL): candidate_name, primary_role, country, timezone, availability, Roleplay Score (roleplay_score%), Course Score (course_score%), Certificate Status badge; if interview_scheduled_at show interview date+timezone+link; if offer_salary show offer. Card buttons: "View Candidate" (opens the VetPod Resume — see below), "Shortlist" → rpc('client_shortlist_candidate',{p_match:match_id}), "Reject" → rpc('client_reject_candidate',{p_match:match_id}) then refetch (a replacement is auto-revealed), "Request Interview" → rpc('client_request_interview',{p_match:match_id}). Refetch after any action.

VIEW CANDIDATE = surface the EXISTING VetPod Resume (the single source of truth — do NOT rebuild a profile). Call supabase.rpc('get_clinic_candidate_resume', { p_match: match_id }). It returns { resume: {...}, roleplay_audios: [{bucket,path,created_at} x5] }. Render `resume` fields: full_name, headline, professional_summary, primary_role, secondary_roles, key_strengths, transferable_skills, communication_skills, achievements, career_highlights, work_history, education, skills, software, languages, badges, certifications, country, timezone, weekly_hours_available, preferred_shift, earliest_start_date, years_customer_service_experience, years_veterinary_experience, final_client_analysis, roleplay_score, course_score, certificate_number, certificate_status, certificate_verification_id. Files (create signed URLs, 1h): resume.vetpod_resume_path in bucket 'vetpod-resumes' (a "Download VetPod Resume PDF" button), resume.profile_photo_path in 'candidate-photos', resume.intro_video_path in 'intro-videos', and EACH of the 5 roleplay_audios (use its bucket+path) as audio players labelled Roleplay 1..5. "Verify Certificate" button → rpc('verify_certificate',{query: resume.certificate_verification_id}) → show valid/status/number in a dialog. Also expose Shortlist / Reject / Request Interview here.

HARD PRIVACY: clients render ONLY data returned by get_clinic_presented_candidates and get_clinic_candidate_resume. NEVER show candidate email/phone/address, the original/uploaded resume, recruiter notes, internal AI reports, or internal match scores. The VetPod Resume is the ONLY candidate profile. Do not query candidates/candidate_files/candidate_matches tables directly for display.

DESIGN: clean clinical feel, teal/emerald accent, white rounded cards, shadcn/ui. Header: "VetPod Clinic Workstation", New Request, My Requests, logout.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://vetpod-clinic-connect.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9bb87a23-4c8e-4915-a47e-592e80a787d2).

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
