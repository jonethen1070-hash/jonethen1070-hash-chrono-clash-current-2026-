# Chrono Clash — GameUI Reskin Integration Contract

This staging branch is for the GameUI visual skin only.

## Source package
GameUI output archive contains seven assets: chrono-clash-ui-metal-background.jpg, chrono-clash-gems.png, chrono-clash-logo.png, chrono-clash-battle-arena.jpg, chrono-clash-energy-arena.jpg, chrono-clash-red-arena.jpg, chrono-clash-space-arena.jpg.

## Goal
Make Chrono Clash feel like the approved premium cinematic sci-fi reference: dark space/cosmic environments, gunmetal surfaces, cyan/blue energy for the player, crimson/red energy for the rival, violet accents, polished crystalline gems, dramatic but readable mobile UI.

## Hard constraints
- Visual/presentation work only.
- Do not change game rules, board generation, scoring, timers, matchmaking, networking, server authority, replay rejection, freeze/time-shift/rewind behavior, auth, or persistence.
- Preserve all critical DOM IDs.
- Preserve 390x844/mobile-first behavior.
- Preserve the canvas board renderer and gameplay input contract.
- Do not replace CSS/3D-generated gameplay objects with raster images unless the replacement is verified pixel-compatible.
- Do not change the gem atlas contract: 3 columns x 2 rows, row-major cells 0–5, GEM_ORDER = [4,2,1,5,3,0], black-key transparency.
- Do not change existing asset URLs merely to accommodate GameUI.

## Recommended mapping
1. chrono-clash-logo.png -> visual logo artwork only if dimensions/transparent bounds are compatible; otherwise keep text logo and use the asset as a non-invasive visual enhancement.
2. chrono-clash-gems.png -> only after verifying the 3x2 atlas contract exactly.
3. chrono-clash-ui-metal-background.jpg -> premium metal/panel texture layer where it does not reduce readability.
4. chrono-clash-battle-arena.jpg -> match/battle environment background layer.
5. chrono-clash-energy-arena.jpg -> cyan/energy state visual layer.
6. chrono-clash-red-arena.jpg -> rival/danger visual layer.
7. chrono-clash-space-arena.jpg -> splash/menu/cosmic environment layer.

## Required verification
After integration run: npx tsc -b; npm run build; npm test.

Do not claim completion unless all three pass and the visual assets are actually present in the project.

## Layout (binaries present)

Vite serves `public/` at the site root, so live URLs are `/assets/<GameUI-filename>`. Filenames were not renamed.

| GameUI file | Drop-in path | Served URL |
|---|---|---|
| `chrono-clash-logo.png` | `public/assets/chrono-clash-logo.png` | `/assets/chrono-clash-logo.png` |
| `chrono-clash-gems.png` | `public/assets/chrono-clash-gems.png` | `/assets/chrono-clash-gems.png` |
| `chrono-clash-ui-metal-background.jpg` | `public/assets/chrono-clash-ui-metal-background.jpg` | `/assets/chrono-clash-ui-metal-background.jpg` |
| `chrono-clash-battle-arena.jpg` | `public/assets/chrono-clash-battle-arena.jpg` | `/assets/chrono-clash-battle-arena.jpg` |
| `chrono-clash-energy-arena.jpg` | `public/assets/chrono-clash-energy-arena.jpg` | `/assets/chrono-clash-energy-arena.jpg` |
| `chrono-clash-red-arena.jpg` | `public/assets/chrono-clash-red-arena.jpg` | `/assets/chrono-clash-red-arena.jpg` |
| `chrono-clash-space-arena.jpg` | `public/assets/chrono-clash-space-arena.jpg` | `/assets/chrono-clash-space-arena.jpg` |

## Wired consumers (this branch)

This snapshot is CSS + canvas. Screens toggle with `.screen.active`. There is no `#app[data-screen]`, so arena photos are scoped with `#app:has(#screen.active)`.

| Asset | Screen / component | Wiring |
|---|---|---|
| `chrono-clash-logo.png` | `#splash` `#titleMark`; `#menu` `.menu-hero` | `<img class="logo-art">` in `src/main.ts`. Text `h1` kept and visually hidden (`.logo.has-art h1`). `#match .match-brand` stays text. |
| `chrono-clash-gems.png` | canvas `#stage` over `#playerBoard` / `#oppBoard` | Verified 768×768, 3×2, `GEM_ORDER = [4, 2, 1, 5, 3, 0]`. Loaded in `src/ui/gemAtlas.ts` with black-key. `BoardRenderer.drawGem` uses the atlas and falls back to procedural gems if load/size fails. Hit-testing on `#playerBoard` is unchanged. |
| `chrono-clash-ui-metal-background.jpg` | `.power`, `.mode-card`, `.stat`, `.setting-row`, `.sheet-card`, `.game-ctl:not(.primary)`, `.menu-pilot`, `.match-dock` | `::before` overlay, `mix-blend-mode: multiply` (JPEG is mostly white HUD chrome). Not stretched as a button fill. Dock SVG icons unchanged. |
| `chrono-clash-battle-arena.jpg` | `#match`, `#ready` | `#app:has(#match.active) .space-nebula` and ready. Does not paint over board slots. |
| `chrono-clash-energy-arena.jpg` | `#playerCard.fighter.you`, `.energy`, freeze/shift, `#results.win` | Cyan-side overlay + energy/win nebula. `#energyFill` width logic is unchanged. |
| `chrono-clash-red-arena.jpg` | `#oppCard.fighter.rival`, `#match.danger-hud`, `#match.final-critical`, `#results.loss` | Rival/danger overlay + loss/danger nebula. Score logic unchanged. |
| `chrono-clash-space-arena.jpg` | `#splash`, `#menu`, default `.space-layer` | Default `.space-nebula` photo, cropped toward the darker cosmic floor, with existing vignette so the white energy platform does not blow out. |

Intentionally **not** replaced by raster: ability dock modules (`#freeze` / `#timeshift` / `#rewind`), HUD IDs (`playerCard`, `oppCard`, `timer`, `energyFill`, …), `.board-slot` chassis, inline `data:image/svg+xml` dock icons in `studio.css`. Procedural gems remain the fallback.

## Status
Binaries are in `public/assets/`. Visual wiring is in `src/styles/game.css`, `src/main.ts`, `src/ui/renderer.ts`, and `src/ui/gemAtlas.ts`. Gameplay, networking, scoring, auth, and tests are unchanged.
