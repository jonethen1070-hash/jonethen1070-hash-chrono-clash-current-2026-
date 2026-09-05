---
name: Mobile performance validation
description: Durable constraints for validating touch responsiveness and frame-loop optimizations in the mobile match preview.
---

Keep the player board on Pointer Events with `touch-action: none`; validate both normal touch completion and cancellation while checking that page scrolling remains at zero. Geometry invalidation should be event-driven, and static canvas atmosphere should be cached rather than rebuilt each frame.

**Why:** Mobile swipe regressions are easy to miss when testing only clicks or desktop mouse input, and repeated layout reads or static gradient creation can compete with the match renderer on smaller devices.

**How to apply:** For future input or rendering changes, use the managed mobile preview, exercise rapid touch swipes plus a cancelled touch, and confirm board bounds, event termination, and scroll position before delivery.

Keep per-crystal key lighting in the cached gem sprite; reserve animated highlight sweeps for selected or armed targets instead of composing fresh gradients for every tile every frame.

**Why:** A full-board material overlay can look harmless on desktop but delay late VFX cleanup on smaller mobile devices by consuming the renderer's frame budget.

**How to apply:** When adding crystal polish, make the static directional shading cacheable and validate the large-cascade cleanup probe after any change to the Canvas draw loop.

For power-target probes specifically, include a touch move before touch end; a bare synthetic start/end can lose the target coordinates even when the power button is visibly armed.

**Why:** The browser harness may deliver pointer-up coordinates differently for a zero-distance touch, producing a false negative where the app correctly refuses an invalid target.

**How to apply:** When validating the two-step power flow, assert the armed state before the touch, dispatch start → small move → end, then verify energy reduction, board change, and post-impact cleanup.