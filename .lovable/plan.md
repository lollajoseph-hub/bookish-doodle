# Login card structure and brand purple correction

## Changes
- Replace the full-viewport two-column login layout with a neutral `primary-soft` page canvas and one centered, bounded, rounded outer card.
- Keep the purple welcome panel and white sign-in area as the two children of that shared card, preserving their copy, artwork, logos, animations, controls, and mobile behavior.
- Remove only the sign-in area’s independent border, rounding, and shadow so the shared outer card owns that treatment.
- Change the primary brand purple to `#431867` across light and dark design tokens, use `#2E1049` for the darker shade, and update related ring/sidebar tokens consistently while retaining `#7A59A3` as the secondary accent.

## Technical details
- Update `src/routes/login.tsx` layout classes only; authentication behavior remains untouched.
- Update semantic variables in `src/styles.css`, including primary, primary-dark, ring, sidebar, sidebar-primary, and sidebar-accent values in both themes.
- Keep `primary-soft`, existing artwork definitions, motion utilities, logo imports, and form content unchanged.

## Validation
- Check desktop and mobile layouts in the running preview.
- Confirm the shared card has visible outer spacing, the mobile layout stacks cleanly, and no browser errors appear.
