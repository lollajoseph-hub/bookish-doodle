# Candidate Pool design and UX pass

## Build
- Recreate the Candidate Review Dashboard login composition using the existing ScaleSource artwork styles, with Candidate Pool copy and all current password, magic-link, and new-company flows preserved.
- Import the official white ScaleSource wordmark into this project and use it on the login screen and in the existing top navigation.
- Split public onboarding into five steps: Company, Your info, Role, Schedule, and Requirements.
- Refactor shared request fields into Role, Schedule, and Requirements groups while keeping the authenticated New Request page as one stacked form.
- Add direction-aware slide-and-fade transitions, a progress fill, and animated completed-step checkmarks with reduced-motion support.

## Validation
- Check the login and onboarding screens at desktop and mobile sizes.
- Verify forward/back navigation, per-step validation, and the unchanged final request payload.
- Capture screenshots of the finished login and wizard.

## Technical details
- Re-upload the dashboard wordmark into this project's own asset storage rather than referencing another project's asset pointer.
- Keep all existing backend calls and business rules unchanged.
