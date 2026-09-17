# Segmented sidebar and candidate role links

## Changes
- Reorganize the sidebar into Dashboard plus labeled Candidate Pool, Clients, Placements, and Admin Toolkit groups, with dividers and compact uppercase labels.
- Keep the entire Admin Toolkit hidden for recruiters; rename the existing Roles link to Manage Roles without changing its page.
- Load active job roles in the sidebar and show All roles plus an indented link for each role under Candidate Pool.
- Make each role link open the candidate pool with its role selected, including correct active styling for both parent and nested links.
- Add typed `role` search handling to the candidate pool and keep the URL synchronized when staff use the existing role chips.

## Technical details
- Reuse the existing `fetchJobRoles` query and shared TanStack Query cache.
- Validate the optional role search parameter with the project’s TanStack Router/Zod pattern.
- Preserve all existing routes, permissions, candidate filtering, and page content.

## Verification
- Check the sidebar and role filtering in the live preview, including admin and recruiter visibility when sessions are available.
- Confirm role links update the URL and selected filter, all links resolve, and the browser console remains clean.
