---
name: Audio bed cleanup
description: Audio source lifecycle rules for looping music transitions and scene re-entry.
---

When switching looping music beds, keep sources captured by a pending fade reachable until their disposal runs. A later stop or timer cancellation must still be able to stop and disconnect those sources.

**Why:** Canceling a fade timer after removing its source from the current-bed state can leave an old looping source connected while a new bed starts, producing duplicate music after re-entry.

**How to apply:** Track current and pending-fade file sources separately; dispose both on an immediate stop, and only remove pending references after disposal completes.