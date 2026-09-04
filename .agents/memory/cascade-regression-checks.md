---
name: Cascade regression checks
description: How to keep Chrono Clash cascade visibility checks deterministic and resistant to timing flakes.
---

Use a fixed color matrix that creates the target match and proves the longest surviving piece displacement from its original row. In browser checks, trigger the live session directly after the board has rendered, then sample renderer-owned poses at a faster cadence than the shortest visible tween.

**Why:** Touch-event delivery and 100 ms polling can both skip a short swap window even when the renderer is correct, producing a flaky or misleading regression test.

**How to apply:** Keep touch/cancellation coverage in the input smoke test, while the cascade check asserts accepted swap travel, visible empty sockets/dying pieces, an in-flight fall between `from` and `to`, and a persistent centered idle landing at the mobile viewport.