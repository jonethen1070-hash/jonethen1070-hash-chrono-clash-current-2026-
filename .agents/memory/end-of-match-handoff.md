---
name: End-of-match handoff
description: Performance constraints for the Chrono Clash transition from final gameplay resolution to results.
---

The end-of-match path should determine the outcome and lock gameplay immediately, allow only a tiny impact window, then hand off to the results layer. Board destruction, power particles, combat bolts, and other transient Canvas effects must be canceled or reduced at that handoff rather than used as a completion barrier.

**Why:** A final cascade or hero-power effect can leave the renderer doing its most expensive work exactly when the results DOM is being created, producing a perceptible freeze before the outcome appears.

**How to apply:** Keep normal gameplay timings unchanged. If end-state timing changes, update the session handoff and renderer cleanup together, preserve finale audio/state events, and keep results decoration limited to short opacity/transform/glow animations.