# Full-bleed glass login revision

## Changes
- Make the entire login viewport one continuous `primary` purple surface with the existing abstract artwork spanning behind all content.
- Place the existing welcome content directly in the left side without a panel, border, or separate background.
- Replace the solid sign-in area with a compact translucent glass panel aligned on the right, using light text and translucent inputs.
- Keep the mobile color logo above the form inside the glass panel and preserve all copy, controls, animations, authentication behavior, and the corrected purple tokens.

## Technical details
- Restructure only the layout and presentation classes in `src/routes/login.tsx`.
- Reuse the existing `.login-panel-artwork` unchanged as a page-level background layer.
- Use standard backdrop blur utilities without manually adding browser-prefixed CSS.

## Validation
- Verify desktop and mobile layouts in the running preview.
- Confirm artwork remains visible around and behind the glass panel, controls stay readable, and no browser errors appear.
