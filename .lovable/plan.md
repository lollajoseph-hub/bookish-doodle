# Animated request wizard polish

## Build
- Replace the existing top stepper in `/get-started` with a compact recap strip that accumulates completed answers, using readable catalog labels and condensed underlined label/value pairs.
- Add a full-width bottom icon tracker inside the wizard card for Company, Your info, Role, Schedule, and Requirements. Completed/current nodes will fill with the amber-accent treatment, upcoming nodes remain outlined, dotted connectors link them, and a thin bottom-edge progress line animates forward.
- Keep the existing directional slide-and-fade transitions, validation, Back/Continue controls, and request payload unchanged.
- Restyle the shared Role and Engagement type single-choice controls as animated icon cards, so the treatment appears consistently in both `/get-started` and `/new-request`.
- Replace the native desired-start-date input with an accessible inline calendar whose selected day animates into the brand highlight; retain the same `YYYY-MM-DD` form value.
- Upgrade successful submission states: the public wizard will recap every submitted answer and keep its sign-in continuation; the authenticated form will stop auto-redirecting, show the same recap with a brief CSS confetti flourish, and provide a button to open the newly created request.

## Responsive behavior
- Keep recap items horizontally scrollable on narrow screens without wrapping the page.
- Keep the five icon nodes evenly spaced and stable on mobile and desktop, with labels hidden only where space requires it.
- Let choice cards and the calendar collapse cleanly to one column on small screens.

## Validation
- Exercise forward/back navigation and confirm the recap only shows completed-step answers.
- Verify role and engagement selection, date selection, required-field validation, and unchanged public/authenticated submission data.
- Check public and authenticated success screens, including their continuation buttons.
- Test desktop and mobile layouts, reduced-motion behavior, and browser console errors.

## Technical details
- Build from existing ScaleSource semantic colors and Lucide icons; add no new backend fields or migrations.
- Resolve recap IDs to catalog labels and format arrays/dates for display only.
- Use CSS transitions/particles with `prefers-reduced-motion` support; no new image asset is required because the project has no existing celebration illustration.
