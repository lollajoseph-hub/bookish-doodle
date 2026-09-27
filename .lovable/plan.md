# Candidate comparison view

## What will change
- Add a local **Cards / Compare** switch above presented candidates, defaulting to Cards.
- Keep the existing candidate-card grid unchanged.
- Add a horizontally scrollable comparison table with one stable-width column per candidate and rows for identity, availability, schedule, status, summary, skills, work history, match rationale, and actions.
- Reuse the existing name masking, status visuals, request interview dialog, profile dialog, and parent action handlers.
- Include the same inline rejection reason and optional-notes flow inside each comparison column.

## Technical details
- Create `src/components/candidate-compare-table.tsx`.
- Export the existing availability-label helper from `candidate-card.tsx` so comparison text stays consistent.
- Pass candidate-specific callbacks from `requests.$id.tsx`; shortlist and hire continue through its existing `callRpc`, while reject uses the existing RPC and refresh callback.
- Preserve global action locking while any shortlist or hire request reloads the list.
- Record the new shared comparison component decision in `AGENTS.md`.

## Validation
- Run the TypeScript typecheck.
- Check the request page at desktop and narrow viewport sizes, including horizontal table scrolling and action controls where accessible.
