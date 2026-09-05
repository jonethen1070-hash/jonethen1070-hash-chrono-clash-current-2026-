---
name: Power VFX cohesion
description: Hero power effects span Canvas rendering, the legacy board overlay, and late CSS cascade.
---

Keep Energy Burst and Mega Strike cyan/white, and Rewind cyan/blue, across every presentation layer. A Canvas-only change is incomplete if the older board overlay or the final high-specificity CSS still uses generic purple or red.

**Why:** Chrono Clash renders power feedback through both the Canvas board renderer and older overlay/CSS paths; mismatched layers make a polished effect look inconsistent or visually regress during the cast window.

**How to apply:** When changing a hero power’s visual language, search renderer overlay labels, cast classes, board filters, board-slot shadows, and disabled-state colors together. Keep gameplay state, audio routing, and input timing separate from this presentation pass.

Hero power intensity should be concentrated into a short build → peak → collapse envelope; strengthen the impact layers and contrast rather than raising idle brightness.

**Why:** Permanent glow makes Energy Burst and Mega Strike blend into normal gameplay, while bounded peaks preserve readability and make the hero moment feel forceful on mobile.

**How to apply:** Keep wake waves short, use layered rings and directional shards for the peak, let the board/frame catch a brief reflected light, and return all presentation state to the normal material baseline automatically.