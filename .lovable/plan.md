# Floating messaging widget

## What will change
- Add a persistent “Talk to us” bubble to every signed-in page, with a total unread badge.
- Open a compact bottom-right inbox panel without blocking or navigating away from the current page.
- Support inbox and conversation states, including General, Requests, Candidates, unread markers, back, and close controls.
- Keep `/messages` fully functional for direct and notification links, but remove its header navigation button.
- Make request, candidate, and general message buttons open the widget directly in the relevant conversation.

## Implementation
- Extract inbox loading, enrichment, sorting, relative dates, and unread totals into `useMessagesInbox`, preserving 20-second and focus/visibility refresh.
- Share inbox row types and reusable list/chat pieces between the full Messages page and floating widget.
- Add a widget provider that owns open/closed state and the selected thread target.
- Mount the provider and widget once inside the authenticated app shell.
- Preserve lazy thread creation: viewing a conversation stays read-only, and the first send creates the thread.
- Keep deep-link search handling on `/messages` unchanged.

## Technical details
- Reuse the existing `ChatFeed`, `Composer`, `useThread`, and thread action rules.
- Use existing semantic colors and button components; the panel will be responsive and capped near 80vh.
- Update the project architecture note for the new shared inbox/widget boundary.

## Validation
- Run the TypeScript typecheck and inspect the latest preview build result.
- Verify the widget opens from the bubble and existing request/candidate triggers, switches between list and thread views, and closes cleanly.
- Verify `/messages` still selects deep-linked conversations and that no conversation is created until the first message is sent.
