# Vault and secrets (names only, no values)

Captured 2026-10-14 from project `kjpozzjeddvctcabtnzg`. No secret values were read or written to this backup.

## Supabase Vault (`vault.secrets`) - 4 secrets

| Name | Description | Created | Updated | Used by |
|---|---|---|---|---|
| `calendar_hook_secret` | (none) | 2026-09-18 | 2026-09-18 | `tg_calendar_sync` trigger -> `calendar-sync` edge function (header `x-calendar-hook-secret`), checked by `verify_calendar_hook()` |
| `meeting_capture_hook_secret` | Auth token for capture-meeting-notes edge function | 2026-09-25 | 2026-09-25 (rotated ~20 s after creation from the placeholder) | cron job `capture-meeting-notes-30min` -> `capture-meeting-notes` (header `x-meeting-capture-hook-secret`), checked by `verify_meeting_capture_hook()` |
| `notification_hook_secret` | Shared secret for notifications -> send-notification-email edge function hook (matches NOTIFICATION_HOOK_SECRET env var) | 2026-09-21 | 2026-09-21 | `notify_email_on_notification` trigger -> `send-notification-email` (header `x-hook-secret`) |
| `resume_hook_secret` | Shared secret for process-resume edge function hook auth | 2026-09-17 | 2026-09-17 | resume triggers -> `process-resume`, and `tg_generate_match_reason` -> `generate-match-reason` (header `x-resume-hook-secret`), checked by `verify_resume_hook()` |

On restore, recreate these with `select vault.create_secret('<value>', '<name>', '<description>');`
using the values from your password manager (or generate new ones and update the matching Edge
Function secret where one exists).

**Rotation advice:** the literal values of `calendar_hook_secret` and `notification_hook_secret`
appear in plain text in the migration history (`supabase_migrations.schema_migrations`, migrations
`20260918202225_calendar_sync_port`, `20260916183744_016_notification_email_pipeline` and
`20260921185107_move_notification_hook_secret_to_vault`). They are redacted in this backup's copies,
but anyone with SQL access to the live project can read them. Rotate both (Vault value and, for the
notification hook, the `NOTIFICATION_HOOK_SECRET` Edge Function secret together).

## Edge Function secrets - must be re-entered manually

Edge Function secrets cannot be read back through the API/MCP. Names referenced in the function source:

| Secret | Used by |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | all functions (provided automatically by Supabase) |
| `RESEND_API_KEY` | send-notification-email, calendar-sync, client-magic-link |
| `NOTIFICATION_HOOK_SECRET` | send-notification-email (must equal Vault `notification_hook_secret`) |
| `GROQ_API_KEY` | process-resume, generate-match-reason |
| `GROQ_RESUME_MODEL` (optional, default `openai/gpt-oss-120b`) | process-resume, generate-match-reason |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` | calendar-sync, capture-meeting-notes (Google account interviewschedule@scalesource.com) |
| `GOOGLE_CALENDAR_ID` (optional, default `primary`) | calendar-sync |
| `STAFF_APP_URL` (optional; falls back to a lovable.app preview URL) | admin-create-staff, admin-resend-staff-invite |
| `CLIENT_APP_URL` (optional; falls back to https://candidatepool.scalesource.com, or a lovable.app preview URL in client-magic-link) | admin-create-client, admin-create-client-with-request, admin-send-pending-client-invite, client-invite-colleague, public-client-request, client-magic-link |

Note: the hook-secret functions (process-resume, calendar-sync, capture-meeting-notes,
generate-match-reason) verify their header against **Vault** via RPC, not against an env var.

Also re-create outside the database: Auth settings (SMTP/Resend sender, redirect URLs, email
templates), and the Google OAuth client / refresh token.
