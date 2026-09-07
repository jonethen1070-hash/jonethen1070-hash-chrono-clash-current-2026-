---
name: Input/render synchronization
description: Gameplay input must follow the renderer's actual settled gem state, not only the synchronous resolver clock.
---

The match resolver commits a board synchronously, but swaps, dying gems, gravity, and landing settle over later animation frames. The input gate therefore needs both a resolver-derived safety window and a renderer-owned readiness signal; otherwise rapid valid moves can stack moving/dying tiles and VFX even when the session reports itself interactive.

**Why:** Browser probing showed `isInteractive()` could become true while the player renderer still had active motion, especially during long cascades and high VFX. A one-shot swap marker can also outlive its associated tiles, so readiness must inspect active tile motion/dying/settle state rather than treating the marker itself as permanently blocking.

**How to apply:** When changing match timing or renderer handoffs, verify readiness at the exact moment input reopens, keep targeted-power targeting/cancellation available during settling, and test real touch flows as well as direct session calls.