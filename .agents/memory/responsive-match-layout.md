---
name: Responsive match layout
description: Durable constraints for maintaining the Chrono Clash mobile match viewport.
---

The match screen's active stylesheet must neutralize older flex-era placement rules whenever the layout is converted to an explicit vertical grid. For a square board inside a flexible grid row, anchor the board's height to the row and derive its width from `aspect-ratio`; independently clamping width and height distorts the 8×8 cells on short phones.

**Why:** The game loads several layered stylesheets, and later-looking responsive rules do not automatically remove inherited placement declarations. Runtime computed rectangles exposed the issue more reliably than static inspection alone.

**How to apply:** Keep the player match sections in one explicit grid, expose nested board content with `display: contents`, collapse metadata rows that no longer have visible labels, and validate complete geometry at target phone heights.

When the match stage uses perspective, validate transformed `getBoundingClientRect()` values for the fixed bottom control strip, not only its grid height; a visually small `translateZ` can push a compact row past the viewport edge.

**Why:** The layout grid can report a safe row while perspective expands the rendered rectangle by a pixel or two, which is enough to clip the bottom action controls on short mobile screens.

**How to apply:** Keep the action strip within its grid row with a small in-flow visual correction, then assert every visible control's transformed bounds at the supported phone viewport sizes.

The player board should not use broad horizontal overscan to reclaim space. A tiny gutter reclaim is acceptable only when the transformed board bounds are explicitly measured and remain inside both viewport edges.

**Why:** The beveled board's perspective transform expands its rendered rectangle beyond the CSS box, so even a mathematically centered enlargement can clip the right edge by a pixel.

**How to apply:** Keep the square aspect ratio, cap any reclaimed gutter with safe-area math, and measure transformed left/right edges plus width/height at 360px and 390px widths.

When a shared custom property supplies both board width and height, avoid embedding a percentage-based inline term in the shared value; use viewport-based inline math and apply the same resolved size to both axes.

**Why:** A percentage inside a reusable `min()` variable resolves against the property’s axis. Reusing it for height produced a two-pixel outer rectangle mismatch even though the CSS declared a square aspect ratio.

**How to apply:** Derive the mobile size from safe dynamic viewport width and remaining dynamic viewport height, then set `box-sizing: border-box` plus identical width, height, max-width, and max-height on the board frame.

Charged attack buttons reuse the ready-screen `.ready-pulse` class, whose viewport margin can move an in-flow ability out of the match viewport. Mobile match rules must zero the button margin while preserving the pulse animation.

**Why:** Energy changes can add the class after the match has settled, so an initial geometry check can pass while a charged power becomes untappable.

**How to apply:** Validate controls both uncharged and charged at the shortest supported mobile viewport; treat the ability row as normal flow, not a fixed overlay.

Mobile ability content can overflow its button even when the button rectangle is inside the viewport: the match-stage perspective magnifies child `translateZ` layers, and a flex column can shrink the rewind icon before its cost row.

**Why:** Outer action geometry alone missed clipped labels/costs and reduced Rewind artwork on short phones.

**How to apply:** Keep the three controls equal-height, use explicit compact grid rows for their internal content, and validate rendered child bounds—not only button bounds—at short and tall phone sizes.

When the gameplay title strip is removed, keep Audio/Chat/Settings in a short fixed utility row rather than absolutely overlaying the fighter HUD.

**Why:** An absolute control cluster can cover the Rival label, score, or avatar even when its own bounds remain inside the viewport.

**How to apply:** Make the utility row an explicit first grid track, shift the battle/energy/board rows up behind it, and subtract only the utility-row height from mobile board sizing.

The approved HUD visual system should live in one scoped match-active stylesheet loaded after the board-frame layer; legacy HUD rules may remain only as neutralized fallbacks.

**Why:** Chrono Clash has several historical style layers, and distributing a redesign across them recreates cascade conflicts that can affect the board-adjacent layout.

**How to apply:** Keep gameplay selectors under `#match.active`, preserve the existing functional DOM/IDs, and do not move HUD presentation rules into renderer or engine code.
