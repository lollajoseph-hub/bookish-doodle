# Interview and candidate-profile improvements

## Interview scheduling
- Add a focused interview-request dialog shared by request detail and shortlisted views.
- Require both a calendar date and a time before submission; keep the dialog initially blank and convert the local selection to an ISO timestamp.
- Update `MatchRow` and its shared query to include `interview_proposed_at`, then call `client_request_interview` with both `p_match_id` and `p_proposed_at`.
- Show the client’s proposed date/time while a request awaits ScaleSource confirmation in candidate cards and the Interviews page. Confirmed/completed interviews continue using the scheduled date and meeting details.

## Candidate naming and profile
- Introduce one shared candidate-name heading treatment: pre-hire views render italic “Meet” plus the first name; hired views retain the plain full name.
- Apply it to candidate cards, interview cards, and the full-profile title.
- Reorder the profile to: large centered photo, name, headline, divider, availability, optional intro video, roles and skills, work history, education, then a combined final “AI Analysis” section containing summary and highlights.
- Inspect the authenticated live dialog before finalizing the navigation change. Based on the current source, the only slider-like treatment is the work-history vertical rail with circular markers; replace it with simple arrow-led movement and use the same arrow language for pagination.

## History pagination
- Show the first five work-history entries initially, with “See more” revealing up to five more at a time.
- Keep education unpaginated unless live data demonstrates it routinely exceeds five entries.
- Reset pagination whenever a different candidate profile opens.

## Branded surfaces
- Add the existing `card-amber` treatment selectively to primary content cards: candidate cards, request summary/list cards, interview cards, team-member cards, main request forms, success/account cards, and the profile dialog.
- Preserve dashed empty states, lightweight inset panels, popovers, and minor nested surfaces without the heavier branded border.

## Validation
- Run type checks and exercise the authenticated request-detail/shortlist interview dialog with a selected date and time.
- Verify the proposed time appears in request and Interviews views, profile order and pagination work, hired/pre-hire names differ correctly, and no browser errors occur.
- Check desktop and mobile layouts, especially the calendar dialog, large profile photo, long headings, and branded borders.
