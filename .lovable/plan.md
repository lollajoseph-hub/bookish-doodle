# Investigation: Admin Tools vs "QA Tools" — overlap analysis

## 1) Admin Tools page

- **File:** `src/routes/admin-tools.tsx`
- **Route:** `/admin-tools` (SSR off). Nav entry in `src/components/app-shell.tsx:79` (`adminOnly: true`).
- **UI label:** Header "Admin Tools" → section "Candidate interventions" (plus a second section "Clinic rematch").
- **Role gating:** Client-side only. `useAuth()` → if `profile?.role !== "admin"` renders an "Access restricted" panel. No dev/env flag; visible on every environment for admins.

### Candidate action buttons (per selected candidate)

All go through Supabase RPCs on `supabase.rpc(...)`:

| Button | RPC / call |
|---|---|
| Unlock Roleplay | `admin_unlock_roleplay(p_candidate, p_course)` |
| Force Final Completion | `admin_force_final_complete(p_candidate, p_course)` |
| Force Roleplay Completion | `admin_force_roleplay_complete(p_candidate, p_course)` |
| Reset Roleplay Attempts | `admin_reset_roleplay(p_candidate, p_course)` |
| Reset Assessment Attempts | `admin_reset_assessments(p_candidate, p_course)` |
| Regenerate Certificate | reads `certificates` (latest by candidate), then `regenerate_certificate(p_certificate, p_new_number:false)` |
| Resend Invitation | `supabase.functions.invoke("resend-invitation", { candidate_id })` (edge function) |

### Clinic rematch section
- List loader: `admin_rematch_targets()` RPC.
- Rematch button: `rematch_request(p_request)` RPC.

---

## 2) "QA Testing Tools" card in candidate detail

- **File:** `src/components/workspace/qa-tools-card.tsx`, mounted from `src/routes/candidates.$candidateId.tsx:473` (`<QaToolsCard candidate={c} onRefresh={refreshAll} />`).
- **Route:** `/candidates/$candidateId` (candidate workspace / pool detail view).
- **UI label:** Section titled **"QA Testing Tools"** with subtitle **"Temporary Admin QA Tools"** and an amber warning "These controls exist only for testing before the Admin Portal is completed." Styled as a dashed amber box.
- **Role gating:** Client-side only. `if (profile?.role !== "admin") return null;` — hidden for non-admins. No env/dev flag; ships in every build. Some buttons further require a "test candidate" (email ends `@test.vetpod` or name starts `[TEST]`).

### Buttons and what they call

Handlers live in `src/lib/queries.ts` (block titled "TEMPORARY QA TOOLS (admin-only; remove once Admin Portal ships)", lines ~1558–1711). All are direct table/storage writes from the browser using the user-session `supabase` client — **no RPCs**:

| Button | Underlying action |
|---|---|
| Prepare Test Candidate | `prepareCandidateForRoleplayTesting(candidateId, courseId)` — reads `course_modules`, `lessons`, upserts `lesson_progress` (completed=true for all published lessons), reads `module_assessments`, inserts a passed row into `candidate_assessment_attempts` for each required assessment. Restricted to test candidates. |
| Reset Roleplay Attempts | `clearRoleplaySessions(candidateId, { includeAudio: false })` → `DELETE FROM roleplay_sessions WHERE candidate_id = ...` |
| Clear Existing Roleplay Sessions | `clearRoleplaySessions(candidateId, { includeAudio: true })` → also lists `candidate_files WHERE file_type='roleplay_audio'`, deletes objects from storage bucket `roleplay-audio`, deletes matching `candidate_files` rows, then deletes `roleplay_sessions` rows |
| Reset Entire Roleplay Environment | Same call as above: `clearRoleplaySessions(candidateId, { includeAudio: true })` (duplicate of prior button) |
| Refresh Candidate Progress | No DB write; invalidates react-query keys for the workspace |

Plus a "Ready for Testing" checklist that reads `course_progress(p_candidate,p_course)` RPC + a `roleplay_sessions` count (via `fetchQaReadiness`).

---

## Overlap analysis

- **Different code paths.** Admin Tools calls dedicated `admin_*` SECURITY DEFINER RPCs (`admin_unlock_roleplay`, `admin_reset_roleplay`, `admin_force_*`, `admin_reset_assessments`). QA Tools bypasses those and writes directly to base tables (`lesson_progress`, `candidate_assessment_attempts`, `roleplay_sessions`, `candidate_files`) plus the storage bucket. There is **no shared RPC** between the two surfaces.
- **Functional overlap exists** for reset-roleplay: Admin Tools' "Reset Roleplay Attempts" (`admin_reset_roleplay` RPC — presumably resets attempt counters on the enrollment) vs QA Tools' "Reset Roleplay Attempts" (raw `DELETE FROM roleplay_sessions`). Similar name, different semantics/blast radius (QA one also nukes audio when the audio variant is used).
- **Within QA Tools itself there is a duplicate:** "Clear Existing Roleplay Sessions" and "Reset Entire Roleplay Environment" invoke the identical `clearRoleplaySessions(..., includeAudio: true)` call.
- No overlap for: force final/roleplay completion, reset assessments, regenerate certificate, resend invitation, clinic rematch — those live only on Admin Tools.

## Is the QA card a leftover or a real feature?

Signals that it is an **intentional-but-temporary dev/QA utility**, not a polished production feature:
- Section subtitle literally says "Temporary Admin QA Tools" with an amber `AlertTriangle`: "These controls exist only for testing before the Admin Portal is completed."
- Code comment in `src/lib/queries.ts:1558-1560`: `TEMPORARY QA TOOLS (admin-only; remove once Admin Portal ships)`.
- "Prepare Test Candidate" is guarded to only run for candidates whose email ends in `@test.vetpod` or whose name starts with `[TEST]`.
- Two of the four destructive buttons do the exact same thing.
- It performs privileged mutations directly from the browser rather than through vetted RPCs, which is the pattern the Admin Tools page uses.

However it is **not behind any env / feature flag** — it is shipped to every environment (including production) as long as the viewer is an admin. So it is functionally live in prod, but positioned in code and copy as scaffolding to be removed once Admin Tools/the Admin Portal covers the same ground.

## Files referenced
- `src/routes/admin-tools.tsx`
- `src/components/app-shell.tsx` (nav gating, `adminOnly: true`)
- `src/routes/candidates.$candidateId.tsx` (mounts `<QaToolsCard />`)
- `src/components/workspace/qa-tools-card.tsx`
- `src/lib/queries.ts` (`prepareCandidateForRoleplayTesting`, `clearRoleplaySessions`, `fetchQaReadiness`)
