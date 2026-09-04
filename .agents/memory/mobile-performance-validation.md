---
name: Mobile performance validation
description: Durable constraints for validating touch responsiveness and frame-loop optimizations in the mobile match preview.
---

Keep the player board on Pointer Events with `touch-action: none`; validate both normal touch completion and cancellation while checking that page scrolling remains at zero. Geometry invalidation should be event-driven, and static canvas atmosphere should be cached rather than rebuilt each frame.

**Why:** Mobile swipe regressions are easy to miss when testing only clicks or desktop mouse input, and repeated layout reads or static gradient creation can compete with the match renderer on smaller devices.

**How to apply:** For future input or rendering changes, use the managed mobile preview, exercise rapid touch swipes plus a cancelled touch, and confirm board bounds, event termination, and scroll position before delivery.