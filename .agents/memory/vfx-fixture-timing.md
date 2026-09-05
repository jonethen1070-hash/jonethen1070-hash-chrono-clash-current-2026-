---
name: VFX fixture timing
description: Durable guidance for deterministic browser probes of short-lived match and cascade effects.
---

Short-lived renderer poses are easy for browser probes to miss, especially when several cascade clear events share one trigger timestamp. Deterministic fixtures should latch phase counters in renderer inspection state, compare them to a pre-trigger baseline, and choose the first clear event from the current trigger. Cleanup should be verified with a fresh live-state poll after timeline collection rather than trusting the final sampled frame.

**Why:** Canvas frame ordering and retained session FX history can make a test appear flaky even when the renderer is behaving correctly; weakening the cleanup or sequence assertions hides real regressions.

**How to apply:** Use this pattern for future match-size, cascade, or particle-cap browser coverage, while keeping the live particle/shard/shockwave pools required to reach zero before the fixture completes.