---
name: Motion and input commit contract
description: Renderer timing and swap input ordering constraints for Chrono Clash.
---

Keep the renderer's existing capped animation delta for gem travel, dying overlays, settling, and particle stepping. It keeps short-lived swap and match presentation windows observable and deterministic on mobile; replacing it with a separate wall-clock motion delta can make cascade visibility checks miss the committed presentation.

**Why:** A wall-clock experiment caused the renderer to advance through transient swap/clear states too aggressively in live mobile runs, even though unit tests remained green.

**How to apply:** Preserve the capped `animDt` contract when tuning motion. In the input path, call `primeSwapPose` only after `tryPlayerSwap` accepts the move so rejected or locked swipes cannot leave pending swap IDs or a false committed pose.