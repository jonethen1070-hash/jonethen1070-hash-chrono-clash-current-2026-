---
name: Swap motion visibility
description: Runtime visibility constraints for Chrono Clash's Canvas gem swaps.
---

Committed swaps must visibly leave the source socket in the first few animation frames while still feeling weighted; curve choice and duration must be tuned together against runtime captures.

**Why:** A 125ms fast-start swap was initially hard to read, while a later 180–220ms sine-weighted exchange made the two-cell handoff readable without feeling abrupt.

**How to apply:** Preserve the existing renderer motion state, pair the selected-gem lift with a smooth ease-in-out exchange and short landing compression, and verify before/during/after frames at 390×844.