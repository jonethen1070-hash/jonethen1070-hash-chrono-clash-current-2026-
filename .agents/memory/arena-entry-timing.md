---
name: Arena entry timing
description: Timing rule for starting the decoded Arena file during local match entry.
---

The local Arena entry gesture should unlock/resume audio without starting the lobby bed, set the match state, and call the existing battle bed sync immediately. The next render frame should only observe the already-selected bed.

**Why:** Waiting for the render loop adds an intentional frame/timing delay even when the AAC buffer is already decoded; starting from the same user gesture keeps autoplay authorization and music activation aligned.

**How to apply:** Preserve the existing AudioBus file path and no-fallback guard. Measure source start from the entry gesture; if the buffer is already ready, the expected delay is only event dispatch overhead.