---
name: Matched swap impact
description: Renderer behavior needed when a valid swap also clears one or both swapped pieces during synchronous cascade resolution.
---

When board resolution is synchronous, a swapped piece may already be absent from the authoritative board—or already be marked dying—by the next render pass. The renderer must preserve the actual committed swap IDs and destination socket coordinates, promote those dying overlays into the swap trajectory, then begin the match charge/break and refill.

**Why:** Inferring swaps from final adjacency misses pieces cleared in the same resolve, and a frame between logical resolution and the visual handoff can otherwise make valid matches pop out before completing the player’s gesture-linked exchange.

**How to apply:** Queue the committed coordinates and gesture pose until the next paint if the visual tile map is not ready; capture IDs before remapping board coordinates; keep refill/fall motion held through the full swap, recognition, and destruction presentation window.