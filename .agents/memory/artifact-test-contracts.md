---
name: Artifact test contracts
description: Durable guidance for keeping Chrono Clash source-contract tests aligned with the current artifact architecture.
---

Source-contract tests should assert current public behavior and artifact ownership rather than historical markup, renderer literals, or deployment assumptions. Media checks need to branch by the catalogued container format, and preview-server checks should be explicitly opt-in when the API belongs to a separate workflow.

**Why:** Chrono Clash visual, audio, and auth refactors left repository-wide tests asserting removed UI identifiers, former palette/renderer strings, WAV headers for an uploaded M4A bed, and a hardcoded preview port.

**How to apply:** When a source contract changes, update the nearest focused assertion to the current exported value or DOM contract. Keep gameplay and audio behavior tests strict, use portable paths for diagnostics, and gate external preview checks behind an explicit preview URL.