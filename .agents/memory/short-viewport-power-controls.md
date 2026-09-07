---
name: Short viewport power controls
description: Chrono Clash mobile layout behavior when browser chrome reduces the CSS visual viewport.
---

On mobile browser emulation, the CSS visual viewport can be substantially shorter than the screenshot viewport (for example, 727px inside an 844px device frame). A second in-flow grid row for armed-power cancellation can land below the visible match stage and become unclickable even when the control reports as visible.

**Why:** Match controls must remain reachable during touch targeting; the board and power actions cannot rely on document scrolling because the match shell is intentionally scroll-locked.

**How to apply:** Keep short-viewport power placement explicit and verify the real CSS viewport with Playwright. Preserve the cancel control as a high-priority, pointer-active element within the compact control area rather than allowing it to create an overflowing grid row.

When the cancel control is fixed or hidden, the compact action strip should reserve only the visible button row; a second empty grid track creates a misleading tall dock and a beveled spacer below the abilities.

**Why:** The short-viewport layout combines a reduced button row with a full-height control variable and a reserved cancellation row, so the bar can look detached from the board even when the buttons themselves fit.

**How to apply:** Fix the source short-viewport rule by collapsing the inactive track and reducing the control-row variable to the button row plus its intentional padding. Keep the board row content-sized; do not stretch it to push controls toward the viewport bottom.

When compact ability cards move their cost into a dedicated grid rail, override any inherited `min-width: max-content` on the cost node before assigning a bounded track. Otherwise the cost can span into the label while remaining technically inside the button.

**Why:** The legacy power styles intentionally sized cost text to its content, which conflicts with a three-column mobile card and is not caught by simple button-boundary checks.

**How to apply:** Give the cost a finite width/max-width and let the label track ellipsize; verify both element bounds and label/cost separation at short and tall phone viewports.