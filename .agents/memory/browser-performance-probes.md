---
name: Browser performance probes
description: How to interpret Chrono Clash frame and Long Task measurements in this Replit environment.
---

Headless Chromium can report very low animation-frame rates and hundreds of milliseconds of native “program” work for the live canvas app even when a blank page sustains roughly 60 FPS. Buffered Long Task entries can also include startup work after the match is visible.

**Why:** A direct probe initially looked like a renderer regression, but a blank-page baseline and CPU profile showed that most sampled time was browser-native work rather than the instrumented renderer functions.

**How to apply:** Use `window.__chrono.session` for gameplay probes, wait for match startup to settle, compare against a blank-page baseline, observe Long Tasks without buffering, and pair results with a CPU profile before claiming a runtime performance change.