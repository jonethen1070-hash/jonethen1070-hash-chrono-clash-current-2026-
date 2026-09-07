---
name: Short viewport power controls
description: Chrono Clash mobile layout behavior when browser chrome reduces the CSS visual viewport.
---

On mobile browser emulation, the CSS visual viewport can be substantially shorter than the screenshot viewport (for example, 727px inside an 844px device frame). A second in-flow grid row for armed-power cancellation can land below the visible match stage and become unclickable even when the control reports as visible.

**Why:** Match controls must remain reachable during touch targeting; the board and power actions cannot rely on document scrolling because the match shell is intentionally scroll-locked.

**How to apply:** Keep short-viewport power placement explicit and verify the real CSS viewport with Playwright. Preserve the cancel control as a high-priority, pointer-active element within the compact control area rather than allowing it to create an overflowing grid row.