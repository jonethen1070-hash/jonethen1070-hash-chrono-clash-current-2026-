---
name: Responsive match layout
description: Durable constraints for maintaining the Chrono Clash mobile match viewport.
---

The match screen's active stylesheet must neutralize older flex-era placement rules whenever the layout is converted to an explicit vertical grid. In particular, legacy child `grid-row` assignments and absolutely positioned board labels can silently create overlap even when the parent grid tracks are correct.

**Why:** The game loads several layered stylesheets, and later-looking responsive rules do not automatically remove inherited placement declarations. Runtime computed rectangles exposed the issue more reliably than static inspection alone.

**How to apply:** Keep the player match sections in explicit header, battle, boards, and controls rows; make the board label in-flow; reserve the responsive gaps and frame allowance in the board-size calculation; validate the complete geometry at the target phone heights.