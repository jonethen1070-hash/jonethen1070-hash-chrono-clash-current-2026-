---
name: VFX clock independence
description: Timing rule for Chrono Clash Canvas particles and crystal shards.
---

Transient gem VFX must use the renderer's measured delta time for both travel and lifetime decay; frame-based decrements make effects change speed across 30, 60, and 120 FPS.

**Why:** Mobile rendering cadence can vary during cascades and browser previews, so fixed per-frame particle motion makes lifetime and trajectory inconsistent even when gameplay timing is correct.

**How to apply:** Pass the renderer delta into particle/shard stepping, convert legacy per-frame velocities with a bounded frame scale, and keep the animation's lifetime in seconds.