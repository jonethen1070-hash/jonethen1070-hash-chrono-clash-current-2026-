---
name: Power activation diagnostics
description: Energy Burst and Mega Strike use a two-step mobile interaction and must be diagnosed through the UI.
---

Treat a direct session.usePower() call as an engine-only probe, not a player-path verification. The real flow is: tap the visible attack button to arm it, then touch a board cell to commit the targeted power.

**Why:** Initial match energy is zero and the attack buttons are disabled until enough energy is earned. A direct test that injects energy and calls session.usePower bypasses both the disabled-button state and the required board-target touch, so it can falsely report success.

**How to apply:** For future power diagnostics, earn energy with real touch swipes, tap the visible button, confirm its armed state, touch a valid board cell, then verify the session result, FX events, Canvas draw evidence, CSS cast state, and post-cast cleanup.