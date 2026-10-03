# ScaleSource Candidate Review Dashboard

Internal staff app (admins and recruiters) for running ScaleSource's candidate pipeline. It is not client-facing.

## What it covers

- **Candidates**: the candidate pool, profiles, files, and AI resume analysis.
- **Clients**: client companies, their contacts, and placements.
- **Requests and matching**: client hiring requests and the candidate batch for each one.
- **Interview review**: confirming or proposing interview times, completing interviews, and rejecting candidates with a reason.
- **Offer review**: sending contracts and creating placements, which marks the candidate hired.
- **Placements**: active and past placements.
- **Admin tools**: candidate status and recruiter changes, request reshuffles, skills, roles, team, and audit logs.

## Stack

TanStack Start (file-based routing in `src/routes`), React 19, TanStack Query, Tailwind CSS v4, shadcn/ui (`src/components/ui`), Supabase (auth, Postgres, RPCs, storage, edge functions) and GSAP.

## Development

```sh
bun install
bun run dev
```

The app reads its Supabase connection from `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in a local `.env` file. Don't commit credentials. Never use a service-role key in this app.

Type check: `node node_modules/typescript/bin/tsc --noEmit`
