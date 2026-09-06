---
name: Cascade release timing
description: Non-obvious timing constraints for keeping Chrono Clash gem movement fast without losing visual continuity.
---

Gravity should begin at the impact handoff after the committed swap window, rather than waiting for the entire matched-gem dissolve to finish. Keep the swap-tied impact start long enough for the committed movement and empty sockets to be observable, then let falling overlap the short break phase without duplicating the swap wait.

**Why:** Removing the swap-tied impact window entirely made the mobile cascade contract intermittently miss the swap/empty-socket observation even though the underlying board state was correct. Waiting for the full break duration recreated the sluggish clear → gravity gap.

**How to apply:** When tuning gem motion, keep high-quality swaps within roughly 100–180 ms, use distance-based fall durations with a hard cap, and derive cascade hold from the impact handoff. Do not use the complete gem-die duration as an additional pre-gravity hold.