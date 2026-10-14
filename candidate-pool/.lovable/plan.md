# Staff sender labels in chat

## Implementation
- Extend the shared thread hook to load staff sender profiles after an existing or newly created thread resolves.
- Refresh profiles when a staff message appears from an unknown sender.
- Return the sender profile map and pass it through the shared chat pane into every chat feed.
- Render staff messages as first name plus capitalized role, retaining the current fallback while profile data loads.

## Verification
- Run the TypeScript typecheck and confirm the preview build remains healthy.

## Technical details
- Use the existing `get_thread_sender_profiles(p_thread_id)` RPC without changing database contracts.
- Keep client sender labels and all message creation/realtime behavior unchanged.
