---
name: Swap motion visibility
description: Runtime visibility constraints for Chrono Clash's Canvas gem swaps.
---

Committed swaps must visibly leave the source socket in the first few animation frames while still feeling weighted; curve choice and duration must be tuned together against runtime captures.

**Why:** A 125ms fast-start swap was initially hard to read, while a later 180–220ms sine-weighted exchange made the two-cell handoff readable without feeling abrupt.

**How to apply:** Preserve the existing renderer motion state, pair the selected-gem lift with a smooth ease-in-out exchange and short landing compression, and verify before/during/after frames at 390×844.

Actual swap pieces should be tagged at commit time; do not infer swaps from adjacent coordinate changes because one-cell cascade falls can also be adjacent.

**Why:** A neighbor-based renderer heuristic caused the magnetic swap curve to leak onto one-cell gravity moves during the cascade regression pass.

**How to apply:** Capture the two committed piece IDs in the renderer commit hook, apply swap easing only to those IDs, and leave all other moved pieces on the gravity path.