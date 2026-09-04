---
name: Swap motion visibility
description: Runtime visibility constraints for Chrono Clash's Canvas gem swaps.
---

Committed swaps must visibly leave the source socket in the first few animation frames; a symmetric ease-in-out curve can pass duration tests while appearing to jump in screenshots because its early displacement is nearly zero.

**Why:** The first runtime capture showed a valid 125ms swap still visually static at roughly 24–40ms, even though renderer interpolation and automated timing tests were active.

**How to apply:** Preserve the existing renderer motion state, but prefer a fast-start ease-out curve for one-cell swaps, pair it with a small grabbed-gem lift and a short landing compression, and verify before/during/after frames at 390×844.