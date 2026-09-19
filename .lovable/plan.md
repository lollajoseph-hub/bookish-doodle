# Hybrid request wizard design

## Build
- Restore the calm five-step field layout in `/get-started`: Company, Your info, Role, Schedule, and Requirements retain their existing headings, spacing, validation, and slide/fade transitions.
- Remove only the accumulating recap strip above each active step. Keep the recap component for both submitted-success screens.
- Keep the bottom icon tracker, dotted connectors, amber active/completed states, and animated bottom-edge progress line.
- Keep the animated calendar and selected-date fill.
- Keep both confetti success screens and their answer recaps, with no automatic redirect.

## Shared role controls
- Keep Role and Engagement type as animated icon cards in the shared request fields, so `/get-started` and `/new-request` stay consistent.
- Show Role options three at a time. A `See more` control reveals the next three; continue until all roles are visible. Hide the control once all roles are shown or immediately after a role is selected.
- Always show all three Engagement type cards with no pagination.
- Preserve selected-card scale/color animation, keyboard semantics, form values, validation, and submission behavior.

## Validation
- Check the five-step public flow on desktop and mobile, confirming no recap strip appears during entry.
- Verify Role pagination in both shared-form contexts, all Engagement cards, calendar selection, Back/Continue behavior, and success recap/confetti.
- Confirm type checks and browser console remain clean. The authenticated submit itself remains limited by the disabled QA sign-in helper.
