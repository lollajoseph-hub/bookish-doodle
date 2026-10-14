# Backup: Candidate Pool system before the ScaleSource Local conversion (2026-10-14)

Snapshot taken before any changes were made to turn this system into the ScaleSource Local bench app.

## What's here

| Folder | Source | State |
|---|---|---|
| `candidate-pool/` | Lovable "Candidate Pool" (client app), repo `lollajoseph-hub/vetpod-clinic-connect` | `main` at `d94f646` (2026-10-07) |
| `staff-dashboard/` | Lovable "Candidate Review Dashboard" (staff app), repo `lollajoseph-hub/vetflow-staff-compass` | `main` at `029c1b9` (2026-10-07) |
| `supabase/` | Supabase project `kjpozzjeddvctcabtnzg` ("Candidate Pool Review System", eu-central-1) | Read-only dump: 114 migrations, full schema (30 tables, 70 functions, 91 RLS policies, triggers, views, grants, storage, cron), 19 Edge Functions, reference data. See `supabase/README.md` |
| `docs/` | Architecture write-ups of both front ends | |

## Full git history

Each app's complete history is kept on its own branch:

- `candidate-pool/main`, `candidate-pool/redesign-liquid-glass`
- `staff-dashboard/main`, `staff-dashboard/redesign-liquid-glass`

## Not included

- Secret values (Edge Function secrets, Vault secrets, hook secrets in three migrations are `<REDACTED>`). Names are listed in `supabase/vault-and-secrets.md`.
- Files stored in Supabase Storage (only `brand-assets` had any: 3 logo files).
- Supabase Auth / dashboard settings (email templates, redirect URLs, SMTP).
- Candidate/client data: all operational tables were empty at backup time (wiped 2026-10-06).

## Restoring

- **Front end:** check out the matching history branch and push it to the Lovable-connected repo's `main`.
- **Database:** run `supabase/migrations/*.sql` in version order on a fresh project (re-enter the redacted secrets), then deploy `supabase/edge-functions/*` and re-add the function secrets. `supabase/schema/*.sql` reflects the live state where it differs from migrations (e.g. `tg_calendar_sync`).
