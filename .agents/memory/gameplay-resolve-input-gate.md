---
name: Gameplay resolve input gate
description: Chrono Clash must reject duplicate swaps during visual resolve while keeping utility powers immediately available.
---

The session’s short resolve window is a real input boundary for swaps, not a reason to delay every ability. Targeted powers need valid in-board release coordinates; an off-board release should cancel with visual and haptic feedback rather than fall back to the origin cell.

**Why:** Rapid touch can otherwise commit a second board mutation while the first cascade is still animating, but the existing gameplay flow intentionally allows immediate Mega Strike and Rewind interactions after a swap.

**How to apply:** Keep swap gating tied to the session resolve/busy state, preserve utility-power timing unless a gameplay rule explicitly changes, and keep pointer cleanup scoped to the active pointer ID.