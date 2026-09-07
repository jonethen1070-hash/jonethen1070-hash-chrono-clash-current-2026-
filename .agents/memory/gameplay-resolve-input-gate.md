---
name: Gameplay resolve input gate
description: Chrono Clash must reject duplicate swaps during visual resolve while keeping utility powers immediately available.
---

The session’s short resolve window is a real input boundary for swaps, not a reason to delay every ability. Targeted powers need valid in-board release coordinates; an off-board release should cancel with visual and haptic feedback rather than fall back to the origin cell.

**Why:** Rapid touch can otherwise commit a second board mutation while the first cascade is still animating, but the existing gameplay flow intentionally allows immediate Mega Strike and Rewind interactions after a swap.

**How to apply:** Keep swap gating tied to the session resolve/busy state, preserve utility-power timing unless a gameplay rule explicitly changes, and keep pointer cleanup scoped to the active pointer ID.

Canceled targeted powers should provide both visible invalid-action feedback and a polite live status, including pointer-cancel/lost-capture recovery, then clear renderer targeting before the next board gesture.

**Why:** Touch releases can leave players unsure whether a power was spent or whether the board is still armed, especially when the release happens outside the board.

**How to apply:** Preserve the cancellation callout/status and inspectable targeting cleanup when changing pointer-capture, targeted-power, or mobile recovery behavior.