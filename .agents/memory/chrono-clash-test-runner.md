---
name: Vitest config isolation
description: Why Chrono Clash uses a separate Vitest config instead of the application Vite config
---

Chrono Clash's application Vite config intentionally requires the artifact
runtime's `PORT` and `BASE_PATH` variables. Unit tests should use the dedicated
Vitest config so they do not try to start the application server or require
artifact-only environment variables.

**Why:** Running Vitest with automatic Vite config discovery made otherwise
valid unit tests fail during startup in environments without the managed
workflow variables.

**How to apply:** Keep the package test script pointed at the dedicated
Vitest config. Use the managed workflow only for browser and preview checks.