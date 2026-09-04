---
name: Gameplay callout separation
description: Chrono Clash preserves in-match callout visuals while suppressing spoken announcer submissions.
---

In-match FX should derive their visual callout text and impact animation directly from the voice cue mapping, while spoken announcer scheduling remains disabled only on the match screen. Ready and result screens may continue using the announcer path.

**Why:** The existing visual callout was emitted by the announcer's speak callback, so disabling gameplay speech without a separate visual path also removed COMBO, ULTIMATE, and related on-screen feedback.

**How to apply:** When changing announcer behavior, verify both channels independently: gameplay voice state must not advance, while callout text, combo UI, impact VFX, battle SFX, and scoring still update.