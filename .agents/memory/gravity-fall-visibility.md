---
name: Gravity fall visibility
description: Runtime visibility constraints for Chrono Clash cascade falls and refills.
---

Cascade falls must remain visibly in flight long enough to read as travel through empty sockets. The current fast-feel contract uses distance-scaled timing around 100ms for one cell, 180ms for three cells, roughly 260ms for five cells, and a short hard cap for deeper drops; new-gem spawn positions above the board, a readable impact pause, and a small renderer-owned landing settle are still required.

**Why:** A live four-row cascade could resolve correctly while short, capped fall timing made the destruction-to-landing sequence difficult to distinguish in runtime captures; slower timing made the empty-cell and refill sequence readable.

**How to apply:** Keep board resolution authoritative in the engine, but let the Canvas renderer animate old piece IDs to their final cells, spawn new IDs above the visible board according to destination row, preserve the small column stagger, and verify a 3+ row fall at 390×844.