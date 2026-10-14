# Supabase backup: Candidate Pool Review System

- Project: `kjpozzjeddvctcabtnzg` ("Candidate Pool Review System")
- Captured: 2026-10-14, read-only (SELECT queries + Supabase MCP read tools only; nothing was changed or deployed)
- Method: Supabase MCP (`list_edge_functions`, `get_edge_function`, `list_migrations`, `list_extensions`, `execute_sql`)

## What is in this folder

| Path | Contents | Count |
|---|---|---|
| `edge-functions/<slug>/index.ts` | Exact deployed source of every Edge Function (each has a single `index.ts`) | 19 functions |
| `edge-functions/_index.json` | slug, version, verify_jwt per function | 19 |
| `migrations/<version>_<name>.sql` | Full SQL of every applied migration from `supabase_migrations.schema_migrations` | 114 / 114 |
| `schema/migrations.json` | `list_migrations` output | 114 |
| `schema/tables.sql` | CREATE TABLE (columns, defaults, NOT NULL, PK/UNIQUE/CHECK/FK) + 37 non-constraint indexes | 30 tables |
| `schema/types.sql` | Enum types (no domains/composites exist) | 10 enums |
| `schema/functions.sql` | `pg_get_functiondef` for every public function + EXECUTE grants | 70 functions |
| `schema/triggers.sql` | `pg_get_triggerdef` for all non-internal triggers | 32 public + 1 on auth.users |
| `schema/views.sql` | `candidate_pool_profile` view | 1 view, 0 matviews |
| `schema/rls.sql` | RLS enable state + every policy | 30 tables RLS on, 91 policies |
| `schema/grants.sql` | Table grants for anon/authenticated/service_role, schema USAGE, default privileges | - |
| `schema/storage.sql` | Buckets + storage.objects policies | 5 buckets, 7 policies |
| `schema/cron.sql` | pg_cron jobs + pg_net usage notes | 2 jobs |
| `schema/extensions.json` | Installed extensions | 7 |
| `data/*.json` | job_roles (9), skills (250), role_skills (12), profiles (2), auth-users (2; id/email/created_at/last_sign_in_at only), row-counts | - |
| `vault-and-secrets.md` | Vault secret NAMES and Edge Function secret NAMES (no values) | 4 Vault secrets |

Only the `public` schema holds application objects; there is no `private` schema.
All transactional tables (candidates, clients, requests, matches, threads, notifications, ...) are
**empty** (wiped by the 2026-10-06 clean-slate migration), so the data export covers everything
that currently has rows.

## Redactions / deviations from "verbatim"

- `migrations/20260916183744_016_notification_email_pipeline.sql`, `20260918202225_calendar_sync_port.sql`
  and `20260921185107_move_notification_hook_secret_to_vault.sql` contained hook-secret literals.
  Those literals are replaced with `<REDACTED>` (a note at the top of each file says so). Everything else
  in `migrations/` is byte-for-byte the stored statement text.
- `functions.sql`: `tg_calendar_sync` is stored in the DB with CRLF line endings; normalised to LF.

## Not captured / gaps

- **Storage file contents** are not backed up (only bucket definitions + policies). At capture time only
  `brand-assets` has objects (3 files, e.g. the ScaleSource logo used in emails); every other bucket is empty.
- **Edge Function secret values** and **Vault secret values** (by design). See `vault-and-secrets.md`.
- **Auth configuration** (SMTP/Resend sender, site/redirect URLs, email templates, providers) and project
  settings are not reachable via SQL; re-create from the dashboard.
- This is a reconstructed schema, not a `pg_dump`. `tables.sql` is in alphabetical order (create types first,
  and add FKs after tables if replaying). Function/trigger names are unqualified (`search_path = public`).
- One query failed on first try (`operator is not unique: text || "char"` when reading `pg_default_acl`);
  it was fixed with a cast and re-run successfully. No other failures.

## Drift between migrations and the live database

- `tg_calendar_sync()` in the live DB checks `client_event_id/candidate_event_id`, but the last migration
  that defines it (`20260918202225_calendar_sync_port`) still checks `google_event_id`. It was changed outside
  the migration history. `schema/functions.sql` has the live version.
- `auth.users` contains `gui@scalesource.com` (admin, created 2026-10-07 18:01) even though migration
  `20261007175809_delete_mistaken_recruiter_gui` deleted that address 3 minutes earlier: the account was re-invited
  afterwards as an admin.

## Security observations (no changes made)

1. **Anon-executable SECURITY DEFINER RPCs with no auth check** (default Supabase function grants were never
   revoked after these were (re)created):
   - `get_pending_meeting_captures(interval)` - anyone with the anon key can read candidate names, client names
     and primary client emails for recent interviews. Should be service_role only.
   - `apply_calendar_event(uuid,text,text,text)` - the 4-arg version recreated in migration 20260924181610 lost the
     earlier revoke; anon can overwrite `meet_url`/event ids on any match (needs the match UUID).
   - `apply_meeting_capture(...)` - anon can write notes/recording URLs onto any match (needs the UUID).
   - `_compute_match_score`, `handle_candidate_role_insert`, `tg_*` trigger functions and `verify_*_hook` are also
     executable by anon (low impact, but should be revoked).
   Other anon-executable RPCs (`client_*`, `confirm_interview`, `send_thread_message`, ...) do check
   `is_staff()`/membership internally, so they fail safely for anon.
2. **Hook secrets in migration history**: `calendar_hook_secret` and `notification_hook_secret` values are readable in
   `supabase_migrations.schema_migrations`. Rotate them.
3. **Debug/test Edge Functions still deployed** (all now stubs returning HTTP 410): `debug-gen-link`,
   `generate-recovery-link`, `check-logo-url`, `fix-logo-filename`, `verify-auto-match` (verify_jwt=false) and
   `qa-generate-test-link` (verify_jwt=true). Safe today, but should be deleted from the dashboard.
4. **verify_jwt=false on live functions**: `send-notification-email`, `process-resume`, `calendar-sync`,
   `capture-meeting-notes`, `generate-match-reason` (protected by Vault hook secrets) and `public-client-request`,
   `client-magic-link` (intentionally public: unauthenticated intake that creates companies/requests, and magic-link
   login). `public-client-request` has no rate limiting/captcha and creates auth users + companies from anonymous input.
5. All 30 tables grant full privileges to `anon`; protection relies entirely on RLS (which is enabled everywhere).
   `skills` is world-readable (`using (true)`), `job_roles` readable when active - intended.
6. `client-magic-link` falls back to a `lovable.app` preview URL if `CLIENT_APP_URL` is unset; staff invite functions
   fall back to a lovable.app preview URL if `STAFF_APP_URL` is unset. Make sure both env vars are set.
