---
name: Short viewport power controls
description: Chrono Clash mobile layout behavior when browser chrome reduces the CSS visual viewport.
---

On mobile browser emulation, the CSS visual viewport can be substantially shorter than the screenshot viewport (for example, 727px inside an 844px device frame). A second in-flow grid row for armed-power cancellation can land below the visible match stage and become unclickable even when the control reports as visible.

**Why:** Match controls must remain reachable during touch targeting; the board and power actions cannot rely on document scrolling because the match shell is intentionally scroll-locked.

**How to apply:** Keep short-viewport power placement explicit and verify the real CSS viewport with Playwright. Preserve the cancel control as a high-priority, pointer-active element within the compact control area rather than allowing it to create an overflowing grid row.

When the cancel control is fixed or hidden, the compact action strip should reserve only the visible button row; a second empty grid track creates a misleading tall dock and can push the transformed controls past the viewport.

**Why:** The short-viewport layout previously combined a fixed control-row height with a reserved cancellation row, leaving the abilities high in the dock and clipping the lower edge after perspective expansion.

**How to apply:** Collapse the inactive second track, size the strip to the actual touch targets, let the board track absorb remaining height, and measure transformed button bottoms with a small in-flow safety correction.