# ScaleSource Candidate Pool

The client-facing app for ScaleSource hiring clients. Clients sign in to:

- **Hiring requests**: create and track requests for the roles they need filled.
- **Presented candidates**: review the candidates ScaleSource presents for each request in three views: **Cards**, **Review** (one full profile at a time) and **Compare** (side by side).
- **Interviews**: request, confirm or re-propose interview times, join the call, and read meeting notes and recordings afterwards.
- **Shortlist**: everyone the client has shortlisted across their hiring requests.
- **Messages**: talk to the ScaleSource team about a request or a candidate.

Candidates are shown by first name only until the client hires them.

## Stack

- [TanStack Start](https://tanstack.com/start) (file-based routes in `src/routes`)
- React 19
- Tailwind CSS v4 and shadcn/ui components (`src/components/ui`)
- Supabase (auth, database, storage) via `src/lib/supabase.ts`
- GSAP for motion (`src/lib/motion.tsx`)

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun run dev
```

The Supabase client is configured in `src/lib/supabase.ts`. The app talks to the live ScaleSource database, so do not run migrations or write test data against it.

Type-check with `node node_modules/typescript/bin/tsc --noEmit` and lint with `bun run lint`.

_GitHub to Lovable sync last checked: 2026-10-07._
