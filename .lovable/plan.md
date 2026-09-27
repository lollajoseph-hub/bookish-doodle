# Candidate reasoning and skill-gap display

## What will change
- Add a compact “Why this candidate” section to candidate cards when a match reason exists.
- Load required request skills and each presented candidate’s recorded skills alongside the existing request and match data.
- Show matched and missing required skills in both Cards and Compare views.
- Keep the existing profile skills untouched; the new display will use the relational skill records for accurate request-to-candidate comparison.

## Implementation
- Pass a request-level required-skill list and a candidate-id keyed skill lookup from the request detail page.
- Add shared skill-gap types/calculation/display in the candidate card module so Cards and Compare use identical matching logic and badge treatment.
- Match skill names case-insensitively while preserving the request skill names for display.
- Hide the skill-match section when the request has no required skills; show matched and missing groups only when each has entries.
- Preserve existing card ordering, actions, Review mode, profile dialog, and backend behavior.

## Validation
- Run the TypeScript typecheck and inspect the preview build.
- Verify the default Cards view shows match reasons and skill gaps, while Compare shows the same matched/missing split.
