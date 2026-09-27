# Inline candidate Review view

## What will change
- Add a third **Review** option beside Cards and Compare; Cards remains the default.
- Show one complete candidate profile inline, with Previous/Next controls and a “Candidate X of N” indicator.
- Reset Review to the first candidate whenever the user enters that view.
- Add the current candidate’s existing shortlist, interview, rejection, and hire controls below the profile.

## Refactor
- Move the existing profile data loading and full profile presentation into a shared `CandidateFullProfileView` component.
- Keep `CandidateProfileDialog` as the same modal shell around that shared view, including its fixed-height scrolling and up/down controls.
- Extract the Compare view’s inline action controls into a shared candidate-actions component, then reuse it in both Compare and Review so RPC behavior, locking, rejection details, and interview handling remain aligned.

## Technical details
- Review uses the route’s stable `matches` order and existing `callRpc`, interview dialog, refresh callbacks, and global action lock.
- The inline profile uses normal page flow without modal scroll controls; the dialog enables the existing internal scrolling controls through shared component options.
- Candidate name masking, AI text sanitization, photos, video, work-history pagination, profile messaging, roles, skills, and education remain unchanged.

## Validation
- Run the TypeScript typecheck and inspect the preview build.
- Verify Cards remains the initial view, Review navigation boundaries work, and the existing profile dialog still opens with its original modal layout.
