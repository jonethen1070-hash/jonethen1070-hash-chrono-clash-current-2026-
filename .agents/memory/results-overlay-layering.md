---
name: Results overlay layering
description: Durable constraints for the Chrono Clash defeat/results screen across short mobile viewports.
---

The results screen must win the screen-layer cascade and paint an opaque outcome surface while the match canvas finishes its brief fade. Its headline and actions must be measured as rendered boxes, not inferred from the flex layout.

**Why:** A broad later `.screen:not(...)` selector can outrank a seemingly specific `#results` background rule, allowing battle HUD and controls to show through. On very short phones, the flex column can shrink the headline line box and clip its glyphs even when the buttons still fit.

**How to apply:** Use a results selector with specificity at least equal to the broad screen rule, keep the outcome background opaque, prevent headline flex shrink, reclaim spacing only under short-height media queries, and assert top-layer hit testing plus title/button bounds at 320×568 and 390×727.