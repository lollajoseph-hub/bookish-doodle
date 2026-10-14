# Staff Dashboard ("Candidate Review Dashboard") — Architecture Reference

Repo: `backups/repos/staff-dashboard` (Lovable project, TanStack Start template `tanstack_start_ts_current`).
Supabase project: `kjpozzjeddvctcabtnzg`. Read on 2026-10-14 at commit `029c1b9` ("Check GitHub to Lovable sync"), 538 commits, 2026-09-17 to 2026-10-07.
Paths below are relative to `src/` unless stated. Nothing in the repo was modified.

---

## 1. Stack, build, config

| Item | Detail |
|---|---|
| Framework | TanStack Start (React 19, file routes in `src/routes`, `routeTree.gen.ts` auto-generated), TanStack Router 1.170, TanStack Query 5 |
| UI | Tailwind v4, shadcn/ui "new-york" (`components.json`), lucide icons, sonner toasts, GSAP (`lib/motion.tsx`: entrance, glare, magnetic button, aurora backdrop), pdfjs-dist (PDF first-page preview) |
| Build | `vite dev` / `vite build` via `@lovable.dev/vite-tanstack-config` (bundles tanstackStart, react, tailwind, tsconfig paths, nitro build targeting Cloudflare). `vite.config.ts` only redirects the server entry to `src/server.ts` |
| Server | `server.ts` wraps the TanStack server entry and turns h3's swallowed 500 JSON into an HTML error page (`lib/error-page.ts`, `lib/error-capture.ts`). `start.ts` adds a request middleware that does the same. No server functions / API routes are defined — the app is a pure client of Supabase |
| SSR | Every data page sets `ssr: false`. Only `/` (redirect) and the root shell render on the server |
| Package manager | bun (`bun.lock`, `bunfig.toml` has a 24h minimum-release-age supply-chain guard) |
| Lint/format | eslint 9 + typescript-eslint + prettier (`printWidth 100`) |
| Fonts | Google Fonts Cormorant + Montserrat loaded in `routes/__root.tsx:79-82` |
| Brand assets | `assets/scalesource-logo-{color,white}.png.asset.json` (Lovable R2 asset pointers), `public/favicon.png` |
| Theme | `styles.css` (546 lines): purple `--primary #431867`, amber `#e0a43a`, stone background, custom utility classes `card-amber`, `glass-dark`, `cta-gold`, `grain`, `bell-ring` |

### Env vars / Supabase client (`lib/supabase.ts`)
- Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.
- **Hardcoded fallbacks** (lines 3-8): URL `https://kjpozzjeddvctcabtnzg.supabase.co` and a publishable key (`sb_publishable_...`). The publishable/anon key is safe to ship, but it means the app always talks to the prod project even with no `.env`.
- `.env` is committed (initial commit) but is **0 bytes** — it holds no keys at all. No service-role key anywhere in the repo.
- Client is created **without the `Database` generic**, so `database.types.ts` gives no compile-time checking of queries.
- Auth storage: `localStorage`, key `scalesource-candidate-review-auth`, `persistSession/autoRefreshToken/detectSessionInUrl` only in the browser.
- Types: `StaffRole = "admin" | "recruiter"`, `AppRole = StaffRole | "client" | "candidate"`, `Profile {id, role, full_name, email, avatar_url}`.

### Auth flow (`lib/auth.tsx`, `routes/login.tsx`, `reset-password.tsx`, `forgot-password.tsx`)
1. `AuthProvider` (mounted in `__root.tsx:109`) calls `auth.getSession()` then subscribes to `onAuthStateChange`; on every change it loads `profiles(id, role, full_name, email, avatar_url)` for the user (`auth.tsx:25-29`).
2. `/login`: email + password `signInWithPassword` (`login.tsx:66`), then navigates to `?redirect=` or `/dashboard`. "Forgot password?" toggles the same card into `resetPasswordForEmail(email, {redirectTo: origin + "/reset-password"})` (`login.tsx:55`). The separate `/forgot-password` page does the same (`forgot-password.tsx:33`).
3. `/reset-password`: waits for `PASSWORD_RECOVERY`/`SIGNED_IN` or an existing session, then `auth.updateUser({password})` (min 8 chars, client-side check only).
4. No sign-up, no magic link, no OAuth. Staff accounts are created by invite (edge function `admin-create-staff`).

### Roles and route guards
- Roles live in `profiles.role` (enum `app_role`: admin, recruiter, client, candidate).
- **The only guard is client-side, inside `components/app-shell.tsx:296-331`**: if no session -> navigate to `/login`; if session but `role` not admin/recruiter -> "Access restricted" card with sign-out. There is no `beforeLoad` guard on any route; `/login` does not bounce already-signed-in users.
- Admin-only checks are per page (`profile?.role === "admin"`) and in the sidebar (`adminOnly` flags, `app-shell.tsx:75-115`):
  - Admin-only nav: Recruiter Pool, CS Queue, the whole Operations group (Admin Tools, Add to Team, Roles, Manage Skills, System Monitor, Reports), Recruiter Activity.
  - Pages that enforce admin in-page: `/admin-tools`, `/cs-queue`, `/system-monitor`, `/reports`, `/recruiter-activity`, `/team` (TeamPanel), `/roles` (create button only).
  - **Not enforced in-page** (hidden from nav only): `/skills` (rename/merge/create skills; merge RPC itself checks staff/admin), `/recruiters` and `/recruiters/$staffId` (list visible to recruiters; invite buttons gated).
- Recruiter vs admin on candidates: `canEdit = isAdmin || candidate.recruiter_id === me` (`candidates.$candidateId.tsx:198-200`). Only admins can reassign recruiter or delete. Real enforcement must be RLS (not in this repo).

---

## 2. Routes

Sidebar groups (from `app-shell.tsx`): Dashboard; Pools (Candidate Pool + role dropdown, Recruiter Pool*, Client Pool); Pipeline (Client Requests, Interview Review, Offer Review, Placements, CS Queue*); Operations* (Admin Tools, Add to Team, Roles, Manage Skills, System Monitor, Reports); Activity (Inbox, Notifications, Activity Log, Recruiter Activity*). `*` = admin only.

| Path | File | Purpose | Reads | Writes |
|---|---|---|---|---|
| `/` | `index.tsx` | Redirects to `/dashboard` | – | – |
| `/login` | `login.tsx` | Sign in + inline forgot-password. Hero copy "Everything you need, in one place." | auth | auth |
| `/forgot-password` | `forgot-password.tsx` | Legacy standalone reset request | – | auth reset email |
| `/reset-password` | `reset-password.tsx` | Set new password from recovery link | auth session | `auth.updateUser` |
| `/dashboard` | `dashboard.tsx` | Admin "Operations overview" or recruiter "My pipeline overview": stat cards (candidate statuses, rejections by client/staff, open/needs-attention requests, matches, interviews, offers, active placements), admin overview, candidates-by-role, recently added, latest audit (admin). Refresh button refetches all | candidates, candidate_roles, candidate_skills, profiles, job_roles, clients, client_members, client_requests, candidate_matches, placements, audit_logs (admin) | – |
| `/candidates` | `candidates.index.tsx` | Candidate pool grouped by role (`?role=` from sidebar dropdown), search name/email/headline, tile per candidate with status, recruiter, roles, skill count | via `fetchCandidates` | – |
| `/candidates/new` | `candidates.new.tsx` | Full-page `CandidateForm` | job_roles, profiles, skills | candidates, candidate_roles, candidate_skills (Languages), storage + candidate_files |
| `/candidates/$candidateId` | `candidates.$candidateId.tsx` | Left rail (photo upload, status, recruiter, quick actions, admin reassign/delete) + tabs: Overview, Documents, AI Profile, Client Pipeline, Availability, Notes. Polls AI profile every 4s for up to 2 min | candidates, candidate_roles, candidate_skills, skills, candidate_work_history, candidate_education, recruiter_notes, candidate_matches, client_requests, clients, job_roles, candidate_files (+signed URLs), candidate_ai_profiles, candidate_interview_slots | candidates (recruiter_id at :221, delete), recruiter_notes insert, candidate_ai_profiles upsert (approved_summary), storage upload/remove + candidate_files, candidate_interview_slots upsert/delete |
| `/clients` | `clients.index.tsx` | Client grid (search name/industry, member + open-request counts, franchise badge, parent). "Add client" dialog = company + primary contact + first request (standard auto-match or custom hand-picked candidates) -> edge fn | clients, client_members, client_requests, job_roles, skills, role skills RPC, candidates (custom mode) | `functions.invoke("admin-create-client-with-request")` (:224) |
| `/clients/$clientId` | `clients.$clientId.tsx` | Client profile: pending-invite banner (`pending_contact`) with "Send invite now", requests, placements, contacts (add existing profile as member / remove), company card, edit name+industry, Message button | clients (+parent), client_members, client_requests, placements, profiles (all, :75) | clients update, client_members insert/delete, `functions.invoke("admin-send-pending-client-invite")` (:117) |
| `/requests` | `requests.index.tsx` | Request cards with status tabs (all/open/needs_attention/fulfilled/closed), progress (matches vs `candidates_wanted`), hired vs `hires_needed`, priority/curated/rejection-count badges. "New request" (standard; `candidates_wanted = max(4, hires*4)`) and "New custom request" (staff_curated, 1 wanted, navigates to detail) | client_requests, clients, job_roles, candidate_matches, skills, get_role_skills | client_requests insert, client_request_skills insert, add_or_get_skill_for_role |
| `/requests/$requestId` | `requests.$requestId.tsx` | Pipeline for one request: each match with view analytics (`match_views`), skill has/missing vs required, client star rating, meeting notes / recording links, score badge popover (`get_match_score_breakdown`), status Select with guarded transitions; Add candidate to batch; confirm-or-counter-propose interview dialog; reject-with-reason dialog; request status + priority selects; Message button | client_requests, client_request_skills, candidate_matches, skills, clients, job_roles, candidates, candidate_skills(+skills), match_views, get_match_score_breakdown | candidate_matches insert/update, candidates status, client_requests status/priority (:182), RPCs confirm_interview, admin_propose_interview_time (:138), staff_extend_offer, reject_candidate_match |
| `/interview-review` | `interview-review.tsx` | Board of matches in interview_requested / interview_confirmed / interview_completed / hire_requested. Actions: confirm client time, decline + propose new time (DateTimePicker), mark complete with notes (`complete_interview`, "notes sent to the client"), send contract (`staff_extend_offer`), reject; per-match shared "prep notes" stored as `thread_notes` on the candidate thread (thread only created when first note saved) | candidate_matches + joins, threads, thread_notes, get_thread_note_authors | RPCs above, get_or_create_thread, add_thread_note |
| `/offer-review` | `offer-review.tsx` | Matches in `offer_extended`: "Create placement" dialog (seat title, billing start, monthly rate, guarantee expiry, notes) -> `create_placement_and_mark_hired`; or reject. Legacy section lists `hired` matches with no placement row | candidate_matches, placements, candidates, clients, job_roles | RPCs create_placement_and_mark_hired, reject_candidate_match |
| `/placements` | `placements.tsx` | Placement list, tabs active/completed/terminated, search, billing start / monthly rate / guarantee end | placements, candidates, clients, job_roles | – |
| `/cs-queue` * | `cs-queue.tsx` | Requests with status `needs_attention`; "Mark open" | client_requests (+names) | client_requests.status |
| `/admin-tools` * | `admin-tools.tsx` | Candidates tab: search (first 50), change status (available, shortlisted, interviewed, hired, placed, rejected, inactive, archived) with confirm, reassign recruiter, archive. Clients tab: per-request "Reshuffle" (`reshuffle_request`, limit 6) enabled only for non-curated requests with `rejection_count >= 4` | candidates, profiles, client_requests, clients | candidates status/recruiter_id, rpc reshuffle_request (:146) |
| `/recruiters` * | `recruiters.index.tsx` | Recruiter cards with owned-candidate status breakdown, invite pending/active (`admin_staff_signin_status`), resend invite, "Invite recruiter" (`admin-create-staff` role recruiter) | profiles, candidates, rpc | edge fns |
| `/recruiters/$staffId` * | `recruiters.$staffId.tsx` | One recruiter's workload + owned candidates, resend invite | same | edge fn resend |
| `/team` * | `team.tsx` -> `TeamPanel` | Admin accounts list + "Invite admin" (`admin-create-staff` role admin) + resend | profiles, rpc | edge fns |
| `/roles` | `roles.tsx` -> `RolesPanel` | Job roles grid with candidate counts; admin "Add new role" | job_roles, candidates | job_roles insert |
| `/skills` | `skills.tsx` -> `SkillsPanel` | Tab 1 catalog: filter by category, search, usage counts, rename/recategorise, create, multi-select merge (`admin_merge_skills`). Tab 2 role skills: tag/untag skills per role | skills, candidate_skills, client_request_skills, get_role_skills | skills insert/update, admin_merge_skills, add_or_get_skill_for_role, role_skills delete |
| `/messages` | `messages.tsx` | Staff inbox with three tabs: General (one thread per client), Candidate (one per match), Request (one per request). Deep links `?client=`, `?match=`, `?request=`. Realtime refresh, unread from `thread_reads`, structured message chips, primary-contact card, candidate context card | threads, thread_messages, clients, client_requests, candidate_matches, candidates, job_roles, client_members, profiles, thread_reads | send_thread_message(_ensuring_thread), mark_thread_read |
| `/notifications` | `notifications.tsx` | Own notifications (100), mark read/unread, mark all read, "emailed" marker | notifications | notifications.read |
| `/audit-logs` | `audit-logs.tsx` | Admin: last 200 audit rows with actor; recruiter: own rows ("My Activity") | audit_logs, profiles | – |
| `/recruiter-activity` * | `recruiter-activity.tsx` | Last 300 audit rows filtered client-side to actors with role recruiter | audit_logs, profiles | – |
| `/system-monitor` * | `system-monitor.tsx` | Row counts (candidates, clients, requests, matches, placements), file count + bytes from `candidate_files.size_bytes`, last 15 audit rows | head counts, candidate_files, audit_logs | – |
| `/reports` * | `reports.tsx` | Placements this/last month, totals, tallies (candidate status, request status, match stage, rejection reasons by client/staff) with per-card CSV download | candidates, client_requests, candidate_matches, placements, clients | – |

Layout routes `candidates.tsx`, `clients.tsx`, `requests.tsx` are bare `<Outlet/>`.

---

## 3. Non-UI components, libs, hooks

### lib
- **`supabase.ts`** — client + role types (see §1).
- **`auth.tsx`** — `AuthProvider`, `useAuth`, `isStaff()`; reads `profiles`.
- **`database.types.ts`** — hand-written types (not generated). Declares in `Database.public.Tables`: `profiles, job_roles, candidates, candidate_roles, skills, role_skills, candidate_skills, candidate_work_history, candidate_education, recruiter_notes, tags, candidate_tags`. Enums: `app_role (admin|recruiter|client|candidate)`, `client_request_source (standard|staff_curated)`. Views/Functions: empty. Standalone row types outside the `Database` map: `ClientRow, ClientMemberRow, ClientRequestRow, ClientRequestSkillRow, CandidateMatchRow, PlacementRow, CandidateFileRow, CandidateAiProfileRow, NotificationRow, AuditLogRow`, plus string unions `EngagementType (full_time|part_time|project)`, `RequestStatus (open|needs_attention|fulfilled|closed)`, `RequestPriority (normal|high|urgent)`, `MatchStatus (recommended|shortlisted|interview_requested|interview_confirmed|interview_completed|hire_requested|offer_extended|hired|rejected)`, `RejectionReason (skill_mismatch|availability_conflict|culture_fit|other)`, `PlacementStatus (active|completed|terminated)`, `CandidateFileType (resume|profile_photo|intro_video|id_document|reference|other)`, `CandidateAvailability (available_now|open_to_offers|off_market|available_from|interviewing|closing_next_week|exploring)`. **Missing from types but used**: `threads, thread_messages, thread_notes, thread_scratchpad, thread_reads, match_views, candidate_interview_slots`, `client_requests.priority` is typed but other match columns used by SQL (`interview_duration_minutes, client_event_id, candidate_event_id, interview_proposed_by`) are not. `tags` / `candidate_tags` are declared but never used.
- **`queries.ts`** — job roles (list/create), staff profiles (`role in (admin, recruiter)`), `fetchCandidates` (candidates + role ids + skill counts + recruiter name), `fetchCandidateDetail`, `fetchSkills`, `syncLanguages` (only replaces `Languages`-category skills; other skills are "AI-owned"), `createCandidate` (status omitted so DB default `available` applies), `updateCandidate`, `syncChildren` (delete+reinsert candidate_roles, first role = primary), `deleteCandidate`, `addRecruiterNote`.
- **`crm-queries.ts`** — `FILE_TYPE_BUCKETS` (resume -> `candidate-resumes`, profile_photo -> `candidate-photos`, intro_video -> `intro-videos`, id_document/reference/other -> `candidate-documents`); clients (`fetchClients`, `createClient` **unused**, `updateClient`, `fetchClientDetail`, add/remove member); requests (`fetchClientRequests`, `fetchClientRequestDetail`, `createClientRequest`, `updateRequestStatus`, `parseSkillNames` **unused**); matches (`addMatch`, `confirmInterview`, `proposeInterviewTime`, `completeInterview`, `updateMatchStatus`, private `applyCandidateStatusForMatch`, `staffExtendOffer`, `createPlacement`, `fetchAllMatches`, `fetchMatchesForCandidate`, `fetchMatchesByStatus`); placements; files (upload path `{candidateId}/{fileType}/{Date.now()}-{safeName}`, 10-minute signed URLs); AI profile read + `saveApprovedSummary` upsert; notifications; audit logs; `fetchCandidateMedia`; admin `setCandidateStatus` / `setCandidateRecruiter`; `fetchSystemStats`.
- **`messages-queries.ts`** — thread model (`kind: request|candidate|general`, one thread per request / match / client), `fetchInbox` (all threads + all messages ordered desc, latest per thread computed client-side), `getOrCreateThread`, `sendThreadMessageEnsuringThread` (atomic create+send), `findThreadId` (read-only), `fetchThreadMessages`, `sendThreadMessage`, scratchpad fetch/update (**unused by any page**), thread notes + authors, `fetchPrimaryContact` (client_members `is_primary` -> profiles), `fetchCandidateThreadContext`. `StructuredType = reschedule_request | call_me_asap | send_portfolio`.
- **`thread-reads.ts`** — per-user last-read markers in `thread_reads` with a localStorage mirror; on first load copies newer local marks up via `mark_thread_read`; `useSyncExternalStore` for re-render.
- **`skills-admin.ts`** — skills with usage counts, `distinctCategories` (+ "Other"), create/update (23505 duplicate handling), `mergeSkills` -> `admin_merge_skills`, `fetchRoleSkills` -> `get_role_skills`, `addSkillToRole` -> `add_or_get_skill_for_role`, `removeSkillFromRole` (role_skills delete). Uses `(supabase.rpc as any)`.
- **`motion.tsx`** — GSAP helpers (reduced-motion aware). **`error-*.ts`, `lovable-error-reporting.ts`** — error page + Lovable telemetry hook. **`utils.ts`** — `cn`.

### hooks
- **`use-mobile.tsx`** — stock shadcn `useIsMobile` (only used by `ui/sidebar.tsx`, which itself is unused by the app shell).

### components (non-ui)
- **`app-shell.tsx`** — auth/role guard, sidebar (role dropdown from `job_roles`), header with title/description/actions, `NotificationsBell`, profile menu with sign-out.
- **`notifications-bell.tsx`** — popover of latest 12 notifications, polls every 60s, ring animation on new unread, mark read / all read.
- **`candidate-form.tsx`** — create/edit candidate: personal info, assigned recruiter (admin only), roles multi-select, availability (enum select, timezone, weekly hours 0-80, preferred shift, earliest start required when `available_from`), Languages multi-select (English pinned first), intro video link or upload, on-create uploads for photo/resume/ID/other. Writes via `createCandidate`/`updateCandidate` + `uploadCandidateFile`.
- **`candidate-form-dialog.tsx`** — dialog wrapper used for Edit on the profile page.
- **`candidate-files-card.tsx`** — list/upload/preview(PDF first page)/open/delete candidate files; resume upload toasts "AI analysis will appear automatically" and invalidates AI query after 3s.
- **`PdfPagePreview.tsx`** — renders page 1 of a PDF to canvas with clickable link overlays.
- **`interview-availability-card.tsx`** — Calendly-style slot builder: weekly pattern (days, from/to, 30/45/60/90 min, 0/15/30 gap, start date, 1-8 weeks, max 400) in any timezone, single slot add, list grouped by day with "Booked by {client}" (derived client-side from `candidate_matches -> client_requests -> clients`), remove one / remove all open. Direct table access to `candidate_interview_slots` (upsert ignoreDuplicates on `candidate_id,starts_at`).
- **`match-status.tsx`** — badges for match status, request status, staff-curated, priority.
- **`reject-reason-dialog.tsx`** — reason enum + note; caller runs the RPC.
- **`roles-panel.tsx`**, **`role-skills-panel.tsx`**, **`role-skill-picker.tsx`** (must-have skills scoped to a role, can add a new skill to the role inline), **`skills-panel.tsx`**, **`team-panel.tsx`** — see routes.
- **`confirm-dialog.tsx`, `date-time-fields.tsx` (DatePicker, TimePicker, DateTimePicker), `form-section.tsx`, `multi-select.tsx`, `timezone-select.tsx`** (curated IANA list labelled "US/Eastern" etc.) — pure UI.

### components/ui (shadcn)
46 stock files. Changed after the initial remix commit (styling only, liquid-glass redesign + "remove blur" commit): `button, tabs, sheet, select, popover, dialog, textarea, input, card, calendar`; one-off touches on most others. Files containing custom brand classes: `avatar, button, calendar, card, carousel, dialog, drawer, input, navigation-menu, popover, progress, radio-group, scroll-area, select, sheet, sidebar, slider, switch, tabs, textarea`. No data logic in ui/.

---

## 4. Every Supabase touchpoint (file:line)

Line = line of `.from(` / `.rpc(` / `.invoke(`; the operation may be on the next lines of the chain.

### Tables
| Table | Touchpoints |
|---|---|
| `profiles` | select: `lib/auth.tsx:26`, `lib/queries.ts:47` (staff), `lib/crm-queries.ts:151` (all, client detail), `:765`, `:865` (audit actors), `lib/messages-queries.ts:388` (primary contact), `routes/clients.$clientId.tsx:75` (all profiles for Add contact) |
| `job_roles` | select `lib/queries.ts:17`, insert `:30`; select `lib/crm-queries.ts:217, 275, 607, 637, 835`, `lib/messages-queries.ts:429`, `lib/skills-admin.ts:101`, `routes/messages.tsx:115` |
| `candidates` | select `lib/queries.ts:65, 104`, `lib/crm-queries.ts:276, 438, 525, 635, 836`, `lib/messages-queries.ts:163, 407`; insert `lib/queries.ts:257`; update `lib/queries.ts:284`, `lib/crm-queries.ts:443` (available->shortlisted), `:539` (lifecycle), `:882` (status), `:887` (recruiter), `routes/candidates.$candidateId.tsx:221` (recruiter); delete `lib/queries.ts:306` |
| `candidate_roles` | select `lib/queries.ts:66, 105`; delete `:236`; insert `:238` |
| `candidate_skills` | select `lib/queries.ts:67, 106`, `lib/crm-queries.ts:284` (join `skills(name)`), `lib/skills-admin.ts:15`; delete `lib/queries.ts:191` (Languages only); insert `:201` |
| `skills` | select `lib/queries.ts:142`, `lib/crm-queries.ts:266`, `lib/skills-admin.ts:14`; insert `lib/queries.ts:170`, `lib/skills-admin.ts:50`; update `lib/skills-admin.ts:72` |
| `role_skills` | delete `lib/skills-admin.ts:122` |
| `candidate_work_history` / `candidate_education` | select `lib/queries.ts:108` / `:113` (written only by the AI pipeline) |
| `recruiter_notes` | select `lib/queries.ts:118`; insert `:316` |
| `clients` | select `lib/crm-queries.ts:66, 143, 160, 216, 274, 606, 636, 834`, `lib/messages-queries.ts:182, 417`, `routes/messages.tsx:113, 138`; insert `lib/crm-queries.ts:100` (unused fn); update `:118` |
| `client_members` | select `lib/crm-queries.ts:67, 144`, `lib/messages-queries.ts:380`; insert `lib/crm-queries.ts:186`; delete `:197` |
| `client_requests` | select `lib/crm-queries.ts:68, 146, 215, 259, 603, 831`, `lib/messages-queries.ts:172, 409`, `routes/messages.tsx:109`; insert `lib/crm-queries.ts:362`; update `:417` (status), `routes/requests.$requestId.tsx:182` (priority) |
| `client_request_skills` | select `lib/crm-queries.ts:260`, `lib/skills-admin.ts:16`; insert `lib/crm-queries.ts:399` |
| `candidate_matches` | select `lib/crm-queries.ts:218, 262, 518, 578, 593, 821`, `lib/messages-queries.ts:152, 401`, `routes/messages.tsx:117`; insert `lib/crm-queries.ts:428` (status recommended); update `:503` (any non-rejected status) |
| `match_views` | select `lib/crm-queries.ts:306` (client profile-view analytics) |
| `placements` | select `lib/crm-queries.ts:150, 634` (inserted only by RPC) |
| `candidate_files` | select `lib/crm-queries.ts:656, 916`; insert `:678`; delete `:701` |
| `candidate_ai_profiles` | select `lib/crm-queries.ts:711`; upsert `:721` (approved_summary) |
| `candidate_interview_slots` | select (join matches->requests->clients) `components/interview-availability-card.tsx:147`; upsert `:219`; delete `:257` |
| `notifications` | select `lib/crm-queries.ts:733`; update `:743`, `:749` |
| `audit_logs` | select `lib/crm-queries.ts:764, 777, 864` (written by DB triggers, not the app) |
| `threads` | select `lib/messages-queries.ts:82, 257`, `routes/messages.tsx:148` |
| `thread_messages` | select `lib/messages-queries.ts:96, 268` |
| `thread_notes` | select `lib/messages-queries.ts:328` |
| `thread_scratchpad` | select `lib/messages-queries.ts:292` (unused) |
| `thread_reads` | select `lib/thread-reads.ts:48` |
| head counts | `lib/crm-queries.ts:904` (`countRows` on candidates, clients, client_requests, placements, candidate_matches) |

### RPCs
| RPC | Called at |
|---|---|
| `resolve_or_create_skills(p_names)` | `lib/crm-queries.ts:388` (only when `must_have_skill_names` passed — no caller does) |
| `confirm_interview(p_match_id, p_notes)` | `lib/crm-queries.ts:453` |
| `admin_propose_interview_time(p_match_id, p_proposed_at, p_notes)` | `lib/crm-queries.ts:470`, `routes/requests.$requestId.tsx:138` (duplicate inline call) |
| `complete_interview(p_match_id, p_notes)` | `lib/crm-queries.ts:479` |
| `reject_candidate_match(p_match_id, p_reason, p_note, p_rejected_by='staff')` | `lib/crm-queries.ts:494` |
| `staff_extend_offer(p_match_id)` | `lib/crm-queries.ts:555` |
| `create_placement_and_mark_hired(p_match_id, p_seat_title, p_billing_start_date, p_monthly_rate, p_guarantee_window_expires, p_notes)` | `lib/crm-queries.ts:564` |
| `get_match_score_breakdown(p_match_id)` | `routes/requests.$requestId.tsx:689` |
| `reshuffle_request(p_request_id, p_limit=6)` | `routes/admin-tools.tsx:146` |
| `admin_staff_signin_status()` | `components/team-panel.tsx:22`, `routes/recruiters.index.tsx:45`, `routes/recruiters.$staffId.tsx:47` |
| `admin_merge_skills(p_source_ids, p_target_id)` | `lib/skills-admin.ts:84` |
| `get_role_skills(p_role_id)` | `lib/skills-admin.ts:107` |
| `add_or_get_skill_for_role(p_role_id, p_skill_name, p_category)` | `lib/skills-admin.ts:113` |
| `get_or_create_thread(p_candidate_match_id / p_client_request_id / p_client_id)` | `lib/messages-queries.ts:221` |
| `send_thread_message_ensuring_thread(...)` | `lib/messages-queries.ts:239` |
| `send_thread_message(p_thread_id, p_body, p_structured_type)` | `lib/messages-queries.ts:281` |
| `update_thread_scratchpad` | `lib/messages-queries.ts:304` (unused) |
| `add_thread_note(p_thread_id, p_body)` | `lib/messages-queries.ts:337` |
| `get_thread_note_authors(p_thread_id)` | `lib/messages-queries.ts:346` |
| `mark_thread_read(p_thread_id, p_read_at)` | `lib/thread-reads.ts:70, 109` |

### Edge functions (`functions.invoke`)
| Function | Called at | Body |
|---|---|---|
| `admin-create-staff` | `components/team-panel.tsx:168` (role admin), `routes/recruiters.index.tsx:234` (role recruiter) | `{email, full_name, role}` |
| `admin-resend-staff-invite` | `components/team-panel.tsx:56`, `routes/recruiters.index.tsx:90`, `routes/recruiters.$staffId.tsx:85` | `{user_id}` |
| `admin-create-client-with-request` | `routes/clients.index.tsx:224` | `{name, industry, parent_client_id, is_franchise_brand, primary_contact{first_name,last_name,email,position}, request{...}}` -> `{ok, client_id, request_id, matched_count, invited, needs_manual_match}` |
| `admin-send-pending-client-invite` | `routes/clients.$clientId.tsx:117` | `{client_id}` |
| `calendar-sync` | not called by app; DB trigger `tg_calendar_sync` posts to it (`sql/calendar_sync_split_events_fix.sql:36`) | `{match_id, action: create|patch|cancel}` |

### Storage
Buckets `candidate-resumes`, `candidate-photos`, `intro-videos`, `candidate-documents` (`lib/crm-queries.ts:19-26`). Upload `:673`, `createSignedUrl(600s)` `:692`, `remove` `:700`.

### Realtime
`routes/messages.tsx:211` channel `inbox-all-messages` (INSERT on `thread_messages`, all rows) -> invalidate inbox; `routes/messages.tsx:787` channel `thread-messages-{id}` (INSERT filtered `thread_id=eq.{id}`).

### Auth
`auth.getSession/onAuthStateChange/signOut` (`lib/auth.tsx:35,41,59`), `signInWithPassword` (`login.tsx:66`), `resetPasswordForEmail` (`login.tsx:55`, `forgot-password.tsx:33`), `updateUser` (`reset-password.tsx:50`), `auth.getUser` (`interview-review.tsx:479`).

### DB objects referenced only in `sql/`
`is_staff()`, `is_admin()`, `client_owns_request()`, `slot_is_taken()`, `get_match_interview_slots()`, `client_book_interview_slot()` (client app), `get_interview_calendar_payload()`, `format_interview_time()`, `tg_calendar_sync()`, `apply_calendar_event`, vault secret `calendar_hook_secret`, `pg_net`. The `sql/` folder is a record of hand-applied changes, not a migration set; each file says the live DB is the source of truth.

---

## 5. End-to-end staff workflow

**Candidate lifecycle (candidates.status, text, default `available`)**: available -> shortlisted (on first match) -> interviewed (on interview_completed) -> hired -> placed (by placement RPC); rejected; admin-only inactive/archived. The client-side transitions live in `addMatch` (`crm-queries.ts:437-444`) and `applyCandidateStatusForMatch` (`:514-540`).

1. **Sourcing / candidate creation** — recruiter fills `CandidateForm` (`/candidates/new`): row in `candidates` (recruiter defaults to self), `candidate_roles`, Languages skills; optional files uploaded to storage + `candidate_files`.
2. **Resume AI processing** — the app never invokes an AI function. Uploading a `resume` file creates a `candidate_files` row; a server-side pipeline (trigger/webhook/edge function not in this repo) parses it and writes `candidate_ai_profiles` (`recruiter_summary`, `skills`, `highlights`, `rank_score`, `model_version`, `ai_metadata`), non-Language `candidate_skills`, `candidate_work_history`, `candidate_education`. The profile page polls `candidate_ai_profiles` every 4s for 2 minutes. Staff edit only `approved_summary` (client-facing). The AI rank score feeds matching (`get_match_score_breakdown` shows up to 15 AI points: experience 5, skills 5, certifications 3, completeness 2).
3. **Client + first request** — admin/recruiter "Add client" calls `admin-create-client-with-request`. Standard requests auto-match server-side; if zero matches, the primary-contact invite is deferred into `clients.pending_contact` and the UI warns; staff add a candidate then press "Send invite now" (`admin-send-pending-client-invite`). Custom (`staff_curated`) requests take hand-picked candidate ids and are never auto-matched/reshuffled.
4. **More requests** — `/requests` "New request" inserts `client_requests` (status open, source standard, candidates_wanted = 4 x hires) + `client_request_skills` (must-have role skills + required languages, all `is_required=true`). Auto-matching must be a DB trigger (no client call); score = role fit + required-skill points + experience points + AI score (stored in `candidate_matches.match_score`, explained by `get_match_score_breakdown`).
5. **Shortlist / batch** — `/requests/$id` "Add candidate to batch" inserts `candidate_matches(status recommended, match_reason)` and flips the candidate to shortlisted. Staff can see client views (`match_views`), client star ratings, skill gaps. Clients reject from their app; when a standard request accumulates `rejection_count >= 4`, admin can `reshuffle_request` (6 new candidates).
6. **Interviews** — client requests an interview (proposes time, client app) or books a staff-published slot (`client_book_interview_slot`, confirms immediately). Staff in `/interview-review` or request detail: `confirm_interview` (copies proposed -> scheduled) or `admin_propose_interview_time` (counter-offer, notifies client). Status `interview_confirmed` fires `tg_calendar_sync` -> `calendar-sync` edge fn -> Google Calendar events + Meet link (`client_event_id`, `candidate_event_id`, `meet_url`); reschedule patches, rejection cancels. Meeting notes / recordings appear on the match (`meeting_notes_*`, `recording_url`). Staff `complete_interview` with notes (sent to client). Prep notes are `thread_notes` on the candidate thread.
7. **Hire / offer** — client sets `hire_requested`; staff `staff_extend_offer` ("contract sent", -> `offer_extended`).
8. **Placement** — `/offer-review` "Create placement" -> `create_placement_and_mark_hired` (atomic: placement row with seat_title, billing_start_date, monthly_rate, guarantee_window_expires, notes; match -> hired; candidate -> placed). `/placements` lists them; no edit/terminate UI exists.
9. **Rejection** — staff reject anywhere via `reject_candidate_match(..., 'staff')` with reason enum + note.
10. **Messaging** — three thread kinds (general per client, request, candidate/match). Staff send via RPCs; structured message types render as chips; unread computed from `thread_reads` vs last client message; realtime INSERT subscription. Notifications (`notifications` table, `send_email`, `email_sent_at`) are produced by DB functions, the app only reads/marks read.
11. **Oversight** — CS queue (`needs_attention` requests), admin tools, audit log (DB-trigger-written), reports, system monitor.

---

## 6. Clients and client_members — creation and columns relied on

**Creation paths**
- Primary: edge fn `admin-create-client-with-request` (`clients.index.tsx:224`) creates `clients`, the first `client_requests` (+skills/matches), and (if matches exist) invites the primary contact (creates auth user + `profiles(role=client)` + `client_members(is_primary=true, client_position)`). Otherwise stores the contact in `clients.pending_contact` (jsonb `{first_name,last_name,email,position}`).
- `admin-send-pending-client-invite` (`clients.$clientId.tsx:117`) sends the deferred invite (presumably clears `pending_contact`, creates member).
- Direct inserts: `client_members` via `addClientMember` (`crm-queries.ts:186`) linking any existing profile; `clients` via `createClient` (`crm-queries.ts:100`) is dead code.
- Edits: `updateClient` writes `name, industry, parent_client_id, is_franchise_brand` (`crm-queries.ts:118`); the edit dialog only exposes name + industry.

**`clients` columns the staff app reads/writes**
| Column | Use |
|---|---|
| `id` (uuid) | FK target everywhere (client_requests.client_id, placements.client_id, client_members.client_id, threads.client_id) |
| `name` (text, NOT NULL in practice) | Displayed everywhere; ordered by; joined by id->name maps in ~12 places; calendar payload `client_name`; notifications text in SQL |
| `industry` | List, search, edit, admin tools subtitle |
| `parent_client_id` | Parent/franchise grouping, "Part of X" |
| `is_franchise_brand` | Badge, create |
| `pending_contact` (jsonb) | Deferred-invite banner |
| `created_at`, `updated_at` | Typed, not displayed |

**`client_members` columns**: `client_id`, `profile_id` (-> profiles.id, the client user), `is_primary` (used by `fetchPrimaryContact` and by SQL `get_interview_calendar_payload` to pick the client email for calendar invites), `client_position`, `created_at`. Composite identity (client_id, profile_id) — delete uses both. SQL `client_book_interview_slot` and `client_owns_request` authorise clients via `client_members.profile_id = auth.uid()`.

**Merge implications for the ScaleSource Local billing `clients` table** (`lead_id, company, owner_name, owner_email, owner_phone, plan, billing, billing_status, qb_customer_id`):
- Name clash: this backend already has `public.clients` keyed by uuid `id` with `name`. Either add billing columns to this table (map `company -> name`; add `lead_id, plan, billing, billing_status, qb_customer_id`) or keep billing in a separate table (`client_billing(client_id fk)`) to avoid touching the ~25 code paths that select `clients(id, name)`.
- `owner_name/owner_email/owner_phone` overlap the primary contact concept, which here lives in `profiles` + `client_members(is_primary)` (or `pending_contact` before invite). Duplicating owner contact on `clients` would create two sources of truth for the calendar/invite email; prefer mapping owner -> primary member, or keep the owner fields as billing-contact only.
- Every client in this backend is expected to have requests/members; a billing-only client with no members is fine for the UI (counts show 0) but `fetchPrimaryContact` returns null and calendar `client_email` would be null.
- The app uses `select("*")` on `clients` in several places, so added columns flow into the UI objects harmlessly; RLS on `clients` must not expose billing columns to `client` role users unless intended (the client app also reads `clients`).
- `INDUSTRY_OPTIONS` / `POSITION_OPTIONS` (`clients.index.tsx:42-97`) are said to be kept in sync with the Candidate Pool get-started wizard; a trades business would want e.g. "Landscaping", "Owner/Operator", "Crew Lead".

---

## 7. Vertical-specific wording and assumptions (for a landscaping/trades staffing pivot)

No literal "vet", "VetPod", "veterinary", "clinic", "patient" or "pet" strings exist in this repo. The app is generic ScaleSource branding, but it is built around **remote, offshore-style office staffing** (VA/CSR/bookkeeping), which is the real mismatch for field crews:

| Item | Location | Why it matters for trades |
|---|---|---|
| Role examples "CSR or Bookkeeping" | `components/roles-panel.tsx:103` | Replace with e.g. Crew Lead, Irrigation Tech, Hardscape Installer |
| Meta "from CSR to marketing positions" | `routes/roles.tsx:12` | Copy |
| Skill categories `Software, Customer Service, Languages, Other` | `components/skills-panel.tsx:39` | Trades need Equipment, Certifications/Licences (CDL, pesticide applicator), Trades skills |
| Languages required on every standard request; English pinned first | `requests.index.tsx:175, 139-148`, `clients.index.tsx:142-152, 195`, `candidate-form.tsx:171-180` | Make optional; Spanish likely relevant |
| Timezone requirement / candidate timezone / Country / weekly hours / preferred shift | `candidate-form.tsx:223-340`, request forms, `timezone-select.tsx:15+` (worldwide list incl. Africa/Asia) | Field work is local: need location/radius, driver's licence, own transport, travel distance |
| "Hours needed" placeholder `20 hrs/week` | `requests.index.tsx:411`, `clients.index.tsx:569` | Seasonal/full-day crews |
| Engagement types `full_time | part_time | project` | request forms, `EngagementType` | Add seasonal, W-2 vs 1099, subcontractor |
| Intro video upload/link, PDF resume + AI resume score (certifications/completeness) | `candidate-form.tsx:397-438`, `candidates.$candidateId.tsx`, AI pipeline | Many trades candidates have no resume; AI scoring weights resume completeness |
| Interviews are video (calendar payload `mode: 'video'`, Google Meet) | `sql/candidate_interview_slots.sql:180` | Trades may need in-person working interviews / trial days |
| Placement commercial model: `monthly_rate`, `billing_start_date`, `guarantee_window_expires` | `offer-review.tsx:240-330`, `placements.tsx:125-127` | ScaleSource Local billing (plan/billing_status/QuickBooks) differs from per-seat monthly rate |
| Seat placeholder "e.g. Customer Support Rep" | `offer-review.tsx:289` | Copy |
| Custom request title placeholder "Executive Assistant for Jane" | `requests.index.tsx:559` | Copy |
| Industry list (office industries) and contact positions incl. "Practice Manager", "Executive Assistant" | `clients.index.tsx:42-97` (Practice Manager `:85`) | Add Landscaping, Construction trades, Owner/Operator, Crew Manager |
| Structured message "Send Portfolio — candidate's portfolio/work samples" | `messages.tsx:95-97`, `messages-queries.ts:5` | Photos of past jobs maybe; rename |
| Availability enum (open_to_offers, closing_next_week, exploring...) | `candidate-form.tsx:297-303`, `database.types.ts:37-44` | Job-seeker market language |
| Rejection reason `culture_fit` etc. | `crm-queries.ts:44-49` | Add no-show, no transport, failed check |
| "Talk to us about {first name}" button on staff profile | `candidates.$candidateId.tsx:641` | Client-facing copy leaked into staff app |
| Product names "Candidate Review Dashboard", "Candidate Pool Review System", "Staff workstation" | `__root.tsx:70-71`, `login.tsx:20-29, 85-93, 186`, every route `head()` | Rebrand if serving ScaleSource Local |
| `candidates_wanted = max(4, hires*4)` batch sizing; reshuffle at 4 rejections, 6 new | `requests.index.tsx:183`, `admin-tools.tsx:146-148, 356` | Business rule to revisit for local bench sizes |

---

## 8. Bugs, dead code, risky patterns, security

**Security / access**
- Route protection is client-side only (`AppShell`); every page module ships to any visitor and all access control depends on Supabase RLS + RPC checks that are not in this repo. Verify RLS on all tables listed in §4, especially `profiles` (the client page selects every profile's name/email/phone, `crm-queries.ts:151`, `clients.$clientId.tsx:75`) and `candidates` (recruiters can call `updateCandidate`/`deleteCandidate` directly; only the UI restricts delete to admins).
- `/skills`, `/recruiters`, `/recruiters/$staffId` have no in-page admin check (nav-hidden only). Skill rename/create are plain table writes.
- Candidate status lifecycle and `available -> shortlisted` are client-side read-then-write sequences (`crm-queries.ts:437-444, 514-540`) — racy and bypassable; should be a trigger/RPC like the placement and reject flows.
- `updateMatchStatus` lets staff set any non-rejected status directly with a table update (`crm-queries.ts:503`); the request-detail UI blocks some transitions but `interview_review` "advance" and the Select permit others (e.g. jumping to `shortlisted`/`hire_requested`). Server-side state-machine enforcement unknown.
- Hardcoded Supabase URL + publishable key fallback (`supabase.ts:3-8`): not secret, but a mis-configured env silently points at production. `.env` committed (empty).
- Realtime subscription to all `thread_messages` inserts (`messages.tsx:211`) relies on RLS for realtime being configured.
- Signed URLs (10 min) opened with `window.open`; PDF link overlays render `unsafeUrl` from uploaded PDFs as clickable anchors (`PdfPagePreview.tsx:48`) — low risk (`noopener noreferrer`), but untrusted links.

**Bugs / correctness**
- `deleteCandidateFile` ignores the storage `remove` error, then deletes the row (`crm-queries.ts:700`) -> orphaned objects possible; reverse order on failure also possible.
- `uploadCandidateFile` uploads then inserts the row; if the insert fails the object is orphaned (`:673-688`).
- `syncChildren` deletes `candidate_roles` without checking the error and re-inserts (`queries.ts:236`); not transactional. `createCandidate` + children + uploads are not atomic.
- Request detail "Propose time" builds the time in the **browser's local timezone** (`requests.$requestId.tsx:135-137`) with no timezone shown, while the client sees it in `timezone_requirement`. Interview review uses DateTimePicker (also local). Request detail duplicates the RPC call instead of using `proposeInterviewTime`.
- `fetchInbox` loads **every** thread and **every** message (`messages-queries.ts:82-106`) to find the latest per thread; also re-runs `fetchClientRequests` (all requests + all matches). Polls every 30s plus on every realtime insert. Will degrade with volume.
- Many N+1/over-fetch patterns: `fetchClientRequestDetail` loads all candidates and all skills; `fetchMatchesByStatus`/`fetchPlacements` load all candidates/clients/roles; `fetchClientDetail` loads all profiles; `syncLanguages` calls `fetchSkills` twice.
- `offer-review` "placedKeys" matching uses `candidate_id:client_request_id`; fine, but a candidate placed twice on the same request would hide.
- Request detail "Add candidate" lists all candidates including archived/placed/rejected (`requests.$requestId.tsx:543`).
- `reports.tsx` month keys use local dates on `billing_start_date` strings parsed as UTC -> off-by-one-day at month boundaries for western timezones.
- Notifications bell and page both poll; bell `refetchInterval 60s` even when page hidden.
- `fetchCandidateMedia` takes the newest photo/video because files are ordered desc — fine, but old photos are never cleaned.
- Typo-level: Team page title "Add to team" but panel only manages admins; recruiters invited from `/recruiters`.

**Dead code / unused**
- `crm-queries.ts`: `createClient`, `parseSkillNames`, `must_have_skill_names` branch + `resolve_or_create_skills` RPC.
- `messages-queries.ts`: `fetchScratchpad`, `updateScratchpad` (`thread_scratchpad` table no longer surfaced); `STRUCTURED_META` keeps legacy types.
- `database.types.ts`: `tags`, `candidate_tags`, `role_skills` typed but tags unused; `Database` type never applied to the client.
- `/forgot-password` page superseded by inline flow (kept intentionally).
- `hooks/use-mobile.tsx` and `ui/sidebar.tsx` unused by the app shell.
- Dependencies with no import outside ui/: `@dnd-kit/*`, `@ffmpeg/ffmpeg`, `@ffmpeg/util`, `xlsx` (CSV export is hand-rolled), `@tanstack/react-table`; `recharts`, `react-hook-form`, `embla`, `vaul`, `input-otp`, `react-resizable-panels` only via unused shadcn ui files.
- Offer review "Legacy — hired, awaiting placement" section (documented as legacy).

**Process risks**
- `sql/` files are after-the-fact records of manual SQL-editor changes; `admin_merge_skills.sql` explicitly lags the live function (`is_staff` vs live `is_admin`, missing `role_skills` handling). The real schema, RLS, triggers (matching, AI pipeline, audit, notifications) and edge functions live only in Supabase — see the sibling `supabase/` backup.
- Lovable two-way sync: AGENTS.md forbids force-push/rebase on the connected branch.

---

## 9. `redesign/liquid-glass` branch vs `main`

`main`, `origin/main` and `origin/redesign/liquid-glass` all point at the same commit `029c1b9`. `git diff --stat main origin/redesign/liquid-glass` is empty and neither branch has commits the other lacks. The liquid-glass redesign was already merged into main (commit `adcfe88` "Redesign Candidate Review Dashboard UI in the liquid-glass style", followed by `3098f41` "Remove blur from animated dialogs, popovers and panels", sign-in card changes `14e6b3d`, `b003b82`, `f752cb5`, `3cf465c`). The branch is now just a stale pointer and can be deleted or ignored.

Recent main history (newest first): `029c1b9` sync check; `4d33d2f` calendar sync trigger fix (split event ids); `69a1db5` client timezone interview SQL; `a785767` weekly availability builder with timezone; `b691c68` slot_is_taken internal note; `31cb36e` interview availability slots; `269d6d0` per-user thread_reads; `0b8b923` "Fix staff dashboard logic issues"; then the redesign/sign-in commits, README, priority badge, and many Lovable "Changes" commits.
