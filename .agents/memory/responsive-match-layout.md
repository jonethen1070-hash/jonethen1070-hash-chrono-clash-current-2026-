---
name: Responsive match layout
description: Durable constraints for maintaining the Chrono Clash mobile match viewport.
---

The match screen's active stylesheet must neutralize older flex-era placement rules whenever the layout is converted to an explicit vertical grid. For a square board inside a flexible grid row, anchor the board's height to the row and derive its width from `aspect-ratio`; independently clamping width and height distorts the 8×8 cells on short phones.

**Why:** The game loads several layered stylesheets, and later-looking responsive rules do not automatically remove inherited placement declarations. Runtime computed rectangles exposed the issue more reliably than static inspection alone.

**How to apply:** Keep the player match sections in one explicit seven-row grid, expose nested board content with `display: contents`, keep the board label in-flow, and validate the complete geometry at the target phone heights.