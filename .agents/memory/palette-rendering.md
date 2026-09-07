---
name: Palette rendering and cascade
description: Durable rules for keeping Chrono Clash's exact match palette visible.
---

Exact match colors can be present in computed styles yet look unchanged when a layered stylesheet applies higher-specificity disabled-state filters or individual border-color declarations. The gem atlas can also visually overpower renderer color constants.

**Why:** Runtime capture showed the palette reaching normal panels while disabled powers retained older top-border colors, opacity, and desaturation; atlas artwork similarly masked otherwise-correct primary color changes.

**How to apply:** Validate the active match, not only the splash or source constants. Check computed styles including pseudo-elements and disabled states, match selector specificity for overrides, and apply restrained exact-primary tinting inside clipped atlas pixels when the source artwork owns most of the visible color. Keep the gameplay palette darker and saturated, with colored cores and rims; broad white overlays should remain small specular accents so blue/cyan, violet/pink, emerald, and gold stay distinct during VFX.