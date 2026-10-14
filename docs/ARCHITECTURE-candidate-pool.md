# Candidate Pool (client-facing app): architecture reference

Repo: `backups/repos/candidate-pool` (Lovable-connected, GitHub to Lovable sync). Read-only review on 2026-10-14 at `main` = `d94f646` ("Check GitHub to Lovable sync", 2026-10-07). 414 commits. Nothing in the repo was modified.

Supabase project: `kjpozzjeddvctcabtnzg`. The edge-function and migration sources referenced below come from the sibling export `backups/2026-10-14-candidate-pool-system/supabase/`. They are not part of this repo, but `public-client-request` was read because it is where the hiring request is actually written.

All `file:line` references are relative to `candidate-pool/src/` unless stated otherwise.

---

## 1. Stack and build

| Item | Detail |
|---|---|
| Framework | TanStack Start (`@tanstack/react-start` 1.168) with file-based TanStack Router (`src/routes`, generated `routeTree.gen.ts`). React 19. |
| Build | Vite 8 via `@lovable.dev/vite-tanstack-config` (`vite.config.ts`). The Lovable preset bundles tanstackStart, viteReact, tailwind, tsconfig paths, nitro (Cloudflare target by default), the component tagger, `VITE_*` env injection and the `@` alias. The server entry is redirected to `src/server.ts`, an SSR error wrapper. |
| Package manager | Bun (`bun.lock`, `bunfig.toml` with a 24-hour `minimumReleaseAge` supply-chain guard). Scripts: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`. |
| UI | Tailwind v4 (`src/styles.css`, about 590 lines of tokens and keyframes), shadcn/ui "new-york" (`components.json`), lucide icons, sonner toasts, GSAP and `@gsap/react` for motion (`lib/motion.tsx`). |
| Data | `@supabase/supabase-js` 2.108, called directly from components. There are no API routes and no server functions. React Query is installed and a `QueryClient` is created (`router.tsx:6`, `__root.tsx:127`), but no `useQuery` call exists anywhere. Every page uses a `useState` + `load()` + `usePollingRefresh` pattern instead. |
| SSR | `__root.tsx` renders the shell. Most pages set `ssr: false`: login, get-started, new-request, requests, requests/$id, interviews, shortlisted. `/team`, `/messages`, `/reset-password` and `/` still SSR. |
| Fonts and brand | Google Fonts Cormorant + Montserrat (`__root.tsx:90-95`). Plum `#431867` and gold `#E0A43A` on stone `#faf9f7` (`styles.css:59+`). White ScaleSource logo from the Lovable asset CDN (`assets/scalesource-logo-white.png.asset.json`). The favicon (`public/favicon.svg`) is a plum square with an amber "users" icon. |
| Error handling | `server.ts` normalises h3-swallowed SSR 500s into `lib/error-page.ts` HTML. `start.ts` adds request middleware that does the same. `lib/error-capture.ts` records the last global error. `lib/lovable-error-reporting.ts` forwards root error-boundary errors to `window.__lovableEvents`. |
| Lint and types | ESLint 9 with typescript-eslint, react-hooks and prettier. `tsconfig` is strict and has `noUnusedLocals: false`. |
| `.lovable/` | `project.json` holds only the template id. `plan.md` is the last Lovable plan ("Staff sender labels in chat", using the `get_thread_sender_profiles` RPC). |
| Docs | `README.md` (product summary, Bun dev, a warning that the app talks to the live DB). `AGENTS.md` (Lovable "don't rewrite history" banner plus two architecture notes). `roadmap.md` is a checklist. The only open item there is "Verify authenticated interview submission… blocked: QA login helper is disabled". `src/routes/README.md` is a TanStack routing cheat-sheet. |

### Supabase client configuration (`lib/supabase.ts`)
- **The URL and anon key are hardcoded** (`lib/supabase.ts:3-5`): `https://kjpozzjeddvctcabtnzg.supabase.co` and the anon JWT (exp 2105). No env vars are read anywhere. `VITE_*` injection exists in the preset but is unused, so there is no dev/staging/prod split. The README warns that the app hits the live DB.
- `persistSession` and `localStorage` storage are on only in the browser. `autoRefreshToken: true`. `detectSessionInUrl` keeps its default (true), which is how magic-link `#access_token` redirects work.
- There are no generated DB types. The client is untyped, results are cast with `as unknown as …`, and `candidate_match_views` is cast `as never` (`routes/interviews.tsx:377,445`).

---

## 2. Auth, guards and roles

### Auth provider (`lib/auth.tsx`)
- `getSession()` runs on mount (`:25`) and `onAuthStateChange` keeps the session current (`:29`). The context exposes `{session, user, loading, signIn, signOut}`.
- `signIn` calls `signInWithPassword` (`:40`). A "banned" error is rewritten to "Login credentials expired." (`:16-19`). The staff side presumably bans users to expire access.

### Sign-in modes (`routes/login.tsx`)
| Mode | What happens |
|---|---|
| password | `signIn(email,password)`, then navigate to `/requests` (`login.tsx:80-86`). |
| magic ("Email me a sign-in link instead") | `functions.invoke("client-magic-link", {email})` (`:90`). The edge function generates a `magiclink` with `redirectTo = CLIENT_APP_URL/requests` and sends it through Resend. The UI always says "If X is registered with a client company, a secure login link has been sent" (`:153`), so it does not reveal whether an account exists. |
| forgot ("Forgot password?") | **Sends the same magic link**, not a password-recovery email (`:40-42`, owner decision). There is no in-app "change password" screen. Clients sign in by link from then on. |

### Recovery and invite landing (`routes/reset-password.tsx`)
Handles every link form: `?code=` (PKCE, `exchangeCodeForSession` `:55`), `?token_hash=&type=` (`verifyOtp` `:57`, type recovery/invite/signup/magiclink), or implicit `#access_token` (auto-detected). Phases are verifying, ready, invalid and done. The page sets a password via `auth.updateUser({password})` (`:85`; minimum 8 characters, must be confirmed), then redirects to `/requests` after 1.8 s. Invite links from `client-invite-colleague` and `public-client-request` redirect here.

### Public signup and invite in the wizard
`/get-started` posts to `public-client-request`. For a brand-new email the function calls `admin.generateLink({type:'invite'})` and **returns the `hashed_token` to the browser**. The page then calls `verifyOtp({token_hash, type:'invite'})` (`get-started.tsx:307`) to create a session immediately and shows `SetPasswordForm` (`updateUser` `:148`, then `/requests`). If the email already exists, it shows "Your request is submitted!" and redirects to `/login` after 2 s (`:211-216`).

### Route guards
- There are no `beforeLoad` guards. Guarding happens on the client in `components/AppShell.tsx`:
  - If there is no user after loading, it navigates to `/login` (`AppShell.tsx:19-21`).
  - **Client-only enforcement:** `useMembership()` looks up the user's `client_members` row. If none exists (for example a staff account), it toasts "This account isn't linked to a client company. ScaleSource staff should use the Candidate Review Dashboard." and signs the user out (`:25-29`).
  - While `loading || !user || notMember`, it renders "Loading…". Children render once the user is known, **even while the membership lookup is still in flight** (see Issues).
- `/` redirects to `/requests` or `/login` (`routes/index.tsx`).
- `/login` bounces to `/requests` when already signed in (`login.tsx:49-51`).
- `/get-started` and `/reset-password` are public.

### Roles
- App-level roles come from `profiles.role` (admin, recruiter, client) and are enforced server-side by RLS and RPCs. The app never reads `profiles.role` for the current user.
- **Primary contact** (`client_members.is_primary`): sees the **Team** nav item (`AppShell.tsx:45-47`) and the "Invite colleague" button (`team.tsx:85`). The `/team` route itself is not blocked for non-primary members. They can open it and see the member list but get no invite button. The edge function presumably enforces primary status.
- Staff sender labels in chat come from `get_thread_sender_profiles` (first name plus capitalised role).

---

## 3. Routes

| Path | File | SSR | Purpose |
|---|---|---|---|
| `/` | `routes/index.tsx` | yes | Redirects to `/requests` or `/login`. |
| `/login` | `routes/login.tsx` | off | Dark plum hero ("Talent, selected for the way you work."), a three-step "How it works", and a glass sign-in card with password, magic-link and forgot modes. Links to `/get-started`. |
| `/get-started` | `routes/get-started.tsx` | off | **Public five-step new-company hiring wizard.** See section 6. |
| `/reset-password` | `routes/reset-password.tsx` | yes | Set a password from an invite or recovery link. |
| `/requests` | `routes/requests.index.tsx` | off | "My requests" list. |
| `/requests/$id` | `routes/requests.$id.tsx` | off | Request detail and presented candidates (Cards / Review / Compare). |
| `/new-request` | `routes/new-request.tsx` | off | Authenticated single-page request form with `?clone=<requestId>` prefill. |
| `/shortlisted` | `routes/shortlisted.tsx` | off | Matches with status `shortlisted`, across all requests. |
| `/interviews` | `routes/interviews.tsx` | off | Matches in interview statuses, in stage tabs. |
| `/messages` | `routes/messages.tsx` | yes | Full-page inbox with `?request=`, `?candidate=` or `?general=true` deep links. |
| `/team` | `routes/team.tsx` | yes | Company members and the invite-colleague dialog. |

### `/requests` (`requests.index.tsx`)
- Reads `client_requests` with `id,status,source,priority,engagement_type,hires_needed,created_at,job_roles(name),candidate_matches(count)`, ordered by `created_at desc` (`:51-54`). There is no `client_id` filter; RLS scopes it.
- The page polls every 20 s and on window focus or visibility change.
- Each card shows: role name, a status badge (open, needs_attention, fulfilled, closed), a "Hand-picked" badge when `source='staff_curated'`, a priority badge (high or urgent), then engagement · hires · N candidates presented · submitted date. The empty state links to `/new-request`.

### `/requests/$id` (`requests.$id.tsx`)
**Reads** (`load` `:118-201`):
- `client_requests` with `REQUEST_SELECT` (all request columns plus `job_roles(name)`) for the given id.
- `candidate_matches` with `MATCH_SELECT`, filtered by `client_request_id`. This embeds `candidate_pool_profile(...)`.
- `client_request_skills` `skills(name)` where `is_required` (the required skill names).
- `candidate_skills` `candidate_id,skills(name)` for every candidate id.
- `candidate_pool_profile` with `PROFILE_SELECT` for every candidate id (full profiles, preloaded for Review).
- Storage `candidate-photos` signed URLs (1 h TTL) for each match, **re-signed on every 20 s poll**.

**Writes and RPCs**
- `client_shortlist_candidate(p_match_id)` toggles shortlist (`:215`).
- `client_request_hire(p_match_id)` (`:215`).
- `rank_and_match(p_request_id, p_limit 6)` sits behind `SHOW_MORE_CANDIDATES_ENABLED = false`, so it is dead (`:75,230`).
- Child components call `reject_candidate_match`, `client_confirm_interview_time`, `client_propose_interview_time`, `client_rate_candidate`, `log_match_view`, `get_match_interview_slots`, `client_book_interview_slot` and `client_request_interview`.

**UI**
- A sticky request summary card shows status, priority and Hand-picked badges, the "Talk to us about this request" thread button and **Clone request** (to `/new-request?clone=id`). Below that is a details list (engagement, hours, days, hires, min experience, desired start, timezone, submitted) and the notes.
- Three candidate views:
  - Cards: `CandidateCard` grid.
  - Review: a full-profile carousel with GSAP slide and height tween (`:265-294`).
  - Compare: `CandidateCompareTable`.
- Sort order: status priority (`STATUS_ORDER` `:78-88`) then `match_score` desc. The order is captured on first load so polling never reshuffles cards (`:151-167`).
- Overlays: a profile slide-over (`CandidateProfileDialog`) and `InterviewRequestDialog`.
- Empty state: "No candidates presented yet — matching is still in progress. We'll email you when profiles are ready."

### `/new-request` (`new-request.tsx`)
See section 6.2.

### `/shortlisted` (`shortlisted.tsx`)
- Reads `candidate_matches` with `MATCH_SELECT` where `status in ('shortlisted')`, and `client_requests` `id,job_roles(name),source` (`:67-68`). It also reads required skills, candidate skills and signed photo URLs.
- Shows filter chips by request when there is more than one request.
- `CandidateCard` actions: un-shortlist (`client_shortlist_candidate`), request interview (dialog), request hire, reject.
- Polls every 20 s.

### `/interviews` (`interviews.tsx`)
**Reads**
- `candidate_matches` `MATCH_SELECT` where status is in `interview_requested`, `interview_confirmed`, `interview_completed` or `hire_requested` (`:346`).
- `client_requests` `id,job_roles(name)`.
- Required and candidate skills.
- `auth.getUser()`.
- `candidate_match_views` (`*`) for the "New" badges (`:377`).
- Signed photos.

**Writes**
- Upserts `candidate_match_views` (`profile_id,candidate_match_id,last_seen_status,last_seen_at`, onConflict `profile_id,candidate_match_id`) when a stage tab is viewed (`:435-454`).
- RPCs: `client_request_hire`, `client_confirm_interview_time`, `client_propose_interview_time`.
- **Prep notes** (`PrepNotes` `:97-232`) on the candidate-kind thread:
  - Read `threads` through `findThreadId`.
  - Read `thread_notes` and `get_thread_note_authors(p_thread_id)`.
  - Write `add_thread_note(p_thread_id,p_body)`, creating the thread first via `get_or_create_thread` if needed.

**UI**
- Tabs: Requested, Confirmed, Completed, Hire requested, each with an unseen dot.
- Staff counter-proposal: "Accept this time" or "Reject this time" with a new proposed time.
- "Join Google Meet" (`meet_url`).
- Interview notes, meeting notes text or doc, recording link.
- Star rating once `interview_completed_at` is set.
- "Request to hire".

### `/messages` (`messages.tsx`)
- Uses `useMessagesInbox()` and `ChatPane`. The inbox has three sections: General (`kind=general`, `client_id`), Requests and Candidates. Only threads with at least one message are listed, unless that thread is the selected deep link.

### `/team` (`team.tsx`)
- Reads `client_members` `profile_id,is_primary,created_at,profiles(email,full_name)` for the client (`:58-61`).
- For primary contacts, the invite dialog calls `functions.invoke("client-invite-colleague", {email, first_name, last_name, position})` (`:161`). The success toast is "Invitation sent to X".

---

## 4. Non-ui components, lib and hooks

| File | What it does | Data calls |
|---|---|---|
| `components/AppShell.tsx` | Glass pill header with nav (My Requests, Shortlisted, Interviews, New Request, Team if primary), NotificationsBell, Logout and a mobile menu. Wraps the page in `MessagesWidgetProvider` and renders the floating `MessagesWidget`. Holds the auth and membership guard. | via `useMembership`, `useAuth` |
| `components/request-fields.tsx` | Shared hiring-request form: `RequestForm` type, `emptyRequestForm`, validators, `TagInput`, `Field`, `ChoiceCards`, `RequestRoleFields`, `RequestScheduleFields`, `RequestRequirementsFields`, `RequestFields` (all three), `requestPayload()`. | none directly (uses catalog, RoleSkillSelect) |
| `components/role-skill-select.tsx` | Must-have skill combobox scoped to the role. "+ Add a skill not listed": with `localAdd` (public wizard) it creates a pending id `new:<name>`; otherwise it calls the RPC. | `rpc get_role_skills(p_role_id)` `:64`; `rpc add_or_get_skill_for_role(p_role_id,p_skill_name,p_category:'Other')` `:101` |
| `components/request-recap.tsx` | Builds and renders the "Your answers" recap (company, contact, role, schedule, requirements). | none |
| `components/multi-select.tsx` | Generic cmdk multi-select with badges (days, languages). | none |
| `components/timezone-select.tsx` | Combobox over 32 hardcoded IANA zones (US, Canada, LatAm, Europe, Africa, Asia, Sydney) with live UTC offsets. | none |
| `components/date-time-fields.tsx` | `TimePicker` (15-minute slots), `DateTimePicker` (emits `yyyy-MM-ddTHH:mm`, past dates disabled), `DatePicker` (**unused**). | none |
| `components/success-flourish.tsx` | Confetti and check-mark success animation. | none |
| `components/candidate-card.tsx` | `CandidateCard` (photo, status pill, Hand-picked, first-name heading, headline, availability, role/years/country/schedule, "Why this candidate", skill gap, rating, interview-state panels, reject form, action buttons). Also exports `MATCH_SELECT`, `MatchRow`, `PoolProfile`, `statusTone`, `MatchStatusIcon`, `availabilityLabel`, `CandidateSkillGap` (matched/missing ring). | `rpc client_confirm_interview_time` `:238`; `rpc client_propose_interview_time` `:256`; `rpc reject_candidate_match(p_match_id,p_reason,p_note)` `:274` |
| `components/candidate-compare-table.tsx` | Side-by-side table (Candidate, Headline, Availability, Timezone & schedule, Status, Summary, Skill match, Work history, Why, Actions) plus `CandidateActions`, which duplicates the card's action logic. | same three RPCs `:252,271,289` |
| `components/candidate-full-profile-view.tsx` | Full profile: header, Talk-to-us button, availability grid, why, skill gap, intro video (signed storage or YouTube/Vimeo/Loom embed), roles, skills, work history (5 at a time), education, summary and highlights. Logs a view once per match. | `rpc log_match_view(p_match_id)` `:115`; `from candidate_pool_profile` `:123` (when not preloaded); storage signed photo and video |
| `components/candidate-profile-dialog.tsx` | Right-side Sheet wrapping the full profile view (scrollable, with up/down buttons). | none |
| `components/candidate-rating.tsx` | 1-5 stars plus a note, shown only after `interview_completed_at`. | `rpc client_rate_candidate(p_match_id,p_rating,p_note)` `:38` |
| `components/interview-request-dialog.tsx` | Book a staff-published slot, or propose a time with calendar + TimePicker. | `rpc get_match_interview_slots(p_match_id)` `:59,78`; `rpc client_book_interview_slot(p_match_id,p_slot_id)` `:73`; `rpc client_request_interview(p_match_id,p_proposed_at)` `:102` |
| `components/request-messages.tsx` | Thread primitives: `findThreadId`, `createThread`, `useThread` (messages, realtime, sender profiles, unread), `useThreadPreview`, `RequestMessages`, `GeneralMessages` (**unused**), `CandidateMessages`, `ChatFeed`, `Composer`, quick actions (`reschedule_request` on confirmed-interview candidate threads; `send_portfolio` defined but never offered; legacy `call_me_asap`). | `from threads` `:72`; `rpc get_or_create_thread` `:83`; `from thread_messages` `:136,244`; **realtime** channel on `thread_messages` INSERT `:150`; `rpc get_thread_sender_profiles` `:169,195`; `rpc send_thread_message_ensuring_thread` `:411`; `rpc send_thread_message` `:438` |
| `components/messages-inbox.tsx` | `InboxSection`, `ThreadListRow`, `ChatPane` (uses `useThread` with active=true, which marks the thread read). | via `useThread` |
| `components/messages-widget.tsx` | Floating "Talk to us" launcher with unread count, wiggle and bubbles, plus a 400 px chat panel. Mounted on every AppShell page. | via `useMessagesInbox` |
| `components/notifications-bell.tsx` | Bell popover over the latest 30 notifications, polled every 20 s. Mark one or all read. | `from notifications` select `:31`; `update({read:true})` `:66` |
| `components/PdfPagePreview.tsx` | pdf.js page-1 renderer with clickable link overlays. **Unused** (dead), but it pulls `pdfjs-dist` into deps. | none |
| `lib/catalog.ts` | Constants (`SKILL_CATEGORIES` unused, `ENGAGEMENT_TYPES`, `DAYS_OF_WEEK`, `INDUSTRIES`, `POSITIONS`) and the `useCatalog()` hook. | `from job_roles` (`is_active=true`, by name) `:115`; `from skills` `:119` |
| `lib/matches.ts` | Storage bucket names (`candidate-photos`, `intro-videos`), `resolveSignedUrl` (1 h), status, rejection and priority label maps, `displayName` (first name unless hired), `firstNameOnlyAnalysis` and `privacyText` (regex surname scrubbing of free text), formatters, `toStringList`. | `storage.from(bucket).createSignedUrl` `:13` |
| `lib/membership.ts` | `useMembership()` returns `{client_id, client_name, is_primary}` and `notMember`. | `from client_members` `client_id,is_primary,clients(name)` by `profile_id` `:27-32` |
| `lib/messages-widget.tsx` | Context for widget open state and selected thread (`openGeneral` **unused**). | via `useMembership` |
| `lib/thread-reads.ts` | Module-level store of per-user last-read markers, mirrored to localStorage and the DB. Uploads local marks on first load. | `from thread_reads` `:48`; `rpc mark_thread_read(p_thread_id,p_read_at)` `:70,109` |
| `lib/motion.tsx` | `SplitWords`, `useEntrance`, `useGlare`, `useMagnetic`, `AuroraBackdrop`, `AmbientBackdrop`. All respect reduced motion. | none |
| `lib/auth.tsx` | See section 2. | auth only |
| `hooks/use-messages-inbox.ts` | Builds the General, Request and Candidate inbox rows with last message and unread state. Polls every 20 s. | `from client_requests` `:72`; `from candidate_matches` (**full MATCH_SELECT**, status not rejected) `:73`; `from threads` `:74`; `from thread_messages` (**all messages of all threads, unbounded**) `:96` |
| `hooks/use-polling-refresh.ts` | `setInterval(refetch, 20000)` plus refetch on focus and on visibility change. | none |
| `hooks/use-mobile.tsx` | `useIsMobile`. **Unused** outside shadcn `sidebar` (which is itself unused). | none |

### `src/components/ui/*` (shadcn)
47 stock files. **Customised beyond stock** (liquid-glass redesign `5b83b37`, plus `fd3f4b1` blur removal and an early `edc69eb` tweak): `button.tsx` (rounded-full, semibold, plum shadows, new outline/secondary/ghost styles), `calendar.tsx`, `card.tsx` (rounded-3xl, display-font title), `dialog.tsx`, `input.tsx`, `popover.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx` (plum overlay, pill close button), `tabs.tsx`, `textarea.tsx`. All of these are class-name-only edits. The other 36 are stock, and most are unused (accordion, carousel, chart, drawer, sidebar, menubar, etc.).

---

## 5. Every Supabase touchpoint (file:line)

### Auth
| Call | Location |
|---|---|
| `auth.getSession` | `lib/auth.tsx:25`, `routes/reset-password.tsx:62` |
| `auth.onAuthStateChange` | `lib/auth.tsx:29` |
| `auth.signInWithPassword` | `lib/auth.tsx:40` |
| `auth.signOut` | `lib/auth.tsx:44` |
| `auth.exchangeCodeForSession` | `routes/reset-password.tsx:55` |
| `auth.verifyOtp` | `routes/reset-password.tsx:57`, `routes/get-started.tsx:307` (type invite) |
| `auth.updateUser({password})` | `routes/reset-password.tsx:85`, `routes/get-started.tsx:148` |
| `auth.getUser` | `routes/interviews.tsx:122,375` |

### Tables and views (PostgREST)
| Table / view | Op | Location |
|---|---|---|
| `job_roles` | select (active) | `lib/catalog.ts:115` |
| `skills` | select | `lib/catalog.ts:119` |
| `client_members` (+`clients(name)`) | select | `lib/membership.ts:28`, `routes/new-request.tsx:69` |
| `client_members` (+`profiles(email,full_name)`) | select | `routes/team.tsx:59` |
| `client_requests` | select | `routes/requests.index.tsx:52`, `routes/requests.$id.tsx:121`, `routes/new-request.tsx:100` (clone), `routes/interviews.tsx:347`, `routes/shortlisted.tsx:68`, `hooks/use-messages-inbox.ts:72` |
| `client_requests` | **insert** | `routes/new-request.tsx:175-182` |
| `client_request_skills` | select | `routes/requests.$id.tsx:124`, `routes/new-request.tsx:107`, `routes/interviews.tsx:370`, `routes/shortlisted.tsx:94` |
| `client_request_skills` | **insert** | `routes/new-request.tsx:201` |
| `candidate_matches` (+ embedded `candidate_pool_profile`) | select | `routes/requests.$id.tsx:122`, `routes/interviews.tsx:346`, `routes/shortlisted.tsx:67`, `hooks/use-messages-inbox.ts:73` |
| `candidate_pool_profile` (view) | select | `routes/requests.$id.tsx:183`, `components/candidate-full-profile-view.tsx:123` |
| `candidate_skills` (+`skills(name)`) | select | `routes/requests.$id.tsx:143`, `routes/interviews.tsx:373`, `routes/shortlisted.tsx:97` |
| `candidate_match_views` | select / **upsert** | `routes/interviews.tsx:377` / `:445-446` |
| `notifications` | select / **update read** | `components/notifications-bell.tsx:31` / `:66` |
| `threads` | select | `components/request-messages.tsx:72`, `hooks/use-messages-inbox.ts:74` |
| `thread_messages` | select | `components/request-messages.tsx:136,244`, `hooks/use-messages-inbox.ts:96` |
| `thread_notes` | select | `routes/interviews.tsx:109` |
| `thread_reads` | select | `lib/thread-reads.ts:48` |

### RPCs
| RPC | Args | Location |
|---|---|---|
| `get_role_skills` | `p_role_id` | `components/role-skill-select.tsx:64` |
| `add_or_get_skill_for_role` | `p_role_id,p_skill_name,p_category` | `components/role-skill-select.tsx:101` |
| `rank_and_match` | `p_request_id,p_limit` | `routes/new-request.tsx:213`, `routes/requests.$id.tsx:230` (disabled) |
| `client_shortlist_candidate` | `p_match_id` | `routes/requests.$id.tsx:215`, `routes/shortlisted.tsx:166` |
| `client_request_hire` | `p_match_id` | `routes/requests.$id.tsx:215`, `routes/shortlisted.tsx:166`, `routes/interviews.tsx:467` |
| `reject_candidate_match` | `p_match_id,p_reason,p_note` | `components/candidate-card.tsx:274`, `components/candidate-compare-table.tsx:252` |
| `client_confirm_interview_time` | `p_match_id` | `components/candidate-card.tsx:238`, `components/candidate-compare-table.tsx:271`, `routes/interviews.tsx:478` |
| `client_propose_interview_time` | `p_match_id,p_proposed_at` | `components/candidate-card.tsx:256`, `components/candidate-compare-table.tsx:289`, `routes/interviews.tsx:267` |
| `client_request_interview` | `p_match_id,p_proposed_at` | `components/interview-request-dialog.tsx:102` |
| `get_match_interview_slots` | `p_match_id` | `components/interview-request-dialog.tsx:59,78` |
| `client_book_interview_slot` | `p_match_id,p_slot_id` | `components/interview-request-dialog.tsx:73` |
| `client_rate_candidate` | `p_match_id,p_rating,p_note` | `components/candidate-rating.tsx:38` |
| `log_match_view` | `p_match_id` | `components/candidate-full-profile-view.tsx:115` |
| `get_or_create_thread` | `p_client_request_id,p_candidate_match_id,p_client_id` | `components/request-messages.tsx:83` |
| `send_thread_message_ensuring_thread` | same three + `p_body,p_structured_type` | `components/request-messages.tsx:411` |
| `send_thread_message` | `p_thread_id,p_body,p_structured_type` | `components/request-messages.tsx:438` |
| `get_thread_sender_profiles` | `p_thread_id` | `components/request-messages.tsx:169,195` |
| `get_thread_note_authors` | `p_thread_id` | `routes/interviews.tsx:110` |
| `add_thread_note` | `p_thread_id,p_body` | `routes/interviews.tsx:156` |
| `mark_thread_read` | `p_thread_id,p_read_at` | `lib/thread-reads.ts:70,109` |

### Edge functions
| Function | Body | Location |
|---|---|---|
| `client-magic-link` | `{email}` | `routes/login.tsx:90` |
| `public-client-request` | `{company, contact, request}` | `routes/get-started.tsx:263` |
| `client-invite-colleague` | `{email,first_name,last_name,position}` | `routes/team.tsx:161` |

### Storage (private buckets, signed URLs with 1 h TTL)
- `candidate-photos`: `lib/matches.ts:13` via `signedPhotoUrl`. Called from `requests.$id.tsx:196`, `interviews.tsx:422`, `shortlisted.tsx:141` and `candidate-full-profile-view.tsx:130`.
- `intro-videos`: `signedVideoUrl` in `candidate-full-profile-view.tsx:130`.
- Nothing is uploaded from this app.

### Realtime
- `supabase.channel('thread-messages-<threadId>-<rand>')` on `postgres_changes` INSERT `public.thread_messages` filtered by `thread_id` (`components/request-messages.tsx:150-159`). This is the only realtime use. Everything else polls.

---

## 6. Hiring request flow (most important for the landscaping form)

There are two entry points. Both share `components/request-fields.tsx`.

### 6.1 Public wizard: `/get-started` (new company, unauthenticated)

The stepper has five stages (`get-started.tsx:64-70`): Company, Your info, Role, Schedule, Requirements. "Continue" validates per stage (`next()` `:230-253`). The final "Submit request" re-validates the whole request (`:257`).

| Stage | Field | Control | Required | State key | Written to (by `public-client-request`, service role) |
|---|---|---|---|---|---|
| 0 Company (`:390-439`) | Company name | Input | yes (`:232`) | `company.name` | `clients.name` (edge `:155-158`), only if the contact has no existing membership |
| | Industry | Select from `INDUSTRIES` (29 items) + "Other" (free text) | no | `company.industry` | `clients.industry` |
| 1 Your info (`:441-503`) | First name | Input | yes (`:237`) | `contact.first_name` | auth user metadata `full_name` and `profiles.full_name` (edge `:74,131,139`) |
| | Last name | Input | yes | `contact.last_name` | same (joined) |
| | Email | Input type=email (**only checked non-empty**, `:241`) | yes | `contact.email` (lowercased) | `auth.users` via `generateLink(invite)`; `profiles` matched by email |
| | Position | Select from `POSITIONS` (21 items) + "Other" | no | `contact.position` | `client_members.client_position` (edge `:163-168`, with `is_primary=true`) |
| 2 Role (`RequestRoleFields`, `request-fields.tsx:303-331`) | Role | `ChoiceCards` from `job_roles` (active), 3 shown then "See more" | yes (`:63`) | `role_id` | `client_requests.role_id` |
| | Engagement type | ChoiceCards: Full-time / Part-time / Project (`catalog.ts:21-25`) | yes (`:64`) | `engagement_type` | `client_requests.engagement_type` (enum `engagement_type`) |
| | How many hires | number, min 1 (default "1") | yes (`:65`) | `hires_needed` | `client_requests.hires_needed` |
| 3 Schedule (`RequestScheduleFields`, `:334-379`) | Hours needed | free text, e.g. "40 hours per week" | yes (`:70`) | `hours_needed` | `client_requests.hours_needed` (text) |
| | Days of the week needed | MultiSelect Mon-Sun | yes, at least 1 (`:71`) | `days_of_week_needed` | `client_requests.days_of_week_needed` (text[]) |
| | Timezone | `TimezoneSelect` (32 zones) | no | `timezone_requirement` | `client_requests.timezone_requirement` |
| | Desired start date | Popover Calendar (past dates allowed) | no | `desired_start_date` (yyyy-MM-dd) | `client_requests.desired_start_date` |
| 4 Requirements (`RequestRequirementsFields`, `:389-420`) | Must-have skills | `RoleSkillSelect` scoped to the role (`get_role_skills`, a public RPC); "+ Add a skill not listed" creates pending `new:<name>` ids (`localAdd`) | yes, at least 1 (`:76`) | `must_have_skill_ids` / `must_have_skill_names` | `client_request_skills (is_required=true)`. Unlisted names are resolved or created server-side via `add_or_get_skill_for_role(role,name,'Other')`, which also **tags them onto the role** (edge `:102-114`) |
| | Required languages | MultiSelect over `skills.category='Languages'` (English first) | yes, at least 1 (`:77`) | `language_skill_ids` | sent as `required_skill_ids`, then `client_request_skills (is_required=true)` |
| | Minimum years of experience | number, min 0 | no | `years_experience_min` | `client_requests.years_experience_min` |
| | Notes | Textarea | no | `notes` | `client_requests.notes` |

Payload (`get-started.tsx:263-284`):
```
{ company:{name, industry|null},
  contact:{first_name,last_name,email(lowercased),position|null},
  request:{ ...requestPayload(f),            // role_id, engagement_type, hours_needed, days_of_week_needed,
                                             // timezone_requirement|null, hires_needed(num,≥1), years_experience_min|null,
                                             // desired_start_date|null, must_have_skill_names, notes|null
            must_have_skill_ids: ids without "new:" prefix,
            must_have_skill_names: names from "new:" ids (overrides requestPayload's value),
            required_skill_ids: language_skill_ids } }
```
The edge function also accepts `nice_to_have_skill_ids` (written as `is_required=false`), but no UI sends it.

What the edge function does, in order (`public-client-request/index.ts`):
1. Validates the same required fields server-side.
2. Resolves new skill names.
3. Looks up `profiles` by email:
   - If it is staff, returns 409.
   - If it exists, reuses it.
   - Otherwise calls `generateLink(invite, redirectTo CLIENT_APP_URL/reset-password)` and sets `profiles.role='client'`.
4. Reuses the existing `client_members.client_id` if there is one. Otherwise inserts into `clients` and `client_members(is_primary)`.
5. Inserts into `client_requests` (`created_by` = contact).
6. Inserts into `client_request_skills`.
7. Calls `rank_and_match(request, 6)` on a best-effort basis.
8. Returns `{ok, invited, invite_token, client_id, request_id}`.

The client then either opens a session with the invite token and shows `SetPasswordForm`, or shows the recap and "Redirecting you to sign in…".

`client_requests` columns that are **not** set by either form: `title`, `candidates_wanted` (default 4), `status` (default open), `priority`, `source`, `rejection_count`.

### 6.2 Authenticated form: `/new-request`
- Company comes from the user's `client_members` row (`new-request.tsx:64-90`) and is shown read-only.
- It is a single card, `RequestFields` with `roleScopedSkills` and **without** `localAdd`. Unlisted skills are therefore created immediately via the `add_or_get_skill_for_role` RPC as the user.
- Submit (`:162-222`):
  1. `client_requests.insert({client_id, created_by:user.id, ...requestPayload minus must_have_skill_names})`
  2. `client_request_skills.insert(must_have_skill_ids ∪ language_skill_ids, is_required:true)`
  3. fire-and-forget `rpc rank_and_match(requestId, 6)`
  4. Success card with recap and a "View request" button.
- Clone (`?clone=id`, `:94-160`) prefills every field except `desired_start_date`. It reads `client_requests` and `client_request_skills`, then splits language and non-language skills by catalog category.

### 6.3 Adapting this for a ScaleSource Local (landscaping) hiring request
- The structure is reusable: stepper, `Field`, `ChoiceCards`, `MultiSelect`, `RoleSkillSelect`, recap and success flourish.
- Data dependencies to swap or re-seed:
  - `job_roles` (role cards come straight from the DB).
  - `skills` per role (`role_skills` via `get_role_skills`).
  - The `Languages` category, which is mandatory today.
  - The engagement types. They are a DB enum, so W-2 / 1099 / subcontractor / seasonal needs a migration or a new column.
- Fields that map poorly to landscaping (see section 7): timezone, languages required, "hours needed" free text, years-of-experience-only. Missing landscaping essentials: service area / ZIP, driver's licence or CDL, own transport and tools, crew size, pay range, season dates, certifications (pesticide applicator, irrigation, ISA arborist), physical requirements, worker type (W-2 / 1099 / sub), insurance for subs.
- The write path today is a single privileged edge function. A landscaping version should keep that pattern (server-side writes) but fix the auth and abuse issues in section 8.

---

## 7. Vertical-specific wording and assumptions to change for a landscaping client

**Explicit VetPod or veterinary references in this repo: none.** No string matches vet, VetPod, clinic, animal, pet, patient or DVM in `src`. The app was already genericised for "ScaleSource". The heritage is visible only in:
- `lib/catalog.ts:79`: `"Practice Manager"` in `POSITIONS`, a vet/dental-practice title.
- Outside the repo, edge function `public-client-request/index.ts:143` comments "mirrors **clinic-request**'s dedupe logic". `admin-create-client`, `client-invite-colleague` and two migrations also contain "clinic" or "veterin" text.

What actually needs changing is the **remote / offshore virtual-assistant staffing model** baked into copy, fields and data:

| # | Location | Current | Why it matters for landscaping |
|---|---|---|---|
| 1 | `components/request-fields.tsx:345-347`, `timezone-select.tsx:15-48` | "Timezone — The timezone your team works in — we match candidates who can overlap with it"; zones include Lagos, Manila, Kolkata, Dubai | Local, on-site crews. Replace with service area / ZIP or radius. |
| 2 | `request-fields.tsx:409-411`, `:77`; `catalog.ts:19`; edge fn `:94` | "Required languages" mandatory | Should be optional (for example English or Spanish), and the server-side requirement removed. |
| 3 | `request-fields.tsx:339-340` | "Hours needed — e.g. 40 hours/week, or 20–25 hours across mornings" | Use crew schedule, season dates, overtime expectations. |
| 4 | `catalog.ts:21-25` | Engagement: Full-time / Part-time / Project | Needs W-2, 1099 / part-time, subcontractor and seasonal (DB enum `engagement_type`). |
| 5 | `catalog.ts:18` | `SKILL_CATEGORIES = Software, Customer Service, Languages` | Needs landscaping categories (equipment, irrigation, hardscape, tree, fertilisation, licences). |
| 6 | `request-fields.tsx:405-406` | "e.g. Excel, QuickBooks, cold calling" (TagInput hint, a dead path) | Office/VA examples. |
| 7 | `catalog.ts:37-67` | `INDUSTRIES` has no Landscaping, Lawn care or Grounds maintenance | Add these, or drop the field for a single-vertical product. |
| 8 | `catalog.ts:69-91` | `POSITIONS` includes Practice Manager, Executive Assistant, CFO, Talent Acquisition… | Use Owner, Operations / Branch / Account / Crew manager, etc. |
| 9 | `components/candidate-card.tsx:309-316,373-384`; `candidate-compare-table.tsx:115-125`; `candidate-full-profile-view.tsx:182-184` | Candidate shows country, timezone, weekly hours available, preferred shift | Show home area / distance, transport, licence, equipment experience. |
| 10 | `candidate-card.tsx:476-481` "Join Meet"; `interviews.tsx:549` "Join Google Meet"; `interview-request-dialog.tsx` | Video interviews only | Landscaping often needs in-person or working interviews (location, address). |
| 11 | `candidate-full-profile-view.tsx:192` | "Introductory Video" section | Optional for field crews. |
| 12 | `lib/matches.ts:46`; `candidate-card.tsx:523,532`; `interviews.tsx:637` | "Contract sent", "waiting on ScaleSource to send the contract" | W-2 hires are offers or onboarding, not contracts. Copy depends on the model. |
| 13 | `lib/matches.ts:51-56` | Rejection reasons: skill_mismatch, availability_conflict, culture_fit, other (DB enum) | Consider adding location/commute, licence or transport, pay. |
| 14 | `routes/login.tsx:121-142` | Hero "Candidate Pool / Talent, selected for the way you work. / Every person on your shortlist has been screened, interviewed and assessed by the ScaleSource team…" + steps | Rebrand as ScaleSource Local. |
| 15 | `routes/login.tsx:113`, `:259`; `__root.tsx:82-86`; every route `head()` title "— Candidate Pool" | Product name "Candidate Pool" and "Review and hire matched candidates with ScaleSource" | Rename. |
| 16 | `routes/get-started.tsx:47-58, 368-374, 392-394, 444-445, 507-508, 517, 520` | "Get started", "Five focused steps and we'll start matching candidates for you", "Who are we hiring for?", "What kind of person are you looking to hire?" | Mostly fine. Adjust step names for new fields. |
| 17 | `components/AppShell.tsx:27` | "…ScaleSource staff should use the Candidate Review Dashboard." | Staff-app name. |
| 18 | `components/request-messages.tsx:337` | "No messages yet — say hello to your recruiter." | Fine, or "your ScaleSource Local team". |
| 19 | `assets/scalesource-logo-white.png.asset.json`, `public/favicon.svg`, `styles.css:59+` palette, `__root.tsx:94` fonts | ScaleSource plum and gold brand | Swap for the jobs.scalesource.com / ScaleSource Local brand if different. |
| 20 | Edge fn `public-client-request/index.ts:45-48` | `CLIENT_APP_URL` default `https://candidatepool.scalesource.com` | New domain for a Local deployment. |

Count: 2 true vet-heritage items (1 in repo, 1 in the edge function) and about 20 remote-VA or brand assumptions.

---

## 8. Bugs, dead code, risks and security concerns

### Security (highest first)
1. **Unauthenticated account creation and session without email ownership** (`get-started.tsx:304-314`, edge `public-client-request:127-138,209-212`). For any unregistered email, the anonymous caller receives the invite `hashed_token` and immediately gets a session and sets a password. Anyone can claim `ceo@somecompany.com` without access to that inbox. A landscaping version should send the invite by email instead of returning the token, or verify by OTP first.
2. **Anyone can attach requests to an existing client company** by entering any existing client member's email. The edge function reuses that member's `client_id` (edge `:120-153`) and inserts a request with `created_by` set to that member. The UI says "Your request is submitted!". There is no captcha, rate limit or origin check (CORS `*`).
3. **Anonymous catalogue pollution.** New must-have skill names are created and tagged onto the role through the service role (edge `:102-114`), so arbitrary text ends up in every future visitor's dropdown for that role.
4. **The first-name-only privacy rule is client-side only.** `candidate_pool_profile.full_name`, headline, summary, work history and match reason are fetched in full (`MATCH_SELECT`, `PROFILE_SELECT`). Surnames are hidden only at render time by regex (`lib/matches.ts:107-224`), so they are visible in devtools and the network tab. If surnames must be hidden before hire, the view or RLS must do it.
5. **Guard race for non-client accounts.** `AppShell` renders children as soon as `user` is set, while `useMembership` is still loading (`AppShell.tsx:31`). Page queries fire with the staff account's broader RLS before the sign-out. Every list query relies purely on RLS: there is no `client_id` filter on `client_requests` or `candidate_matches` selects (`requests.index.tsx:52`, `interviews.tsx:346-347`, `shortlisted.tsx:67-68`, `use-messages-inbox.ts:72-74`).
6. The Supabase URL and anon key are hardcoded (`lib/supabase.ts:3-5`). The anon key is public by design, but there is no environment separation, and dev runs against production (README).
7. `notifications` is updated directly from the client (`notifications-bell.tsx:66`). This is safe only if RLS restricts updates to `read` on the user's own rows.
8. `/team` is not route-guarded for non-primary members (UI hides only the nav and the button). Invite authority must be enforced in `client-invite-colleague`.

### Correctness bugs
- **Non-atomic authenticated create** (`new-request.tsx:174-207`). If the skills insert fails, the request exists without skills, the user is navigated to it, and `rank_and_match` never runs. `rank_and_match` is called from the browser as fire-and-forget, so if the tab closes the request has no matches.
- Email in `/get-started` is only checked for non-empty (`get-started.tsx:241`). The `type=email` input is not enforced because the form uses manual `next()`.
- Years of experience equal to 0 is dropped on clone (`new-request.tsx:153`) and hidden in the detail (`requests.$id.tsx:417`) because of truthiness checks.
- In the full profile view, `summary` and `highlights` are always scrubbed even when hired (`candidate-full-profile-view.tsx:156-157`), and so is the Compare "Summary" row (`candidate-compare-table.tsx:141`). This is inconsistent with `privacyText`.
- The `/requests/$id` with an unknown or unauthorised id shows a blank "Hiring request" card with no not-found state.
- The `CandidateFullProfileView` effect omits `matchId` and `preloadedPhotoUrl` from its deps (`:138`).
- Duplicate SVG gradient id `skill-ring` across every card (`candidate-card.tsx:732`).
- `reset-password` ignores `verifyOtp` and `exchangeCodeForSession` errors (it falls through to `getSession`). This works, but failure reasons are lost.
- If an invited wizard user abandons before setting a password, the account exists without one. Recovery is the magic link only.

### Performance and scaling
- Every AppShell page mounts `MessagesWidget`, and `useMessagesInbox` polls every 20 s and on every focus. Each poll loads all requests, **all non-rejected matches with the full MATCH_SELECT and embedded profile**, all threads, and **every message of every thread** (unbounded, `use-messages-inbox.ts:95-99`). `/messages` mounts a second copy.
- `/requests/$id` re-fetches full profiles and candidate skills and **re-signs every photo URL every 20 s** (`:182-199`). `/interviews` and `/shortlisted` also re-sign every poll.
- `useMembership` runs independently in AppShell, MessagesWidgetProvider, each `useMessagesInbox` and `/team`, which duplicates queries. React Query is installed but unused.

### Dead or duplicated code
- Dead: `components/PdfPagePreview.tsx` (and the `pdfjs-dist` dependency), `hooks/use-mobile.tsx`, `DatePicker` (`date-time-fields.tsx:203`), `GeneralMessages` (`request-messages.tsx:295`), `openGeneral` (`lib/messages-widget.tsx:28`), `SKILL_CATEGORIES` and `nonLanguageSkills` (`catalog.ts`), the `TagInput` branch (`roleScopedSkills` is always true), `showMoreCandidates` / `SHOW_MORE_CANDIDATES_ENABLED=false` (`requests.$id.tsx:75,226`), `send_portfolio` action (never offered), `void stageStatus` (`interviews.tsx:453`), the unused `matchStatus` prop of `CandidateMessages`, and the React Query provider. About 36 unused shadcn components, plus deps such as recharts, embla, vaul, react-resizable-panels, input-otp and react-hook-form/zod (no forms use them).
- Duplicated: reject / accept-time / propose-time logic in three places (`candidate-card.tsx:236-289`, `candidate-compare-table.tsx:249-302`, `interviews.tsx:254-323`). The required-skill and candidate-skill map building is copy-pasted in requests/$id, interviews and shortlisted.

---

## 9. `redesign/liquid-glass` branch vs `main`

- `git diff --stat main origin/redesign/liquid-glass` is **empty**. `origin/redesign/liquid-glass` points at the same commit as `main` (`d94f646`), and `main..branch` and `branch..main` are both empty. The branch is fully merged (fast-forwarded) and holds nothing extra.
- The redesign itself landed on main as `5b83b37` "Redesign Candidate Pool UI in the liquid-glass style" (2026-10-02, Lola Joseph with Claude). It touched 39 files (+1513/-629). The commit describes it as visual only, with the same data, permissions and workflows. It covered Cormorant + Montserrat, plum/gold/stone tokens, glass surfaces, a new sign-in page with forgot-password and how-it-works, a glass header and mobile menu, the Cards/Review/Compare views, a profile slide-over, styled date/time pickers, an animated bell and "Talk to us" launcher, and GSAP motion respecting reduced motion.
- Follow-ups on main through 2026-10-07:
  - `818cf56`: DatePicker.
  - `fd3f4b1`: removed blur from dialogs.
  - `54eb635`: forgot password sends the magic link.
  - `db0257d`, `cc760ea`, `b6c82c3`, `24bb240`: sign-in and Get-started backdrop polish.
  - `4b1a663`: logic fixes.
  - `6636e33`: `ssr:false` on animated pages to stop React #419.
  - `b2d7c65`: `thread_reads` in the DB.
  - `968285e`: interview slot booking, plus "client-only sign-in" (the staff sign-out guard).
  - `d94f646`: README sync note.
- Recent history (`git log --oneline | head -30`): `d94f646`, `968285e`, `b2d7c65`, `6636e33`, `4b1a663`, `24bb240`, `b6c82c3`, `cc760ea`, `db0257d`, `54eb635`, `fd3f4b1`, `818cf56`, `5b83b37`, `7607c48` (README, Lovable), then Lovable bot commits (`208e2c3` "Added unseen stage indicator", many "Changes", `3179eae` "Added request priority badges", etc.).
