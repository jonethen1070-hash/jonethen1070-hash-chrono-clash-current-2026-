---
name: Browser audio regression testing
description: How to distinguish procedural bed regressions from unrelated oscillator-based UI sounds in browser tests.
---

Instrument browser audio sources by their decoded buffer duration and inspect oscillator frequency signatures instead of asserting a global oscillator count.

**Why:** UI cues can legitimately start oscillators while a file-backed battle bed is active, so a global count produces false failures. Battle fallback voices have stable frequency signatures that can be excluded directly.

**How to apply:** Assert the uploaded battle source starts only after decode, has loop metadata, and is stopped before re-entry; separately assert the known battle fallback frequencies never start.