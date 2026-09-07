---
name: Transient gameplay callouts
description: Priority handling for short-lived in-match feedback that competes with asynchronous gameplay events.
---

Short, user-triggered gameplay feedback such as target cancellation must be protected briefly from lower-priority callouts emitted by an earlier lock, resolve, or snapshot update.

**Why:** The UI and session loop can emit independent status events within the same few frames. Without a short priority window, a stale “LOCKED” or similar event can overwrite the cancellation confirmation even though the underlying state is correct.

**How to apply:** Keep the protection local to the callout presenter, use a short expiry rather than a permanent priority queue, and preserve the existing timer so the protected message still clears normally.