---
name: Idle visual cleanup
description: Constraints for removing ambient match decoration without affecting gameplay-event effects.
---

For a calm match idle state, suppress both the decorative space-layer tree and fixed page-level pseudo-elements; hiding only named particle children can leave residual specks or scanline texture.

**Why:** Ambient texture was split between nested space layers and page pseudo-elements, so child opacity overrides alone did not fully remove the idle background.

**How to apply:** Keep event-driven renderer effects and state-specific classes intact, and scope ambient suppression to the active match so menus and result screens retain their intended atmosphere.